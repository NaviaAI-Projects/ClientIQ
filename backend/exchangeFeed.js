/**
 * ClientIQ — Exchange Volume auto-fetch (Layer 2 scaffold)
 * -----------------------------------------------------------------------------
 * Reads the feed URLs saved on the MIS Settings page (settings table keys:
 *   nse_eq_cash_url, nse_eq_futures_url, nse_eq_options_url,
 *   mcx_comm_futures_url, mcx_comm_options_url)
 * fetches each, parses the day-wise turnover, and upserts into `exchange_volume`
 * (source='feed'; options = PREMIUM turnover; traded_value in ₹).
 *
 * IMPORTANT — this is a SCAFFOLD to tune on the server:
 *  • NSE blocks plain server-side requests (needs browser cookies/headers); a fetch
 *    from the VPS will often return HTML or 401/403. When that happens fetchAll()
 *    reports it clearly ("looks like an HTML page, not a data file") instead of
 *    silently writing nothing — that's your signal to point the URL at the real
 *    downloadable data file, or use the file-upload importer for that source.
 *  • The workbook/CSV parser is the SAME logic as scripts/importExchangeVolume.js,
 *    so any source that returns an .xlsx/.xls/.csv in those layouts parses correctly.
 *  • MCX parsing is stubbed until a sample file is provided.
 * -----------------------------------------------------------------------------
 */
const https = require('https');
const http  = require('http');
const XLSX  = require('xlsx');
const pool  = require('./db');

