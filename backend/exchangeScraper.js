/**
 * ClientIQ — Exchange Volume auto-fetch via headless browser (Playwright)
 * -----------------------------------------------------------------------------
 * WHY a browser and not a plain HTTP GET:
 *   NSE / BSE / MCX serve their turnover data from anti-bot-protected endpoints
 *   (Akamai on NSE; ASP.NET session on BSE; app API on MCX). A datacenter-IP GET
 *   from the VPS is blocked. A real headless Chromium loads the page like a user,
 *   picks up the session cookies, and can call the SAME-ORIGIN JSON the page uses
 *   (via page.evaluate → fetch) or read the rendered table — which works.
 *
 * WHAT it writes:
 *   exchange_volume(trade_date, segment, traded_value ₹, source='scrape')
 *   segments: eqcash, eqfut, eqopt (NSE), eqfut/eqopt (BSE), commfut/commopt (MCX)
 *   Options = PREMIUM turnover. ₹ values (Cr × 1e7; MCX Lakhs × 1e5).
 *
 * FIRST-RUN TUNING (important):
 *   The exact daily field names on NSE's snapshot endpoints and the BSE/MCX table
 *   columns can only be confirmed against a live POST-MARKET-CLOSE response. Run
 *   this once on the VPS with DIAGNOSE=1 (see scripts/scrapeDiagnose.js): it writes
 *   the raw payload/columns per source to the log so the mapping below can be
 *   locked in. Until then, parsing is best-effort + key-heuristic and each source
 *   reports what it saw.
 * -----------------------------------------------------------------------------
 */
const pool = require('./db');

const CR   = 1e7;    // ₹ Crore  → ₹
const LAKH = 1e5;    // ₹ Lakh   → ₹
const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// Parse "07-Sep-2026" / "07 Sep 2026" / "2026-09-07" / "07/09/2026" → YYYY-MM-DD.
function toISO(v) {
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                         if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{2,4})/); if (m) { const mo=MONTHS[m[2].toLowerCase()]; const y=m[3].length===2?2000+ +m[3]:+m[3]; if(mo) return `${y}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`; }
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);               if (m) { const y=m[3].length===2?2000+ +m[3]:+m[3]; return `${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`; }
  return null;
}
const num = v => { if (v==null) return 0; const s=String(v).replace(/,/g,'').trim(); if(s===''||s==='-') return 0; const n=parseFloat(s); return isNaN(n)?0:n; };

// ── Launch a headless Chromium. Playwright must be installed on the server
//    (see the install notes). Falls back to a clear error if it isn't. ─────────
async function launch() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { throw new Error('playwright is not installed on the server — run: npm i playwright && npx playwright install --with-deps chromium'); }
  // NSE/BSE/MCX sit behind Akamai bot-detection that blocks plain headless Chromium
  // (Access Denied / stall). To get past it we (1) drive the REAL installed Chrome via
  // channel:'chrome' when available, (2) default to HEADED (set SCRAPER_HEADLESS=true to
  // force headless — needs xvfb on a Linux VPS), (3) apply stealth init scripts per page.
  const headless = process.env.SCRAPER_HEADLESS !== 'false';   // headless by default (confirmed to pass Akamai); set SCRAPER_HEADLESS=false to watch a visible window
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--disable-http2'];
  try { return await chromium.launch({ headless, channel: 'chrome', args }); }   // real Chrome
  catch (e) { return await chromium.launch({ headless, args }); }                 // bundled Chromium fallback
}

// Navigate with a retry and a settle wait, so async-rendered tables have loaded.
async function gotoSafe(page, url) {
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      // 'commit' resolves as soon as the response starts (NSE's live-ticker pages never
      // reach networkidle/full-load), then we give the SPA a moment to render.
      await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      await page.waitForTimeout(4000);
      return;
    } catch (e) { lastErr = e; await page.waitForTimeout(2000); }
  }
  throw lastErr;
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 900 },
  });
  // Stealth: mask the tells Akamai checks for (webdriver flag, missing chrome runtime,
  // empty plugins/languages). Not bulletproof, but clears the common headless checks.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  return page;
}

// Heuristic mapper for an array of NSE daily records → {date, turnoverCr}.
// NSE snapshot rows are flat objects; we find the date field and a turnover field
// by key name so a minor key rename doesn't silently break it.
function pickField(obj, re) {
  for (const k of Object.keys(obj)) if (re.test(k)) return obj[k];
  return undefined;
}