const CR = 1e7;
const num = v => { if (v == null) return 0; const s = String(v).replace(/,/g, '').trim(); if (s === '' || s === '-') return 0; const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {           // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);           // 01-Apr-26
  if (m) { const y = m[3].length === 2 ? 2000 + (+m[3]) : +m[3]; const mo = MON[m[2].toLowerCase()]; if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`; }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);             // 01 Apr 2026 (MCX)
  if (m) { const mo = MON[m[2].toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// GET a URL with browser-like headers; follow up to 4 redirects; 20s timeout.
function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch (e) { return reject(new Error('invalid URL')); }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        return resolve(fetchUrl(next, redirects + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, contentType: String(res.headers['content-type'] || ''), buffer: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// Detect the workbook layout by its header (same rules as the upload importer).
function detectKind(sheets) {
  const head = sheets[0].slice(0, 4).flat().map(x => String(x).toLowerCase()).join(' | ');
  if (head.includes('securities traded')) return 'nse_cm';
  if (head.includes('index futures') || head.includes('stock options')) return 'nse_fo';
  if (head.includes('options premium turnover') && head.includes('futures turnover')) return 'bse_deriv';
  if (head.includes('mcx') || head.includes('commodity')) return 'mcx';
  return null;
}

// MCX publishes its daily bulletin as an HTML <table> saved with an .xls extension,
// so a real MCX file looks like HTML. NSE/BSE landing pages are ALSO HTML but carry no
// data — so we only try to read HTML as a workbook when it looks like MCX commodity
// content, and otherwise reject it (that's the "point at the direct download" case).
const looksMcx = s => /mcx|commodity|comdty|multi commodity/i.test(s);

// Turn a fetched buffer into { rows:[[date,seg,cr]], kind, note }.
function parseBuffer(buffer, contentType, url) {
  const text = buffer.toString('utf8');
  const head = text.slice(0, 1024).trim().toLowerCase();
  const isHtml = /^\s*<(!doctype|html)/.test(head) || contentType.includes('text/html');

  if (isHtml && !looksMcx(text)) {
    return { rows: [], kind: null, note: 'response looks like an HTML page, not a data file — point this URL at the direct .xlsx/.csv download (or use the upload importer for this source)' };
  }

  let sheets;
  try {
    if (isHtml) {
      // MCX HTML-table bulletin: SheetJS reads the <table> when given the string.
      const wb = XLSX.read(text, { type: 'string', cellDates: true });
      sheets = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, cellDates: true, raw: false, defval: '' }));
    } else if (/\.csv(\?|$)/i.test(url) || contentType.includes('csv')) {
      const rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(','));
      sheets = [rows];
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      sheets = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, cellDates: true, raw: false, defval: '' }));
    }
  } catch (e) { return { rows: [], kind: null, note: `could not parse as workbook/csv: ${e.message}` }; }

  const kind = isHtml ? 'mcx' : detectKind(sheets);
  if (!kind) return { rows: [], kind: null, note: 'fetched a file but its columns did not match any known exchange layout' };

  const acc = {};
  const add = (d, seg, val) => { if (d && val > 0) (acc[d] = acc[d] || {})[seg] = (acc[d][seg] || 0) + val; };

  if (kind === 'mcx') {
    // MCX bulletin: values in LAKHS (×1e5). commfut = SUM of FUT* rows' "Total Value";
    // commopt = SUM of OPT* rows' "Premium Value". We locate columns by HEADER text (not
    // fixed offsets) so a layout shift doesn't silently mis-read, and find the trade date
    // anywhere on the sheet ("as on / dated DD Mon YYYY").
    const LAKH = 1e5;
    // MCX puts the report date in a page heading that often sits OUTSIDE the <table>
    // (so SheetJS drops it). Recover it from the raw HTML as a fallback.
    let pageDate = null;
    const dm = text.replace(/<[^>]+>/g, ' ').match(/(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2,4})/);
    if (dm) pageDate = toDate(`${dm[1]} ${dm[2]} ${dm[3].length === 2 ? '20' + dm[3] : dm[3]}`);
    for (const rows of sheets) {
      let hdr = -1, cTot = -1, cPrem = -1, cProd = -1;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const cells = rows[i].map(x => String(x).toLowerCase());
        const tot  = cells.findIndex(c => /total\s*value/.test(c));
        const prem = cells.findIndex(c => /premium\s*(turnover|value)/.test(c));
        const prod = cells.findIndex(c => /product|instrument|segment|type/.test(c));
        if (tot >= 0 || prem >= 0) { hdr = i; cTot = tot; cPrem = prem; cProd = prod >= 0 ? prod : 0; break; }
      }
      // Date: prefer one inside the sheet; fall back to the page-heading date.
      let dt = null;
      for (const r of rows) { for (const c of r) { const d = toDate(c); if (d) { dt = d; break; } } if (dt) break; }
      if (!dt) dt = pageDate;
      if (hdr < 0 || !dt) continue;
      for (let i = hdr + 1; i < rows.length; i++) {
        const label = String(rows[i][cProd] || rows[i][0] || '').trim().toUpperCase();
        if (/^FUT/.test(label) && cTot >= 0)  add(dt, 'commfut', num(rows[i][cTot])  * LAKH);
        if (/^OPT/.test(label) && cPrem >= 0) add(dt, 'commopt', num(rows[i][cPrem]) * LAKH);
      }
    }
    if (!Object.keys(acc).length) return { rows: [], kind, note: 'MCX file recognised but no FUT*/OPT* rows with Total/Premium Value columns were found — check the report layout' };
    const rows = [];
    for (const d of Object.keys(acc)) for (const [seg, v] of Object.entries(acc[d])) if (v > 0) rows.push([d, seg, Math.round(v * 100) / 100]);
    return { rows, kind, note: null };
  }

  // NSE/BSE workbook layouts — values in ₹Cr, stored as ₹ (×1e7).
  for (const rows of sheets) for (const r of rows) {
    const d = toDate(r[0]); if (!d) continue;
    if (kind === 'nse_cm')      { if (num(r[4]) > 0) add(d, 'eqcash', num(r[4]) * CR); }
    else if (kind === 'nse_fo') { if (num(r[2]) || num(r[6])) { add(d, 'eqfut', (num(r[2]) + num(r[4]) + num(r[6])) * CR); add(d, 'eqopt', (num(r[8]) + num(r[11])) * CR); } }
    else if (kind === 'bse_deriv') { add(d, 'eqfut', num(r[2]) * CR); add(d, 'eqopt', num(r[4]) * CR); }
  }
  const rows = [];
  for (const d of Object.keys(acc)) for (const [seg, v] of Object.entries(acc[d])) if (v > 0) rows.push([d, seg, Math.round(v * 100) / 100]);
  return { rows, kind, note: null };
}

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS exchange_volume (
    trade_date DATE NOT NULL, segment VARCHAR(12) NOT NULL, traded_value NUMERIC NOT NULL,
    source VARCHAR(16) DEFAULT 'manual', updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (trade_date, segment, source))`);
  await pool.query(`ALTER TABLE exchange_volume ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'manual'`);
  await pool.query(`
    DO $$
    DECLARE has_src_pk boolean;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'exchange_volume'::regclass AND i.indisprimary AND a.attname = 'source'
      ) INTO has_src_pk;
      IF NOT has_src_pk THEN
        DELETE FROM exchange_volume;
        ALTER TABLE exchange_volume DROP CONSTRAINT IF EXISTS exchange_volume_pkey;
        ALTER TABLE exchange_volume ADD PRIMARY KEY (trade_date, segment, source);
      END IF;
    END $$;
  `);
  // Drop any leftover 2-column UNIQUE constraint/index on (trade_date, segment) (e.g.
  // exchange_volume_date_seg_uq) — it would still block a second exchange per (date,segment).
  await pool.query(`
    DO $$
    DECLARE c record;
    BEGIN
      FOR c IN
        SELECT con.conname FROM pg_constraint con
        WHERE con.conrelid = 'exchange_volume'::regclass AND con.contype = 'u'
          AND (SELECT array_agg(a.attname ORDER BY a.attname)
               FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey))
              = ARRAY['segment','trade_date']::name[]
      LOOP EXECUTE format('ALTER TABLE exchange_volume DROP CONSTRAINT %I', c.conname); END LOOP;
      FOR c IN
        SELECT i.relname AS conname
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = 'exchange_volume'::regclass AND x.indisunique AND NOT x.indisprimary
          AND (SELECT array_agg(a.attname ORDER BY a.attname)
               FROM pg_attribute a WHERE a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey))
              = ARRAY['segment','trade_date']::name[]
      LOOP EXECUTE format('DROP INDEX IF EXISTS %I', c.conname); END LOOP;
    END $$;
  `);
}

// Rows are [date, segment, value, source]. Per-exchange source keeps NSE/BSE/MCX in
// separate rows so segments fed by two exchanges (eqfut/eqopt from NSE + BSE) are summed
// on read rather than one overwriting the other.
async function upsert(rows) {
  let n = 0;
  for (const [d, seg, val, source] of rows) {
    if (!(val > 0)) continue;
    await pool.query(
      `INSERT INTO exchange_volume (trade_date, segment, traded_value, source) VALUES ($1,$2,$3,$4)
       ON CONFLICT (trade_date, segment, source) DO UPDATE SET traded_value = EXCLUDED.traded_value, updated_at = now()`,
      [d, seg, val, source || 'feed']);
    n++;
  }
  return n;
}

// One field per exchange. Each field may hold ONE OR MORE URLs (one per line, or
// comma-separated) — e.g. NSE publishes Cash and Derivatives as two separate reports,
// so both NSE URLs go in the NSE box. `allowed` limits which segments an exchange may
// contribute, so a stray file can't write a segment that doesn't belong to it. Segments
// that several exchanges feed (NSE eqfut + BSE eqfut) are SUMMED, not overwritten.
const FEEDS = [
  ['nse_feed_url', 'NSE', ['eqcash', 'eqfut', 'eqopt']],
  ['bse_feed_url', 'BSE', ['eqfut', 'eqopt']],
  ['mcx_feed_url', 'MCX', ['commfut', 'commopt']],
];

// Fetch every configured URL, parse, and upsert PER EXCHANGE (one row per date/segment/source)
// so NSE and BSE both persist for the segments they share — summed on read, not overwritten.
async function fetchAll() {
  await ensureTable();
  const s = await pool.query(`SELECT key, value FROM settings WHERE key = ANY($1)`, [FEEDS.map(f => f[0])]);
  const cfg = {}; s.rows.forEach(r => { cfg[r.key] = r.value; });

  const acc = {};                                   // source -> date -> segment -> ₹ (summed within one exchange)
  const addAcc = (src, d, seg, v) => { ((acc[src] = acc[src] || {})[d] = acc[src][d] || {})[seg] = (acc[src][d][seg] || 0) + v; };

  const results = [];
  for (const [key, label, allowed] of FEEDS) {
    const urlList = String(cfg[key] || '').split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    if (!urlList.length) { results.push({ source: label, key, ok: false, note: 'no URL configured' }); continue; }
    for (const url of urlList) {
      try {
        const { status, contentType, buffer } = await fetchUrl(url);
        // An auth/anti-bot block (NSE/BSE frequently do this to non-browser GETs) comes back
        // as 401/403/407 or a 5xx — report it plainly so the user knows to use file upload
        // for that source rather than chasing a "0 rows" that looks like a parse problem.
        if (status >= 400) {
          results.push({ source: label, url, ok: false, http: status,
            note: `blocked or unavailable (HTTP ${status}) — this exchange likely needs a browser session; upload the file for this source instead` });
          continue;
        }
        const { rows, kind, note } = parseBuffer(buffer, contentType, url);
        const kept = rows.filter(r => allowed.includes(r[1]));   // only segments this exchange may feed
        kept.forEach(([d, seg, v]) => addAcc(label, d, seg, v));
        results.push({ source: label, url, ok: kept.length > 0, http: status, kind, rows_parsed: kept.length, note });
      } catch (e) {
        results.push({ source: label, url, ok: false, error: e.message });
      }
    }
  }

  // Flatten to per-source rows [date, segment, ₹, source].
  const rows = [];
  for (const src of Object.keys(acc))
    for (const d of Object.keys(acc[src]))
      for (const [seg, v] of Object.entries(acc[src][d])) if (v > 0) rows.push([d, seg, Math.round(v * 100) / 100, src]);
  const totalRows = rows.length ? await upsert(rows) : 0;

  const ran_at = new Date().toISOString();
  console.log(`[exchange-feed] fetchAll @ ${ran_at}: wrote ${totalRows} rows —`, JSON.stringify(results));
  return { ran_at, total_rows: totalRows, results };
}

module.exports = { fetchAll, parseBuffer, ensureTable, upsert };