// Recent months to pull daily data for (current + previous 2), and the Indian
// financial-year label NSE keys its drill on (Apr–Mar; FY2026-2027 = Apr'26→Mar'27).
function nseTargets() {
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const fyFrom = (m >= 3) ? y : y - 1;                 // April (m=3) starts the FY
  const fyLabel = `${fyFrom}-${fyFrom + 1}`;
  const months = [];
  for (let k = 0; k < 3; k++) { const d = new Date(Date.UTC(y, m - k, 1)); months.push({ mon: MON[d.getUTCMonth()], yy: String(d.getUTCFullYear()).slice(2), yyyy: String(d.getUTCFullYear()) }); }
  return { fyLabel, months };
}

// ── NSE: drive the Business Growth page's own drill (FY → month) in a real browser
//    and intercept the daily JSON the page fetches. Confirmed endpoint shape:
//      /api/historicalOR/{cm|fo}/tbg/daily?month=Aug&year=26
//    CM row: { F_TIMESTAMP:"31-Aug-2026", CDT_TRADES_VALUES: <₹Cr turnover> }. ─────
async function scrapeNSE(page, segKind /* 'cm' | 'fo' */) {
  const { fyLabel, months } = nseTargets();
  const payloads = [];
  // Capture every daily response the page fires while we drill.
  page.on('response', async (resp) => {
    if (!/\/tbg\/daily/.test(resp.url())) return;
    try { const j = await resp.json(); if (j && Array.isArray(j.data)) payloads.push({ url: resp.url(), data: j.data }); } catch (e) {}
  });

  await gotoSafe(page, `https://www.nseindia.com/market-data/business-growth-${segKind}-segment`);
  await page.waitForTimeout(3500);                     // anti-bot cookies + first render

  const steps = [];
  // Drill the financial year (click the FY link, e.g. "2026-2027").
  await page.evaluate(fy => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === fy); if (a) a.click(); }, fyLabel);
  steps.push(`FY ${fyLabel}`);
  await page.waitForTimeout(3000);

  // Click each month link. CM labels months "Aug-26", FO labels them "Aug-2026" — match
  // either with a regex on the month prefix. A real click fires the daily XHR (intercepted
  // above) AND primes the session so the remaining months can be fetched directly.
  for (const t of months) {
    const clicked = await page.evaluate(mon => {
      const re = new RegExp('^' + mon + '-\\d{2,4}$', 'i');
      const a = [...document.querySelectorAll('a')].find(x => re.test((x.textContent || '').trim()));
      if (a) { a.click(); return a.textContent.trim(); }
      return null;
    }, t.mon);
    if (clicked) { steps.push(`click ${clicked}`); await page.waitForTimeout(2600); continue; }
    // Fallback direct fetch — FO uses a 4-digit year param, CM a 2-digit one.
    const yr = segKind === 'fo' ? t.yyyy : t.yy;
    try {
      const j = await page.evaluate(async ([seg, mon, y]) => {
        const r = await fetch(`/api/historicalOR/${seg}/tbg/daily?month=${mon}&year=${y}`, { headers: { Accept: 'application/json' }, credentials: 'include' });
        return await r.json();
      }, [segKind, t.mon, yr]);
      if (j && Array.isArray(j.data) && j.data.length) { payloads.push({ url: `direct ${t.mon}-${yr}`, data: j.data }); steps.push(`direct ${t.mon}-${yr}`); }
      else steps.push(`no data ${t.mon}`);
    } catch (e2) { steps.push(`fail ${t.mon}`); }
  }

  const rows = [];
  const seenKeys = new Set();
  let firstRec = null;
  for (const p of payloads) for (let rec of p.data) {
    if (rec && rec.data) rec = rec.data;               // rows are wrapped: { data: {…} }
    if (!rec || typeof rec !== 'object') continue;
    if (!firstRec) firstRec = rec;
    Object.keys(rec).forEach(k => seenKeys.add(k));
    const d = toISO(rec.F_TIMESTAMP || rec.date || pickField(rec, /timestamp|_dt|date/i));
    if (!d) continue;
    if (segKind === 'cm') {
      // CM daily: CDT_TRADES_VALUES = turnover in ₹ Cr.
      const to = num(rec.CDT_TRADES_VALUES != null ? rec.CDT_TRADES_VALUES : pickField(rec, /trades?_?value|turnover/i));
      if (to > 0) rows.push([d, 'eqcash', Math.round(to * CR)]);
    } else {
      // FO daily (₹ Cr): eqfut = index+vol+stock futures VAL; eqopt = index+stock options
      // PREMIUM VAL (confirmed field names). Fall back to key-heuristics if the shape shifts.
      let fut = num(rec.Index_Futures_VAL) + num(rec.Volume_Futures_VAL) + num(rec.Stock_Futures_VAL);
      let opt = num(rec.Index_Options_PREM_VAL) + num(rec.Stock_Options_PREM_VAL);
      if (!fut) fut = num(pickField(rec, /fut.*val/i));
      if (!opt) opt = num(pickField(rec, /opt.*prem|prem.*val/i));
      if (fut > 0) rows.push([d, 'eqfut', Math.round(fut * CR)]);
      if (opt > 0) rows.push([d, 'eqopt', Math.round(opt * CR)]);
    }
  }
  // de-dup (date,seg) keeping last
  const seen = {}; const dedup = [];
  for (const r of rows) { const k = r[0] + '|' + r[1]; if (!(k in seen)) { seen[k] = dedup.length; dedup.push(r); } else dedup[seen[k]] = r; }
  return {
    rows: dedup,
    diag: { fyLabel, months: months.map(m => `${m.mon}-${m.yy}`), steps, payloads: payloads.length, seenKeys: [...seenKeys], firstRec },
    note: dedup.length ? null : 'NSE drill produced no rows — see diag.steps/seenKeys/firstRec (FO field names finalize from firstRec)',
  };
}

// ── BSE: Day Wise Market Summary. Set the date range, Submit, read the table. ─
async function scrapeBSE(page, fromISO, toISOd) {
  await gotoSafe(page, 'https://www.bseindia.com/markets/derivatives/derireports/deriarchivesum');
  // The summary table loads async after the default date range is applied.
  await page.waitForSelector('table tr td', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const table = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tr')].map(tr => [...tr.querySelectorAll('th,td')].map(td => td.innerText.trim()));
    return rows.filter(r => r.length >= 4);
  });
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 600) : ''));
  // Expected columns: Date | Contracts | Futures Turnover(Cr) | Options Notional(Cr) | Options Premium(Cr) | OI | OI Value
  const rows = [];
  for (const r of table) {
    const d = toISO(r[0]); if (!d) continue;
    const fut = num(r[2]);           // Futures Turnover ₹Cr
    const optPrem = num(r[4]);       // Options Premium Turnover ₹Cr
    if (fut > 0) rows.push([d, 'eqfut', Math.round(fut * CR)]);
    if (optPrem > 0) rows.push([d, 'eqopt', Math.round(optPrem * CR)]);
  }
  return { rows, diag: { sample_rows: table.slice(0, 5), bodyText }, note: rows.length ? null : 'BSE table not parsed — confirm column order from diag.sample_rows' };
}

// ── MCX: load the Historical Data page (to clear Akamai + get cookies), then call its
//    own JSON endpoint directly. Confirmed:
//      GET /GetHistoricalData?GroupBy=D&Segment=ALL&CommodityHead=ALL&Commodity=ALL
//          &InstrumentName=ALL&Startdate=YYYY-MM-DD&EndDate=YYYY-MM-DD
//    → {IsSuccess, Data:{ Data:[ {Date:"25 Aug 2026", Instrumentname:"FUTCOM"|"OPTFUT"|…,
//       TotalValue, PremiumTurnover, …} ] }}. Values in LAKHS.
//    commfut = Σ TotalValue for FUT* instruments; commopt = Σ PremiumTurnover for OPT*. ──
async function scrapeMCX(page) {
  await gotoSafe(page, 'https://www.mcxindia.com/market-data/historical-data');
  await page.waitForTimeout(2000);                     // establish Akamai cookies

  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);   // ~45-day window
  let j = null, err = null;
  try {
    j = await page.evaluate(async ([s, e]) => {
      const p = new URLSearchParams({ GroupBy: 'D', Segment: 'ALL', CommodityHead: 'ALL', Commodity: 'ALL', InstrumentName: 'ALL', Startdate: s, EndDate: e });
      const r = await fetch('/GetHistoricalData?' + p.toString(), { headers: { Accept: 'application/json' }, credentials: 'include' });
      return await r.json();
    }, [start, end]);
  } catch (e) { err = e.message; }

  const recs = (j && j.Data && Array.isArray(j.Data.Data)) ? j.Data.Data : [];
  const acc = {};
  for (const r of recs) {
    const d = toISO(r.Date); if (!d) continue;
    const instr = String(r.Instrumentname || '').toUpperCase();
    if (/^FUT/.test(instr)) { const v = num(r.TotalValue) * LAKH; if (v > 0) { const k = d + '|commfut'; acc[k] = (acc[k] || 0) + v; } }
    if (/^OPT/.test(instr)) { const v = num(r.PremiumTurnover) * LAKH; if (v > 0) { const k = d + '|commopt'; acc[k] = (acc[k] || 0) + v; } }
  }
  const rows = [];
  for (const [k, v] of Object.entries(acc)) { const [d, seg] = k.split('|'); if (v > 0) rows.push([d, seg, Math.round(v)]); }
  return {
    rows,
    diag: { start, end, api_ok: !!(j && j.IsSuccess), returned: recs.length, err },
    note: rows.length ? null : `MCX /GetHistoricalData returned no usable rows (api_ok=${!!(j && j.IsSuccess)}, recs=${recs.length}${err ? ', err=' + err : ''})`,
  };
}

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS exchange_volume (
    trade_date DATE NOT NULL, segment VARCHAR(12) NOT NULL, traded_value NUMERIC NOT NULL,
    source VARCHAR(16) DEFAULT 'manual', updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (trade_date, segment))`);
  await pool.query(`ALTER TABLE exchange_volume ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'manual'`);
}
async function upsert(rows) {
  let n = 0;
  for (const [d, seg, val] of rows) {
    if (!d || !(val > 0)) continue;
    await pool.query(
      `INSERT INTO exchange_volume (trade_date, segment, traded_value, source) VALUES ($1,$2,$3,'scrape')
       ON CONFLICT (trade_date, segment) DO UPDATE SET traded_value = EXCLUDED.traded_value, source = 'scrape', updated_at = now()`,
      [d, seg, val]);
    n++;
  }
  return n;
}

// ── Orchestrator: scrape every source, sum per (date,segment), upsert once. ───
// opts.diagnose = true → don't write; just return the raw diagnostics so the
// field mapping can be finalized against a live post-close response.
async function runScrape(opts = {}) {
  const diagnose = !!opts.diagnose;
  await ensureTable();
  const results = [];
  const acc = {};
  const add = (d, seg, v) => { (acc[d] = acc[d] || {})[seg] = (acc[d][seg] || 0) + v; };

  const browser = await launch();
  try {
    const jobs = [
      { source: 'NSE Cash', run: p => scrapeNSE(p, 'cm') },
      { source: 'NSE F&O',  run: p => scrapeNSE(p, 'fo') },
      { source: 'BSE',      run: p => scrapeBSE(p) },
      { source: 'MCX',      run: p => scrapeMCX(p) },
    ];
    for (const job of jobs) {
      const page = await newPage(browser);
      try {
        const { rows, diag, note } = await job.run(page);
        if (!diagnose) rows.forEach(([d, seg, v]) => add(d, seg, v));
        results.push({ source: job.source, ok: rows.length > 0, rows_parsed: rows.length, note, diag });
      } catch (e) {
        results.push({ source: job.source, ok: false, error: e.message });
      } finally {
        await page.context().close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  let total = 0;
  if (!diagnose) {
    const flat = [];
    for (const d of Object.keys(acc)) for (const [seg, v] of Object.entries(acc[d])) if (v > 0) flat.push([d, seg, Math.round(v * 100) / 100]);
    total = flat.length ? await upsert(flat) : 0;
  }
  const ran_at = new Date().toISOString();
  console.log(`[exchange-scrape] ${diagnose ? 'DIAGNOSE ' : ''}@ ${ran_at}: wrote ${total} rows —`, JSON.stringify(results, null, diagnose ? 2 : 0));
  return { ran_at, total_rows: total, diagnose, results };
}

module.exports = { runScrape };
