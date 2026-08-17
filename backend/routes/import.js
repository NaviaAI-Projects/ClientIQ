const express = require('express');
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db');
const auth    = require('../middleware/auth');
const fs      = require('fs');
const upload  = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });
const audit = require('../utils/audit');
const BATCH_SIZE  = 2000;
const TRADE_BATCH = 2500; // 2500 rows × 21 cols = 52500 params (under the 65535 bind limit) — ~12× fewer INSERT round-trips than the old 200

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const yr  = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${mon}-${day}`;
  }
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const m2 = s.match(/^(\d{1,2})[\/\-]([a-zA-Z]{3})[\/\-](\d{2,4})$/);
  if (m2) {
    const day = m2[1].padStart(2, '0');
    const mon = months[m2[2].toLowerCase()] || '01';
    const yr  = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return `${yr}-${mon}-${day}`;
  }
  if (!isNaN(val) && Number(val) > 40000) {
    const d = new Date((Number(val) - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

function extractUCC(partyStr) {
  if (!partyStr) return null;
  const m = String(partyStr).match(/\[(\d+)\]/);
  return m ? m[1] : null;
}

// ── 90 TRADING-DAY cutoff ────────────────────────────────────────────────────
// Returns the date that is N *trading* days back from the most recent trade date
// — counting only weekdays that are NOT exchange holidays (trading_calendar).
// The most-recent-trade-date anchor (not wall-clock) makes retention data-driven,
// so a gap in uploads never over-purges. Returns null when fewer than N trading
// days of history exist yet (→ nothing is purged until the window is full).
async function tradingDayCutoff(dbClient, n = 90) {
  try {
    const r = await dbClient.query(`
      WITH anchor AS (SELECT MAX(trade_date) AS d FROM trades),
      td AS (
        SELECT gs::date AS d
        FROM anchor,
             LATERAL generate_series(anchor.d - INTERVAL '400 days', anchor.d, INTERVAL '1 day') gs
        WHERE anchor.d IS NOT NULL
          AND EXTRACT(DOW FROM gs) NOT IN (0, 6)                                  -- skip Sun(0)/Sat(6)
          AND gs::date NOT IN (SELECT holiday_date FROM trading_calendar)         -- skip holidays
      ),
      ranked AS (SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC) AS rn FROM td)
      SELECT d FROM ranked WHERE rn = $1
    `, [n]);
    return r.rows[0]?.d || null;   // the Nth trading day back; null if < N exist
  } catch (e) {
    // trading_calendar not created yet → don't purge (safe)
    return null;
  }
}

// ── WHOLE-MONTH GRADUATION with missing-file gate ────────────────────────────
// A month graduates (its detail is purged — it's already rolled into the monthly
// summary continuously) ONLY when BOTH hold:
//   (a) the whole month is older than the 90-trading-day cutoff, AND
//   (b) it is COMPLETE — every trading day in it has all 5 segment files
//       (nse_cm, nse_fo, bse_cm, bse_fo, mcx) recorded in import_log.
// Incomplete months are NOT purged; their missing (date, file) pairs are returned
// so the compliance team can be alerted. Weekends & trading_calendar holidays are
// never expected. Returns { cutoff, graduated:[YYYY-MM], blocked:[{month,missing:[]}] }.
// BSE segments excluded — NSE files carry BSE-exchange trades too, so no separate BSE
// file is uploaded. (Re-add 'bse_cm','bse_fo' here + in the VALUES list below to require them.)
const SEGMENT_FILES = ['nse_cm', 'nse_fo', 'mcx'];
async function retentionSweep(dbClient) {
  const cutoff = await tradingDayCutoff(dbClient, 90);
  if (!cutoff) return { cutoff: null, raw_days_purged: 0, graduated: [], blocked: [] };

  // ── STAGE 1 — raw `trades`: per-DAY purge ─────────────────────────────────
  // The moment a single trade date is older than the 90-trading-day window it is
  // dropped from the raw tier. daily_trades already holds that day's consolidated
  // per-UCC rows and client_monthly_summary holds the month, so the raw fills are
  // redundant past 90 trading days. Anchored to MAX(trade_date) — deleting old rows
  // never moves that anchor. `< cutoff` keeps exactly the last 90 trading days of raw.
  const rawDel = await dbClient.query(`DELETE FROM trades WHERE trade_date < $1`, [cutoff]);

  // ── STAGE 2 — daily detail tables: whole-MONTH graduation ─────────────────
  // Detail-tier months whose LAST day is older than the cutoff (fully aged out).
  // daily_trades / daily_ledger / holdings_summary / mtf_interest keep a whole month
  // of detail until the ENTIRE month clears the cutoff, then the month is purged
  // (already rolled into client_monthly_summary / mtf_monthly). Raw `trades` is NOT
  // in this stage anymore — it is handled per-day in Stage 1 above.
  const monthsRes = await dbClient.query(`
    SELECT DISTINCT TO_CHAR(trade_date,'YYYY-MM') AS m
    FROM daily_trades
    WHERE (date_trunc('month', trade_date) + INTERVAL '1 month - 1 day')::date < $1
    ORDER BY m
  `, [cutoff]);

  const graduated = [], blocked = [];
  for (const { m } of monthsRes.rows) {
    // trading days of month m that are missing one or more of the 5 segment files
    const miss = await dbClient.query(`
      WITH days AS (
        SELECT gs::date AS d
        FROM generate_series(($1||'-01')::date,
                             (($1||'-01')::date + INTERVAL '1 month - 1 day')::date,
                             INTERVAL '1 day') gs
        WHERE EXTRACT(DOW FROM gs) NOT IN (0,6)
          AND gs::date NOT IN (SELECT holiday_date FROM trading_calendar)
      ),
      segs(file_type) AS (VALUES ('nse_cm'),('nse_fo'),('mcx'))
      SELECT to_char(d.d,'YYYY-MM-DD') AS d, s.file_type AS f
      FROM days d CROSS JOIN segs s
      WHERE NOT EXISTS (
        SELECT 1 FROM import_log il
        WHERE il.trade_date = d.d AND il.file_type = s.file_type
          AND il.status IN ('success','partial'))
      ORDER BY d.d, s.file_type
    `, [m]);
    if (miss.rows.length === 0) graduated.push(m);
    else blocked.push({ month: m, missing: miss.rows.map(r => ({ date: r.d, file: r.f })) });
  }

  // Purge ONLY the complete, graduated months from every detail table (monthly
  // summary already holds them). Incomplete months are left untouched.
  if (graduated.length) {
    const tables = [['daily_trades','trade_date'],
                    ['daily_ledger','ledger_date'], ['holdings_summary','holding_date'],
                    ['mtf_interest','from_date']];
    for (const [t, col] of tables) {
      await dbClient.query(`DELETE FROM ${t} WHERE TO_CHAR(${col},'YYYY-MM') = ANY($1)`, [graduated]);
    }
  }
  return { cutoff, raw_days_purged: rawDel.rowCount, graduated, blocked };
}

// ════════════════════════════════════════════════════════════════════════════
// computeDailyTrades — rebuild the daily_trades analytics for a set of trade dates
// PURELY from the raw `trades` table (no dependency on a just-parsed upload). This
// is the "compute" half of the ingest→compute split: the trade upload only inserts
// raw rows (fast); this runs once afterward (via /rebuild-daily) to aggregate.
// Idempotent — safe to re-run for any dates. brokerage_earned is never touched.
// ════════════════════════════════════════════════════════════════════════════
async function computeDailyTrades(dbClient, dateArr) {
  if (!dateArr || !dateArr.length) return { dates: 0 };

  // (a) Ensure the analytics columns exist (idempotent).
  await dbClient.query(`
    ALTER TABLE daily_trades
      ADD COLUMN IF NOT EXISTS total_trades INTEGER   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_qty    NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS turnover     NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS eq_cash_to   NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS eq_fut_to    NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comm_to      NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS options_to   NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS call_to      NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS put_to       NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cnc_to       NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mis_to       NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS other_to     NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cnc_trades   INTEGER   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mis_trades   INTEGER   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS buy_val      NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sell_val     NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS buy_qty      NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS sell_qty     NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC   DEFAULT 0,
      ADD COLUMN IF NOT EXISTS symbols      JSONB     DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS commission_earned NUMERIC DEFAULT 0
  `);

  // (b) Per-client-per-day summary rebuilt from raw trades (MIS/CNC, realized P&L,
  //     per-symbol JSONB, buy/sell). Same query the import used, keyed by these dates.
  await dbClient.query(`
    INSERT INTO daily_trades (
      ucc, trade_date, total_trades, total_qty, turnover,
      eq_cash_to, eq_fut_to, comm_to, options_to, call_to, put_to,
      cnc_to, mis_to, other_to, cnc_trades, mis_trades,
      buy_val, sell_val, buy_qty, sell_qty, realized_pnl, symbols, updated_at)
    WITH sym AS (
      SELECT ucc, trade_date, trading_symbol AS s,
        MAX(UPPER(COALESCE(option_type,''))) AS ot,
        MAX(COALESCE(product_type,''))       AS pt,
        MAX(UPPER(COALESCE(exchange,'')))    AS ex,
        SUM(trade_qty)::float    AS q,
        COUNT(*)::int            AS n,
        SUM(traded_value)::float AS to_,
        SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN traded_value ELSE 0 END)::float AS bv,
        SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN traded_value ELSE 0 END)::float AS sv,
        SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN trade_qty    ELSE 0 END)::float AS bq,
        SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN trade_qty    ELSE 0 END)::float AS sq,
        SUM(lots)::float AS lots,
        SUM(lots * COALESCE(lot_size,1))::float AS qty   -- total traded QUANTITY (units) = Σ lots × lot_size
      FROM trades
      WHERE trade_date = ANY($1::date[])
      GROUP BY ucc, trade_date, trading_symbol
    )
    SELECT
      ucc, trade_date,
      SUM(n)::int AS total_trades,
      SUM(q)      AS total_qty,
      SUM(to_)    AS turnover,
      SUM(CASE WHEN pt = 'CM' THEN to_ ELSE 0 END) AS eq_cash_to,
      SUM(CASE WHEN pt = 'FO' AND (ot IS NULL OR ot = '') THEN to_ ELSE 0 END) AS eq_fut_to,
      SUM(CASE WHEN pt = 'CO' THEN to_ ELSE 0 END) AS comm_to,
      SUM(CASE WHEN ot IN ('CE','PE') THEN to_ ELSE 0 END) AS options_to,
      SUM(CASE WHEN ot = 'CE' THEN to_ ELSE 0 END) AS call_to,
      SUM(CASE WHEN ot = 'PE' THEN to_ ELSE 0 END) AS put_to,
      SUM((bv + sv) - LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS cnc_to,
      SUM(LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS mis_to,
      0::numeric AS other_to,
      SUM(CASE WHEN LEAST(bq, sq) = 0 THEN n ELSE 0 END)::int AS cnc_trades,
      SUM(CASE WHEN LEAST(bq, sq) > 0 THEN n ELSE 0 END)::int AS mis_trades,
      SUM(bv) AS buy_val, SUM(sv) AS sell_val, SUM(bq) AS buy_qty, SUM(sq) AS sell_qty,
      SUM(CASE WHEN bq > 0 AND sq > 0
               THEN ((sv / NULLIF(sq,0)) - (bv / NULLIF(bq,0))) * LEAST(bq, sq)
               ELSE 0 END) AS realized_pnl,
      jsonb_agg(jsonb_build_object(
        's', s, 'ot', ot, 'pt', pt, 'ex', ex,
        'bv', bv, 'sv', sv, 'bq', bq, 'sq', sq, 'to', to_, 'n', n, 'lots', lots, 'qty', qty)) AS symbols,
      NOW()
    FROM sym
    GROUP BY ucc, trade_date
    ON CONFLICT (ucc, trade_date) DO UPDATE SET
      total_trades = EXCLUDED.total_trades, total_qty = EXCLUDED.total_qty, turnover = EXCLUDED.turnover,
      eq_cash_to = EXCLUDED.eq_cash_to, eq_fut_to = EXCLUDED.eq_fut_to, comm_to = EXCLUDED.comm_to,
      options_to = EXCLUDED.options_to, call_to = EXCLUDED.call_to, put_to = EXCLUDED.put_to,
      cnc_to = EXCLUDED.cnc_to, mis_to = EXCLUDED.mis_to, other_to = EXCLUDED.other_to,
      cnc_trades = EXCLUDED.cnc_trades, mis_trades = EXCLUDED.mis_trades,
      buy_val = EXCLUDED.buy_val, sell_val = EXCLUDED.sell_val,
      buy_qty = EXCLUDED.buy_qty, sell_qty = EXCLUDED.sell_qty,
      realized_pnl = EXCLUDED.realized_pnl, symbols = EXCLUDED.symbols, updated_at = NOW()
  `, [dateArr]);

  // (c) Mirror *_to into the *_turnover columns the analytics pages read, and set the
  //     top instrument (by turnover, from the symbols JSONB) + call/put ratio. This
  //     replaces the old parse-time `grouped` upsert so it is 100% trades-driven.
  await dbClient.query(`
    UPDATE daily_trades dt SET
      eq_cash_turnover         = eq_cash_to,
      eq_fo_turnover           = eq_fut_to,
      commodity_fo_turnover    = comm_to,
      options_premium_turnover = options_to,
      call_put_ratio = CASE WHEN (call_to + put_to) > 0
                            THEN ROUND(call_to / (call_to + put_to) * 100, 2) ELSE NULL END,
      top_instrument = (SELECT e->>'s' FROM jsonb_array_elements(dt.symbols) e
                        ORDER BY (e->>'to')::numeric DESC NULLS LAST LIMIT 1),
      top_instrument_type = (SELECT CASE WHEN e->>'ot' IN ('CE','PE') THEN e->>'ot'
                                         WHEN (e->>'s') ILIKE '%FUT%' THEN 'FUT' ELSE 'EQ' END
                             FROM jsonb_array_elements(dt.symbols) e
                             ORDER BY (e->>'to')::numeric DESC NULLS LAST LIMIT 1)
    WHERE dt.trade_date = ANY($1::date[])
  `, [dateArr]);

  // (d) Commission (clearing charges) = Σ(segment turnover × per-segment rate% ÷ 100),
  //     effective-dated from settings. Own column; brokerage_earned untouched.
  const setRows = (await dbClient.query('SELECT key, value FROM settings')).rows;
  const S = {}; setRows.forEach(r => { S[r.key] = r.value; });
  const LABEL_TO_SEG = {
    'Equity cash': 'eq_cash', 'Equity futures': 'eq_futures', 'Equity options': 'eq_options',
    'Commodity futures': 'comm_futures', 'Commodity options': 'comm_options'
  };
  const STD = {
    rate_eq_cash: 'eq_cash', rate_eq_futures: 'eq_futures', rate_eq_options: 'eq_options',
    rate_comm_futures: 'comm_futures', rate_comm_options: 'comm_options'
  };
  const periods = [];
  for (const [key, seg] of Object.entries(STD)) {
    if (S[key] == null || S[key] === '') continue;
    periods.push({ seg, rate: parseFloat(S[key]) || 0,
      from: S[key + '_from'] || '2000-01-01', to: (S[key + '_to'] || '') || null });
  }
  try {
    const customKeys = S['custom_rate_keys'] ? JSON.parse(S['custom_rate_keys']) : [];
    for (const ck of customKeys) {
      const seg = LABEL_TO_SEG[S[ck + '_segment']];
      if (!seg || S[ck] == null || S[ck] === '') continue;
      periods.push({ seg, rate: parseFloat(S[ck]) || 0,
        from: S[ck + '_from'] || '2000-01-01', to: (S[ck + '_to'] || '') || null });
    }
  } catch (e) { /* ignore malformed custom_rate_keys */ }

  await dbClient.query(`UPDATE daily_trades SET commission_earned = 0 WHERE trade_date = ANY($1::date[])`, [dateArr]);
  if (periods.length) {
    const params = [dateArr];
    const valueSql = periods.map(p => {
      const i = params.length; params.push(p.seg, p.rate, p.from, p.to);
      return `($${i + 1}::text,$${i + 2}::numeric,$${i + 3}::date,$${i + 4}::date)`;
    }).join(',');
    await dbClient.query(`
      WITH rate_periods (segment, rate, eff_from, eff_to) AS ( VALUES ${valueSql} ),
      seg AS (
        SELECT ucc, trade_date,
          CASE
            WHEN product_type = 'CM' THEN 'eq_cash'
            WHEN product_type = 'FO' AND UPPER(COALESCE(option_type,'')) IN ('CE','PE') THEN 'eq_options'
            WHEN product_type = 'FO' THEN 'eq_futures'
            WHEN product_type = 'CO' AND UPPER(COALESCE(option_type,'')) IN ('CE','PE') THEN 'comm_options'
            WHEN product_type = 'CO' THEN 'comm_futures'
            ELSE NULL END AS segment,
          traded_value
        FROM trades t
        WHERE trade_date = ANY($1::date[])
      ),
      commis AS (
        SELECT s.ucc, s.trade_date, SUM(s.traded_value * r.rate / 100.0) AS commission
        FROM seg s
        JOIN LATERAL (
          SELECT rate FROM rate_periods rp
          WHERE rp.segment = s.segment
            AND rp.eff_from <= s.trade_date
            AND (rp.eff_to IS NULL OR s.trade_date <= rp.eff_to)
          ORDER BY rp.eff_from DESC LIMIT 1
        ) r ON true
        WHERE s.segment IS NOT NULL
        GROUP BY s.ucc, s.trade_date
      )
      UPDATE daily_trades dt SET commission_earned = COALESCE(c.commission, 0)
      FROM commis c WHERE dt.ucc = c.ucc AND dt.trade_date = c.trade_date
    `, params);
  }

  // (e) Roll the touched months up into the permanent client_monthly_summary archive.
  await dbClient.query(`
    INSERT INTO client_monthly_summary (ucc, month_year, eq_cash_to, eq_fo_to, comm_to, opt_prem_to, brokerage, commission_earned, trade_days)
    SELECT ucc,
      TO_CHAR(trade_date, 'YYYY-MM') AS month_year,
      SUM(eq_cash_turnover),
      SUM(eq_fo_turnover),
      SUM(commodity_fo_turnover),
      SUM(options_premium_turnover),
      SUM(COALESCE(brokerage_earned,0)),
      SUM(COALESCE(commission_earned,0)),
      COUNT(DISTINCT trade_date)
    FROM daily_trades
    WHERE trade_date = ANY($1::date[])
       OR TO_CHAR(trade_date,'YYYY-MM') = ANY(
            SELECT DISTINCT TO_CHAR(d::date,'YYYY-MM') FROM UNNEST($1::date[]) d)
    GROUP BY ucc, TO_CHAR(trade_date, 'YYYY-MM')
    ON CONFLICT (ucc, month_year) DO UPDATE SET
      eq_cash_to        = EXCLUDED.eq_cash_to,
      eq_fo_to          = EXCLUDED.eq_fo_to,
      comm_to           = EXCLUDED.comm_to,
      opt_prem_to       = EXCLUDED.opt_prem_to,
      brokerage         = EXCLUDED.brokerage,
      commission_earned = EXCLUDED.commission_earned,
      trade_days        = EXCLUDED.trade_days
  `, [dateArr]);

  // (f) Refresh clients.last_trade_date from the raw trades (trades-driven).
  await dbClient.query(`
    UPDATE clients c SET last_trade_date = GREATEST(c.last_trade_date, x.d), is_active = true, updated_at = NOW()
    FROM (SELECT ucc, MAX(trade_date) AS d FROM trades WHERE trade_date = ANY($1::date[]) GROUP BY ucc) x
    WHERE c.ucc = x.ucc
  `, [dateArr]);

  return { dates: dateArr.length };
}

function getSegment(exchg, instrName) {
  const e = String(exchg || '').toUpperCase().trim();
  const i = String(instrName || '').toUpperCase().trim();
  if (e === 'MCX' || e === 'NCDEX') {
    if (i === 'OPTFUT' || i === 'OPTIDX' || i === 'OPTSTK') return 'COMM_OPT';
    return 'COMM_FUT';
  }
  if (e === 'NFO' || e === 'BFO') {
    if (i === 'OPTIDX' || i === 'OPTSTK') return 'EQ_OPT';
    return 'EQ_FUT';
  }
  return 'EQ_CASH';
}

const FILE_LABELS = {
  client_master: 'Client Master',
  nse_cm: 'NSE Cash', bse_cm: 'BSE Cash', nse_fo: 'NSE F&O', bse_fo: 'BSE F&O', mcx: 'MCX',
  trade: 'Trade File',
  brokerage: 'Brokerage File',
  ledger: 'Ledger File', holdings: 'Holdings File', mtf: 'MTF File', bhavcopy: 'Bhavcopy',
  mtm_prices: 'CM MTM Prices'
};

// The Ledger date comes from the FILE NAME. Accepts, in order:
//   DD-MM-YYYY (any of - _ / . separators)  e.g. "Ledger_17-07-2026.csv"
//   DDMMYYYY   (8 digits)                    e.g. "Ledger_17072026.xlsx"
//   DDMMYY     (6 digits, 20YY)              e.g. "SUBTRIAL_270726_1.xlsx" → 27 Jul 2026
// Returns 'YYYY-MM-DD' or null.
function parseLedgerDateFromName(name) {
  const s = String(name || '');
  let dd, mm, yyyy, m;
  if ((m = s.match(/(\d{2})[-_/.](\d{2})[-_/.](\d{4})/)))                { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; }
  else if ((m = s.match(/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/)))          { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; }
  else if ((m = s.match(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/)))          { dd = +m[1]; mm = +m[2]; yyyy = 2000 + +m[3]; }
  else return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');           // reject impossible dates like 31-02-2026
  if (isNaN(d.getTime()) || d.getUTCDate() !== dd) return null;
  return iso;
}

// The Holdings file carries no date inside it, so its holding_date comes from the FILE NAME.
// Expected format: DDMMYYYY (8 digits, separators - _ / or . optional) somewhere in the name,
// e.g. "SYMPHONY_colISIN_19052026.csv" → 19 May 2026. Returns 'YYYY-MM-DD' or null.
function parseHoldingDateFromName(name) {
  const s = String(name || '');
  const m = s.match(/(\d{2})[-_/.]?(\d{2})[-_/.]?(\d{4})/);
  if (!m) return null;
  const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');           // reject impossible dates like 31022026
  if (isNaN(d.getTime()) || d.getUTCDate() !== dd) return null;
  return iso;
}

// Trade slots → the exchange + segment their file must carry inside (Xchg / Sgmt columns).
const TRADE_SLOTS = {
  nse_cm: { xchg: 'NSE', sgmt: 'CM' }, bse_cm: { xchg: 'BSE', sgmt: 'CM' },
  nse_fo: { xchg: 'NSE', sgmt: 'FO' }, bse_fo: { xchg: 'BSE', sgmt: 'FO' },
  mcx:    { xchg: 'MCX', sgmt: 'CO' },
};

// Validate a file's format for its chosen slot BEFORE any duplicate/other check, so a wrong
// file (e.g. a Trade file dropped into the Client Master slot) always reports "Invalid file
// format" instead of a misleading duplicate popup. Returns { ok, detail }.
function validateFileFormat(file_type, filePath, originalname) {
  const norm  = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();
  const fname = (originalname || filePath || '').toLowerCase();
  try {
    // Pipe-delimited text types
    if (file_type === 'ledger' || file_type === 'holdings') {
      // NEW Ledger format: xlsx trial-balance with a header row [UCC, Account Name, Closing Debit, Closing Credit].
      if (file_type === 'ledger' && (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls'))) {
        const wb = XLSX.readFile(filePath); const sh = wb.Sheets[wb.SheetNames[0]];
        const arr = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' });
        const hdr = (arr.find(r => Array.isArray(r) && norm(r[0]) === 'UCC') || []).map(c => norm(c));
        const ok = hdr[0] === 'UCC' && hdr.some(c => c.startsWith('CLOSING'));
        return ok ? { ok: true }
                  : { ok: false, detail: 'Ledger (xlsx) must have a header row with columns: UCC, Account Name, Closing Debit, Closing Credit.' };
      }
      let lines;
      if (file_type === 'holdings' && (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls'))) {
        const wb = XLSX.readFile(filePath); const sh = wb.Sheets[wb.SheetNames[0]];
        lines = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' })
          .map(r => (Array.isArray(r) ? String(r[0] ?? '') : String(r ?? '')).trim()).filter(l => l.includes('|'));
      } else {
        lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.replace(/\r$/, '').trim()).filter(Boolean);
      }
      const need = file_type === 'ledger' ? 23 : 12;
      const ok = lines.length > 0 && lines.slice(0, 25).every(l => l.split('|').length === need)
        && String(lines[0].split('|')[0]).trim().length > 0;   // UCC may be alphanumeric (e.g. BAA00110)
      return ok ? { ok: true } : { ok: false, detail: file_type === 'ledger'
        ? 'Base Capital / Ledger must be pipe-delimited ( | ) with 23 columns (UCC in column 1).'
        : 'Holdings must be pipe-delimited ( | ) with 12 columns (UCC in column 1).' };
    }
    // Spreadsheet / CSV types
    const wb  = XLSX.readFile(filePath, { raw: true, dense: true });
    const sh  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    if (file_type === 'client_master') {
      const h = (rows[0] || []).map(norm);
      return h.includes('UCC') ? { ok: true } : { ok: false, detail: 'Client Master must have a UCC and Client Name header row.' };
    }
    if (TRADE_SLOTS[file_type]) {
      const h = (rows[0] || []).map(norm);
      const headerOk = h[0] === 'TRADDT' && h[1] === 'BIZDT' && h[2] === 'SGMT' && h[4] === 'XCHG'
        && h[18] === 'CLNTID' && h[24] === 'BUYSELLIND';
      if (!headerOk) return { ok: false, detail: 'Trade file must be the 46-column exchange export (TradDt, BizDt, Sgmt, Src, Xchg … ClntId … BuySellInd …).' };
      const want = TRADE_SLOTS[file_type];
      const d = rows[1] || [];
      const gotS = String(d[2] ?? '').trim().toUpperCase();
      // Exchange is NOT checked: NSE trade files now bundle BSE-exchange rows too, so a CM/FO
      // file may lead with either exchange. The SEGMENT (Sgmt: CM/FO/CO) is the real slot key,
      // and each row is stored under its own exchange during import.
      const ok = (!gotS || gotS === want.sgmt);
      return ok ? { ok: true } : { ok: false, detail: `This looks like a ${gotS || '?'} file, but this slot expects the ${want.sgmt} segment. Please upload the correct file here.` };
    }
    if (file_type === 'brokerage') {
      const ncols = sh['!ref'] ? (XLSX.utils.decode_range(sh['!ref']).e.c + 1) : 0;
      const hIdx  = rows.findIndex(r => norm(r[0]) === 'UCC'); const h = hIdx >= 0 ? rows[hIdx] : [];
      const ok = hIdx >= 0 && ncols === 31 && norm(h[1]).startsWith('CLIENTNAME') && norm(h[4]).startsWith('TRADEDATE');
      return ok ? { ok: true } : { ok: false, detail: 'Brokerage must be the ALL-SEGMENTS export (31 columns with UCC, Client Name and Trade Date).' };
    }
    if (file_type === 'mtf') {
      const hIdx = rows.findIndex(r => norm(r[0]).startsWith('FROMDATE')); const h = hIdx >= 0 ? rows[hIdx] : [];
      const ok = hIdx >= 0 && norm(h[1]).startsWith('TODATE') && norm(h[4]).startsWith('INTEREST');
      return ok ? { ok: true } : { ok: false, detail: 'MTF must have From Date, To Date, Interest Rate, Grace Days, Interest (Rs.), Net Charged columns.' };
    }
    if (file_type === 'mtm_prices') {
      const h = (rows[0] || []).map(norm);
      const ok = h.includes('SECURITYISIN') && h.some(c => c.startsWith('MTMPRICE') || c.startsWith('MTMPRC') || c === 'MTMPRICE');
      return ok ? { ok: true } : { ok: false, detail: 'CM MTM Prices must have a header row with Security Symbol, Security Series, Security ISIN, MTM Price.' };
    }
    return { ok: true }; // unknown type → let the import branch handle it
  } catch (e) {
    return { ok: false, detail: 'The file could not be read — please upload the correct format.' };
  }
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;
  const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;
  // Ingest→compute split: when defer=true the trade upload only inserts raw rows into
  // `trades` (fast) and skips building daily_trades; the /rebuild-daily endpoint runs the
  // aggregation once afterward. Only affects trade files (that's the only aggregation block).
  const deferCompute = req.body.defer === 'true' || req.body.defer === true;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // ── Format check FIRST — a wrong file in a slot reports "Invalid file format"
  //    before any duplicate/other check (e.g. a Trade file dropped into Client Master). ──
  const fmt = validateFileFormat(file_type, req.file.path, req.file.originalname);
  if (!fmt.ok) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Invalid file format — please upload the correct format for this file type.', detail: fmt.detail });
  }

  // ── Ledger date comes from the FILE NAME (DD-MM-YYYY), not the upload day ──
  // Parsed up-front so the same-date duplicate check and stored ledger_date both use it.
  // No parseable date → reject, so a mis-named file can never be silently mis-dated.
  let ledgerFileDate = null;
  if (file_type === 'ledger') {
    ledgerFileDate = parseLedgerDateFromName(req.file.originalname);
    if (!ledgerFileDate) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: 'Invalid file format — please upload the correct format for this file type.',
        detail: 'The Ledger filename must contain the ledger date in DD-MM-YYYY format (e.g. Ledger_17-07-2026.csv). Rename the file with its date and re-upload.'
      });
    }
  }

  // ── Holdings date comes from the FILE NAME (DDMMYYYY), not the upload day ──
  let holdingFileDate = null;
  if (file_type === 'holdings') {
    holdingFileDate = parseHoldingDateFromName(req.file.originalname);
    if (!holdingFileDate) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: 'Invalid file format — please upload the correct format for this file type.',
        detail: 'The Holdings filename must contain the holding date in DDMMYYYY format (e.g. SYMPHONY_colISIN_19052026.csv). Rename the file with its date and re-upload.'
      });
    }
  }

  // ── Duplicate pre-check ───────────────────────────────────────
  // Warn (HTTP 409) if this file/data was already imported, unless the user chose to overwrite.
  // Client Master → conflict on ANY prior client_master import (it's a full-base replace).
  // Other files   → conflict on same file_type + same file name already imported.
  // Trade & Brokerage carry a real trade date INSIDE the file, so they are duplicate-
  // checked AFTER parsing, by that date (see the check just before COMMIT below):
  // a different trade date uploads freely, only the same date already loaded is blocked.
  // Ledger and Holdings carry their date in the FILE NAME, so they are duplicate-checked by
  // that date AFTER parsing (with the Trade/Brokerage block below), not here by upload day.
  // The remaining snapshot file (client master) has no date at all and is checked here by
  // upload day. MTF is EXCLUDED here and checked by its interest MONTH after parsing (below),
  // because its identity is the month(s) it covers, not the day it happens to be uploaded —
  // so re-uploading the same month's data prompts Replace even on a different day.
  if (!overwrite && !['nse_cm', 'bse_cm', 'nse_fo', 'bse_fo', 'mcx', 'brokerage', 'ledger', 'holdings', 'bhavcopy', 'mtm_prices', 'mtf'].includes(file_type)) {
    try {
      const dup = await pool.query(
        `SELECT file_name, created_at, records_processed FROM import_log
         WHERE file_type = $1 AND status IN ('success','partial')
           AND created_at::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         ORDER BY created_at DESC LIMIT 1`,
        [file_type]);
      if (dup.rows.length > 0) {
        const p = dup.rows[0];
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const when = p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : 'earlier today';
        return res.status(409).json({
          conflict: true,
          file_type,
          file_name: req.file.originalname,
          message: file_type === 'client_master'
            ? `A Client Master file was already imported today (${p.file_name}, ${p.records_processed} records at ${when}). Replacing will update all client records.`
            : `A ${FILE_LABELS[file_type] || file_type} was already uploaded today (${p.file_name}, ${p.records_processed} records at ${when}). Replace the existing data?`,
          existing: { file_name: p.file_name, imported_at: p.created_at, records: p.records_processed }
        });
      }
    } catch (e) {
      console.warn('Duplicate pre-check skipped:', e.message); // never block import on a check failure
    }
  }

  let processed = 0, failed = 0, skipped = 0;
  let dataDate  = null;   // real data/trade date parsed from the file (for the audit log Trade Date column)
  let queuedRebuild = false; // set true when a deferred trade upload queues dates → auto-compute after COMMIT
  const errors  = [];
  const dbClient = await pool.connect();

  try {
    const workbook  = XLSX.readFile(req.file.path, { cellDates: false, raw: true, dense: true });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];

    await dbClient.query('BEGIN');
    await dbClient.query("SET statement_timeout = '600000'"); // 10 min

    // ── CLIENT MASTER ─────────────────────────────────────
    if (file_type === 'client_master') {
      const rows   = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const uccMap = {};

      for (const row of rows) {
        // Header cells in this export embed a CRLF (e.g. "Last Trade\r\nAccross Exch"). XLSX keeps
        // the \r\n inside the key, so the old lookups ("...\n..." or no-separator) always missed and
        // every client's last-trade date AND status silently came through blank — which made the
        // whole book look "never traded" on Inactive & DP and left the reactivation list empty.
        // Normalise keys once by stripping CR/LF so the plain names below match reliably.
        const R = {};
        for (const k of Object.keys(row)) R[String(k).replace(/[\r\n]+/g, '')] = row[k];
        const ucc  = String(R['UCC'] || '').trim();
        const name = String(R['Client Name'] || '').trim();
        if (!ucc || !name) { failed++; continue; }
        const status      = String(R['Accross ExchOverall Status'] || R['Overall Status'] || '').trim();
        const clientType  = String(R['Client Type'] || R['Type'] || 'RI').trim();
        const regdDate    = parseDate(R['Regd Date']);
        const lastTrade   = parseDate(String(R['Last TradeAccross Exch'] || '').trim());
        // "Active" vs "Inactive": note that "inactive" CONTAINS "active", so a plain
        // includes('active') flags inactive clients as active. Active only when the
        // status reads active and is NOT inactive.
        const _st         = status.toLowerCase();
        const isActive    = _st.includes('active') && !_st.includes('inactive');
        uccMap[ucc] = { ucc, name, clientType, regdDate, lastTrade, isActive, status: status || 'Active' };
      }

      const dedupedRows = Object.values(uccMap);
      for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
        const batch = dedupedRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.name, r.clientType, 'zero-brokerage', r.regdDate, r.lastTrade, r.isActive, r.status);
        }
        await dbClient.query(`
          INSERT INTO clients (ucc, name, client_type, plan, account_open_date, last_trade_date, is_active, status)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc) DO UPDATE SET
            name              = EXCLUDED.name,
            client_type       = EXCLUDED.client_type,
            account_open_date = EXCLUDED.account_open_date,
            -- GREATEST (ignores NULLs) so re-importing the master never regresses a client whose
            -- last_trade_date was already advanced by a newer trade file to an older snapshot date.
            last_trade_date   = GREATEST(clients.last_trade_date, EXCLUDED.last_trade_date),
            is_active         = EXCLUDED.is_active,
            status            = EXCLUDED.status,
            updated_at        = NOW()
        `, params);
        processed += batch.length;
      }
    }

    // ── TRADE FILE — NCL F&O Position export (F&O only) ────────────────
    // Management format: 46-column NCL/NSE F&O position file. Each row is a client's open
    // position in one contract for the day, carrying BOTH the day's buy and sell trading
    // qty/value. We split each row into a buy leg and a sell leg so the raw `trades` table
    // and the 90-day summary (which aggregate by buy_sell) keep working unchanged.
    // Unified exchange trade format (46 cols) for all 5 slots: NSE_CM, BSE_CM, NSE_FO, BSE_FO, MCX.
    // Key cols (0-indexed): 1=BizDt(date) 2=Sgmt(CM/FO/CO) 4=Xchg 7=FinInstrmTp 10=TckrSymb 12=XpryDt
    //   14=StrkPric 15=OptnTp 18=ClntId(UCC) 24=BuySellInd(B/S) 25=TradQty 27=Pric.
    else if (TRADE_SLOTS[file_type]) {
      const arr  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const slot = TRADE_SLOTS[file_type];

      // ── Exact-format validation: 46-column exchange header, exact names & order ──
      const EXPECTED = ['TradDt','BizDt','Sgmt','Src','Xchg','ClrMmbId','Brkr','FinInstrmTp','FinInstrmId',
        'ISIN','TckrSymb','SctySrs','XpryDt','FininstrmActlXpryDt','StrkPric','OptnTp','FinInstrmNm','ClntTp',
        'ClntId','FullyExctdConfSnt','OrgnlCtdnPtcptId','CtdnPtcptId','SttlmTp','SctiesSttlmTxId','BuySellInd',
        'TradQty','NewBrdLotQty','Pric','UnqTradIdr','RptdTxSts','TradDtTm','UpdDt','OrdrRef','OrdrDtTm',
        'InstgUsr','CtclId','TradRegnOrgn','OrdrTp','BlckDealInd','SttlmCycl','MktTpandId','Rmks',
        'Rsvd1','Rsvd2','Rsvd3','Rsvd4'];
      const header = (arr[0] || []).map(c => String(c ?? '').trim());
      const headerOk = header.length >= EXPECTED.length && EXPECTED.every((name, i) => header[i] === name);
      if (!headerOk) {
        throw new Error('FORMAT:Trade file must be the 46-column exchange export — TradDt, BizDt, Sgmt, Src, Xchg … ClntId … BuySellInd, TradQty … Pric.');
      }

      const { rows: uccRows } = await dbClient.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));
      // Commodity contract sizes (MCX): turnover = qty × price × lot_size. Equity
      // rows aren't in this table, so they fall back to ×1 (qty is already full qty).
      await dbClient.query(`CREATE TABLE IF NOT EXISTS contract_master (
        symbol VARCHAR(30) PRIMARY KEY, lot_size NUMERIC NOT NULL, updated_at TIMESTAMP DEFAULT now())`);
      const lotRows = await dbClient.query('SELECT symbol, lot_size FROM contract_master');
      const lotMap  = {}; lotRows.rows.forEach(r => { lotMap[String(r.symbol).toUpperCase()] = Number(r.lot_size); });
      const unknownCommodity = new Set();
      const grouped   = {};
      const tradeRows = [];
      const dates     = new Set();   // trade dates present in THIS file → scope the summary rebuild to just these

      for (let ri = 1; ri < arr.length; ri++) {
        const row = arr[ri];
        if (!row || row.length < 28) continue;
        const ucc       = String(row[18] ?? '').trim();              // ClntId
        const tradeDate = parseDate(String(row[1] ?? '').trim());    // BizDt
        if (!ucc || !tradeDate) { failed++; continue; }
        if (!dataDate || tradeDate > dataDate) dataDate = tradeDate; // capture the file's trade date even if the client isn't mapped yet
        if (!knownUCCs.has(ucc)) { skipped++; continue; }
        dates.add(tradeDate);

        const seg       = (String(row[2] ?? '').trim().toUpperCase() || slot.sgmt);   // CM / FO / CO
        const exchange  = (String(row[4] ?? '').trim().toUpperCase() || slot.xchg);   // NSE / BSE / MCX
        const instrName = String(row[7] ?? '').trim();               // FinInstrmTp (STK/STF/IDO/FUO…)
        const tkr       = String(row[10] ?? '').trim();              // TckrSymb
        const expiry    = parseDate(String(row[12] ?? '').trim());   // XpryDt
        const strike    = parseFloat(row[14]) || null;               // StrkPric
        const ot        = String(row[15] ?? '').trim().toUpperCase() || null; // OptnTp
        const isOption  = ot === 'CE' || ot === 'PE';
        const bs        = String(row[24] ?? '').trim().toUpperCase().startsWith('S') ? 'S' : 'B'; // BuySellInd
        const rawQty    = parseFloat(row[25]) || 0;                  // TradQty (units, from file)
        const brdLot    = parseFloat(row[26]) || 0;                  // NewBrdLotQty (board lot size)
        const price     = parseFloat(row[27]) || 0;                  // Pric
        // ── Unified lots / lot_size model: turnover = trade_qty × lot_size × price for EVERY segment ──
        //   CM cash : no lots — trade_qty = shares, lot_size = 1
        //   FO      : trade_qty = file qty ÷ board lot (number of lots), lot_size = board lot
        //   CO      : MCX file qty is already in lots — trade_qty = file qty, lot_size = contract multiplier
        // traded_value is algebraically identical to the old (qty × price × contract-lot); only the
        // trade_qty REPRESENTATION changes to lots (what Trade Insights / options views want).
        let qty, lotSize;
        if (seg === 'CO') {
          lotSize = lotMap[tkr.toUpperCase()];
          if (!lotSize) { unknownCommodity.add(tkr.toUpperCase()); lotSize = 1; }
          qty = rawQty;                                   // MCX file qty is per-lot already
        } else if (seg === 'FO') {
          lotSize = brdLot > 0 ? brdLot : 1;
          qty     = brdLot > 0 ? rawQty / brdLot : rawQty; // number of lots
        } else {                                          // CM cash
          lotSize = 1;
          qty     = rawQty;                               // actual shares
        }
        const lots      = qty;                            // trade_qty IS the lot count now
        const value     = qty * lotSize * price;          // turnover = trade_qty × lot_size × price
        if (qty <= 0 && value <= 0) { skipped++; continue; }         // nothing to record

        // Readable, contract-unique trading symbol
        const symbol = isOption
          ? `${tkr} ${strike != null ? strike : ''}${ot}${expiry ? ' ' + expiry : ''}`.replace(/\s+/g, ' ').trim()
          : (expiry ? `${tkr} FUT ${expiry}`.trim() : tkr);

        // Execution time-of-day from TradDtTm (col 31, e.g. "2026-07-16T12:03:00") → "HH:MM:SS".
        // trans_time is a character-varying column, so we store the plain time string.
        const rawDtTm   = String(row[30] ?? '').trim();
        const timePart  = (rawDtTm.split(/[T ]/)[1] || '').slice(0, 8);
        const transTime = /^\d{2}:\d{2}/.test(timePart) ? timePart : null;

        // One raw `trades` row per executed trade. Segment (CM/FO/CO) is stored in product_type. Columns:
        // (ucc, client_name, trade_date, trans_time, exchange, trading_symbol, instrument_name,
        //  buy_sell, trade_qty, trade_price, traded_value, product_type, order_type, option_type,
        //  strike_price, expiry_date, trade_id, order_no, pan_number)
        // Dedup key = (exchange, trade_date, trade_id, order_no). UnqTradIdr alone is NOT unique —
        // the exchange reuses the same trade id across different trades in a day — so order_no (OrdrRef)
        // is required to pin a row uniquely. Coalesced to '' (never null) so the unique index dedups.
        const tradeId = String(row[28] ?? '').trim() || null;   // UnqTradIdr
        const orderNo = String(row[32] ?? '').trim();           // OrdrRef — needed to make the key unique
        tradeRows.push([ucc, '', tradeDate, transTime, exchange, symbol, instrName,
          bs, qty, price, value, seg, null, ot, strike, expiry, tradeId, orderNo, null, lots, lotSize]);

        // Aggregate for daily_trades, split by segment.
        const key = `${ucc}__${tradeDate}`;
        if (!grouped[key]) grouped[key] = {
          ucc, trade_date: tradeDate,
          eq_cash: 0, eq_fo: 0, comm: 0, opt_prem: 0,
          instruments: {}, calls: 0, puts: 0
        };
        if (seg === 'CM')      grouped[key].eq_cash += value;
        else if (seg === 'CO') grouped[key].comm    += value;
        else                   grouped[key].eq_fo   += isOption ? 0 : value;   // FO — futures only (options counted separately in opt_prem)
        grouped[key].opt_prem += isOption ? value : 0;
        if (symbol) grouped[key].instruments[symbol] = (grouped[key].instruments[symbol] || 0) + value;
        if (ot === 'CE') grouped[key].calls += value;
        if (ot === 'PE') grouped[key].puts  += value;
        processed++;
      }

      // Flag any commodity symbol with no lot size in contract_master — its turnover was
      // counted at ×1 (understated). Add it to contract_master so it computes correctly.
      if (unknownCommodity.size) {
        console.warn('[import] MCX symbols missing lot_size in contract_master (turnover understated):',
          Array.from(unknownCommodity).join(', '));
      }

      // Ensure indexes exist (created once, kept across imports). Previously they were DROPPED
      // and REBUILT on every upload, which re-indexed the WHOLE trades table each time and got
      // slower as data grew — unworkable at 180-day scale. Keep them; incremental inserts are fine.
      await dbClient.query('ALTER TABLE trades ADD COLUMN IF NOT EXISTS lots NUMERIC');
      await dbClient.query('ALTER TABLE trades ADD COLUMN IF NOT EXISTS lot_size NUMERIC');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_ucc ON trades(ucc)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_ucc_date ON trades(ucc, trade_date)');
      await dbClient.query('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(trading_symbol)');
      // Dedup key: one row per (exchange, trade_date, exchange-trade-id). The trade id (UnqTradIdr)
      // is a DAY-RELATIVE sequence number that RESETS each trading day — so it is only unique within
      // a day. The old key (exchange, trade_id) had no date and wrongly dropped a trade whenever its
      // id collided with a DIFFERENT day's trade already loaded. Including trade_date fixes that.
      await dbClient.query('DROP INDEX IF EXISTS uq_trades_exch_tradeid');
      await dbClient.query('DROP INDEX IF EXISTS uq_trades_exch_date_tradeid');
      await dbClient.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_trades_dedup ON trades(exchange, trade_date, trade_id, order_no)');

      // 1. Bulk insert individual trades (TRADE_BATCH kept small to avoid param limit)
      for (let i = 0; i < tradeRows.length; i += TRADE_BATCH) {
        const batch = tradeRows.slice(i, i + TRADE_BATCH);
        const values = [], params = [];
        let pi = 1;
        for (const t of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(...t);
        }
        await dbClient.query(`
          INSERT INTO trades (ucc, client_name, trade_date, trans_time, exchange, trading_symbol,
            instrument_name, buy_sell, trade_qty, trade_price, traded_value, product_type,
            order_type, option_type, strike_price, expiry_date, trade_id, order_no, pan_number, lots, lot_size)
          VALUES ${values.join(',')}
          ON CONFLICT (exchange, trade_date, trade_id, order_no) DO NOTHING
        `, params);
      }

      // Delete raw trades older than 90 days (per document)

      // Queue the dates this deferred upload touched, so "Rebuild daily data" recomputes ONLY
      // the new dates — not the entire trades history each time.
      if (deferCompute && dates.size) {
        await dbClient.query(`CREATE TABLE IF NOT EXISTS pending_rebuild (trade_date DATE PRIMARY KEY, queued_at TIMESTAMP DEFAULT NOW())`);
        await dbClient.query(
          `INSERT INTO pending_rebuild (trade_date) SELECT DISTINCT unnest($1::date[]) ON CONFLICT (trade_date) DO NOTHING`,
          [Array.from(dates)]);
        queuedRebuild = true;   // → kick off the background daily-data compute after COMMIT
      }

      // ── AGGREGATION → daily_trades. Skipped when the upload is DEFERRED (insert-only,
      //    fast); the /rebuild-daily endpoint then runs computeDailyTrades() once for all
      //    dates. When not deferred this inline block runs as before (backward compatible). ──
      if (!deferCompute) {
      // ══ 90-DAY TRADE SUMMARY (points 30/31) ═══════════════════════════════
      // One summarized row per client per trade date, rebuilt from the raw
      // `trades` table on every import. Trade Insights reads ONLY from this
      // table. Realized P&L is stored (per-day matched buy/sell). A compact
      // per-symbol breakdown is kept in the `symbols` JSONB so instrument-level
      // panels can be reconstructed without touching raw trades. Rolls off at 90 days.
      // trade_summary_90d has been FOLDED INTO daily_trades: the per-client-per-day analytics
      // columns (MIS/CNC split, realized P&L, buy/sell, per-symbol detail) now live directly on
      // daily_trades, so reports read ONE daily table instead of joining two. Add the columns if
      // they don't yet exist (idempotent). daily_trades' (ucc, trade_date) is already unique and
      // already purged at 90 days below, so no separate summary table/purge is needed.
      await dbClient.query(`
        ALTER TABLE daily_trades
          ADD COLUMN IF NOT EXISTS total_trades INTEGER   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS total_qty    NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS turnover     NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS eq_cash_to   NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS eq_fut_to    NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS comm_to      NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS options_to   NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS call_to      NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS put_to       NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS cnc_to       NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS mis_to       NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS other_to     NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS cnc_trades   INTEGER   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS mis_trades   INTEGER   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS buy_val      NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS sell_val     NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS buy_qty      NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS sell_qty     NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS symbols      JSONB     DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP DEFAULT NOW()
      `);

      // Rebuild the analytics columns for every (ucc, trade_date) still present in trades
      // (bounded to the 90-day window because trades were just purged above).
      await dbClient.query(`
        INSERT INTO daily_trades (
          ucc, trade_date, total_trades, total_qty, turnover,
          eq_cash_to, eq_fut_to, comm_to, options_to, call_to, put_to,
          cnc_to, mis_to, other_to, cnc_trades, mis_trades,
          buy_val, sell_val, buy_qty, sell_qty, realized_pnl, symbols, updated_at)
        WITH sym AS (
          SELECT ucc, trade_date, trading_symbol AS s,
            MAX(UPPER(COALESCE(option_type,''))) AS ot,
            MAX(COALESCE(product_type,''))       AS pt,
            MAX(UPPER(COALESCE(exchange,'')))    AS ex,
            SUM(trade_qty)::float    AS q,
            COUNT(*)::int            AS n,
            SUM(traded_value)::float AS to_,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN traded_value ELSE 0 END)::float AS bv,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN traded_value ELSE 0 END)::float AS sv,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'B%' THEN trade_qty    ELSE 0 END)::float AS bq,
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN trade_qty    ELSE 0 END)::float AS sq,
            SUM(lots)::float AS lots,
            SUM(lots * COALESCE(lot_size,1))::float AS qty   -- total traded QUANTITY (units) = Σ lots × lot_size
          FROM trades
          WHERE trade_date = ANY($1::date[])
          GROUP BY ucc, trade_date, trading_symbol
        )
        SELECT
          ucc, trade_date,
          SUM(n)::int AS total_trades,
          SUM(q)      AS total_qty,
          SUM(to_)    AS turnover,
          SUM(CASE WHEN pt = 'CM' THEN to_ ELSE 0 END) AS eq_cash_to,
          SUM(CASE WHEN pt = 'FO' AND (ot IS NULL OR ot = '') THEN to_ ELSE 0 END) AS eq_fut_to,
          SUM(CASE WHEN pt = 'CO' THEN to_ ELSE 0 END) AS comm_to,
          SUM(CASE WHEN ot IN ('CE','PE') THEN to_ ELSE 0 END) AS options_to,
          SUM(CASE WHEN ot = 'CE' THEN to_ ELSE 0 END) AS call_to,
          SUM(CASE WHEN ot = 'PE' THEN to_ ELSE 0 END) AS put_to,
          -- Delivery (CNC) vs Intraday (MIS) derived per symbol/day from matched buy vs sell:
          --   matched qty = LEAST(buy_qty, sell_qty)  → intraday round-trip (both legs)
          --   leftover (net position carried forward)  → delivery
          -- Turnover splits the same way and always sums back to total turnover.
          SUM((bv + sv) - LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS cnc_to,
          SUM(LEAST(bq, sq) * ((CASE WHEN bq > 0 THEN bv / bq ELSE 0 END) + (CASE WHEN sq > 0 THEN sv / sq ELSE 0 END))) AS mis_to,
          0::numeric AS other_to,
          SUM(CASE WHEN LEAST(bq, sq) = 0 THEN n ELSE 0 END)::int AS cnc_trades,
          SUM(CASE WHEN LEAST(bq, sq) > 0 THEN n ELSE 0 END)::int AS mis_trades,
          SUM(bv) AS buy_val, SUM(sv) AS sell_val, SUM(bq) AS buy_qty, SUM(sq) AS sell_qty,
          SUM(CASE WHEN bq > 0 AND sq > 0
                   THEN ((sv / NULLIF(sq,0)) - (bv / NULLIF(bq,0))) * LEAST(bq, sq)
                   ELSE 0 END) AS realized_pnl,
          jsonb_agg(jsonb_build_object(
            's', s, 'ot', ot, 'pt', pt, 'ex', ex,
            'bv', bv, 'sv', sv, 'bq', bq, 'sq', sq, 'to', to_, 'n', n, 'lots', lots, 'qty', qty)) AS symbols,
          NOW()
        FROM sym
        GROUP BY ucc, trade_date
        ON CONFLICT (ucc, trade_date) DO UPDATE SET
          total_trades = EXCLUDED.total_trades, total_qty = EXCLUDED.total_qty, turnover = EXCLUDED.turnover,
          eq_cash_to = EXCLUDED.eq_cash_to, eq_fut_to = EXCLUDED.eq_fut_to, comm_to = EXCLUDED.comm_to,
          options_to = EXCLUDED.options_to, call_to = EXCLUDED.call_to, put_to = EXCLUDED.put_to,
          cnc_to = EXCLUDED.cnc_to, mis_to = EXCLUDED.mis_to, other_to = EXCLUDED.other_to,
          cnc_trades = EXCLUDED.cnc_trades, mis_trades = EXCLUDED.mis_trades,
          buy_val = EXCLUDED.buy_val, sell_val = EXCLUDED.sell_val,
          buy_qty = EXCLUDED.buy_qty, sell_qty = EXCLUDED.sell_qty,
          realized_pnl = EXCLUDED.realized_pnl, symbols = EXCLUDED.symbols, updated_at = NOW()
      `, [Array.from(dates)]);

      // (No separate summary purge needed — the analytics columns live on daily_trades now,
      //  which is purged at 90 days further below.)

      // Compute top_instrument per UCC per day
      const dailyGroups = Object.values(grouped);
      dailyGroups.forEach(g => {
        const instEntries = Object.entries(g.instruments || {});
        if (instEntries.length > 0) {
          instEntries.sort((a, b) => b[1] - a[1]);
          g.top_instrument = instEntries[0][0]; // symbol with highest turnover
          // Determine instrument type from the symbol
          const topSym = g.top_instrument.toUpperCase();
          if (topSym.endsWith('CE'))       g.top_instrument_type = 'CE';
          else if (topSym.endsWith('PE'))  g.top_instrument_type = 'PE';
          else if (topSym.includes('FUT')) g.top_instrument_type = 'FUT';
          else                             g.top_instrument_type = 'EQ';
        }
        // Call/put ratio
        const totalOptions = g.calls + g.puts;
        g.call_put_ratio = totalOptions > 0 ? parseFloat((g.calls / totalOptions * 100).toFixed(2)) : null;
      });

      // 2. Upsert aggregated daily_trades
      const groupedRows = Object.values(grouped);
      for (let i = 0; i < groupedRows.length; i += BATCH_SIZE) {
        const batch = groupedRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const g of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(g.ucc, g.trade_date, g.eq_cash, g.eq_fo, g.comm, g.opt_prem,
            g.top_instrument || null, g.top_instrument_type || null, g.call_put_ratio || null);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, eq_cash_turnover, eq_fo_turnover,
            commodity_fo_turnover, options_premium_turnover,
            top_instrument, top_instrument_type, call_put_ratio)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET
            eq_cash_turnover        = EXCLUDED.eq_cash_turnover,
            eq_fo_turnover          = EXCLUDED.eq_fo_turnover,
            commodity_fo_turnover   = EXCLUDED.commodity_fo_turnover,
            options_premium_turnover = EXCLUDED.options_premium_turnover,
            top_instrument          = EXCLUDED.top_instrument,
            top_instrument_type     = EXCLUDED.top_instrument_type,
            call_put_ratio          = EXCLUDED.call_put_ratio
        `, params);
      }

      // 2b. Correct the segment turnover from the raw `trades` table (source of truth).
      // The per-file upsert above overwrites each day's row per exchange (CM file, then
      // FO file, etc. each replace the whole row), so only the last-imported segment
      // survived — understating turnover. Rebuild the four turnover columns as the FULL
      // sum across all segments for the affected dates. brokerage/top_instrument untouched.
      if (dates.size > 0) {
        await dbClient.query(`
          UPDATE daily_trades dt SET
            eq_cash_turnover         = s.cash,
            eq_fo_turnover           = s.fo,
            commodity_fo_turnover    = s.co,
            options_premium_turnover = s.opt
          FROM (
            SELECT ucc, trade_date,
              SUM(CASE WHEN product_type='CM' THEN traded_value ELSE 0 END) AS cash,
              SUM(CASE WHEN product_type='FO' AND UPPER(COALESCE(option_type,'')) NOT IN ('CE','PE') THEN traded_value ELSE 0 END) AS fo,   -- futures only (options excluded, tracked in opt)
              SUM(CASE WHEN product_type='CO' THEN traded_value ELSE 0 END) AS co,
              SUM(CASE WHEN UPPER(COALESCE(option_type,'')) IN ('CE','PE') THEN traded_value ELSE 0 END) AS opt
            FROM trades WHERE trade_date = ANY($1::date[])
            GROUP BY ucc, trade_date
          ) s
          WHERE dt.ucc = s.ucc AND dt.trade_date = s.trade_date
        `, [Array.from(dates)]);
      }

      // ── 2c. COMMISSION on trade turnover (a SEPARATE revenue stream from brokerage) ──
      // commission_earned = Σ (segment turnover × per-segment rate effective on the trade
      // date). Computed from the raw `trades` table so every trade maps to exactly one of the
      // five rate segments. Stored in its OWN column — brokerage_earned (from the brokerage
      // file) is never touched. Rates come from the Commission Rates admin page (settings),
      // honouring each rate's effective-from / effective-to period.
      await dbClient.query(`ALTER TABLE daily_trades           ADD COLUMN IF NOT EXISTS commission_earned NUMERIC DEFAULT 0`);
      await dbClient.query(`ALTER TABLE client_monthly_summary ADD COLUMN IF NOT EXISTS commission_earned NUMERIC DEFAULT 0`);

      if (dates.size > 0) {
        // Load per-segment rate periods from settings (standard 5 + any custom periods).
        const setRows = (await dbClient.query('SELECT key, value FROM settings')).rows;
        const S = {}; setRows.forEach(r => { S[r.key] = r.value; });
        const LABEL_TO_SEG = {
          'Equity cash': 'eq_cash', 'Equity futures': 'eq_futures', 'Equity options': 'eq_options',
          'Commodity futures': 'comm_futures', 'Commodity options': 'comm_options'
        };
        const STD = {
          rate_eq_cash: 'eq_cash', rate_eq_futures: 'eq_futures', rate_eq_options: 'eq_options',
          rate_comm_futures: 'comm_futures', rate_comm_options: 'comm_options'
        };
        const periods = [];
        for (const [key, seg] of Object.entries(STD)) {
          if (S[key] == null || S[key] === '') continue;
          periods.push({ seg, rate: parseFloat(S[key]) || 0,
            from: S[key + '_from'] || '2000-01-01', to: (S[key + '_to'] || '') || null });
        }
        try {
          const customKeys = S['custom_rate_keys'] ? JSON.parse(S['custom_rate_keys']) : [];
          for (const ck of customKeys) {
            const seg = LABEL_TO_SEG[S[ck + '_segment']];
            if (!seg || S[ck] == null || S[ck] === '') continue;
            periods.push({ seg, rate: parseFloat(S[ck]) || 0,
              from: S[ck + '_from'] || '2000-01-01', to: (S[ck + '_to'] || '') || null });
          }
        } catch (e) { /* ignore malformed custom_rate_keys */ }

        // Reset commission for the affected dates, then apply the rates (if any configured).
        await dbClient.query(`UPDATE daily_trades SET commission_earned = 0 WHERE trade_date = ANY($1::date[])`, [Array.from(dates)]);

        if (periods.length) {
          const params = [Array.from(dates)];
          const valueSql = periods.map(p => {
            const i = params.length; params.push(p.seg, p.rate, p.from, p.to);
            return `($${i + 1}::text,$${i + 2}::numeric,$${i + 3}::date,$${i + 4}::date)`;
          }).join(',');
          await dbClient.query(`
            WITH rate_periods (segment, rate, eff_from, eff_to) AS ( VALUES ${valueSql} ),
            seg AS (
              SELECT ucc, trade_date,
                CASE
                  WHEN product_type = 'CM' THEN 'eq_cash'
                  WHEN product_type = 'FO' AND UPPER(COALESCE(option_type,'')) IN ('CE','PE') THEN 'eq_options'
                  WHEN product_type = 'FO' THEN 'eq_futures'
                  WHEN product_type = 'CO' AND UPPER(COALESCE(option_type,'')) IN ('CE','PE') THEN 'comm_options'
                  WHEN product_type = 'CO' THEN 'comm_futures'
                  ELSE NULL END AS segment,
                traded_value
              FROM trades t
              WHERE trade_date = ANY($1::date[])
              -- commission (clearing charges) applies to EVERY client — no plan filter.
            ),
            commis AS (
              -- rate is a PERCENTAGE (Commission Rates page column = "Rate (%)"),
              -- so commission = turnover × rate ÷ 100.
              SELECT s.ucc, s.trade_date, SUM(s.traded_value * r.rate / 100.0) AS commission
              FROM seg s
              JOIN LATERAL (
                SELECT rate FROM rate_periods rp
                WHERE rp.segment = s.segment
                  AND rp.eff_from <= s.trade_date
                  AND (rp.eff_to IS NULL OR s.trade_date <= rp.eff_to)
                ORDER BY rp.eff_from DESC LIMIT 1
              ) r ON true
              WHERE s.segment IS NOT NULL
              GROUP BY s.ucc, s.trade_date
            )
            UPDATE daily_trades dt SET commission_earned = COALESCE(c.commission, 0)
            FROM commis c WHERE dt.ucc = c.ucc AND dt.trade_date = c.trade_date
          `, params);
        }
      }

      // 3. Update the PERMANENT monthly archive (client_monthly_summary).
      // This is the long-term store the reports read for periods older than the 90-day
      // daily_trades detail window — so purging old daily_trades rows never loses the
      // information the 12-month retention / revenue-ramp / RM-impact reports need.
      // Roll up every month that this import touched (not just the current calendar month),
      // and include brokerage so revenue reports can read it here too.
      await dbClient.query(`
        INSERT INTO client_monthly_summary (ucc, month_year, eq_cash_to, eq_fo_to, comm_to, opt_prem_to, brokerage, commission_earned, trade_days)
        SELECT ucc,
          TO_CHAR(trade_date, 'YYYY-MM') AS month_year,
          SUM(eq_cash_turnover),
          SUM(eq_fo_turnover),
          SUM(commodity_fo_turnover),
          SUM(options_premium_turnover),
          SUM(COALESCE(brokerage_earned,0)),
          SUM(COALESCE(commission_earned,0)),
          COUNT(DISTINCT trade_date)
        FROM daily_trades
        WHERE trade_date = ANY($1::date[])
           OR TO_CHAR(trade_date,'YYYY-MM') = ANY(
                SELECT DISTINCT TO_CHAR(d::date,'YYYY-MM') FROM UNNEST($1::date[]) d)
        GROUP BY ucc, TO_CHAR(trade_date, 'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          eq_cash_to        = EXCLUDED.eq_cash_to,
          eq_fo_to          = EXCLUDED.eq_fo_to,
          comm_to           = EXCLUDED.comm_to,
          opt_prem_to       = EXCLUDED.opt_prem_to,
          brokerage         = EXCLUDED.brokerage,
          commission_earned = EXCLUDED.commission_earned,
          trade_days        = EXCLUDED.trade_days
      `, [Array.from(dates)]);

      // 3b. TIERED RETENTION (transfer-then-delete) — daily_trades keeps 90 days of detail.
      // The monthly rollup above already archived every affected month into
      // client_monthly_summary (permanent), so deleting the >90-day daily_trades rows loses
      // nothing the long-range reports need (they read the monthly archive). The raw `trades`
      // and `trade_summary_90d` tables are likewise purged at 90 days elsewhere in this import.
      // 180-day tier: the monthly archive is retained as the second level; nothing older than
      // 180 days is deleted from it (kept as the colder, queryable archive).

      // 4. Bulk update last_trade_date in clients
      const latestDates = {};
      for (const g of groupedRows) {
        if (!latestDates[g.ucc] || g.trade_date > latestDates[g.ucc]) latestDates[g.ucc] = g.trade_date;
      }
      const dateEntries = Object.entries(latestDates);
      for (let i = 0; i < dateEntries.length; i += BATCH_SIZE) {
        const batch  = dateEntries.slice(i, i + BATCH_SIZE);
        const vals   = batch.map((_, idx) => `($${idx*2+1}::date, $${idx*2+2})`).join(',');
        const prms   = batch.flatMap(([ucc, date]) => [date, ucc]);
        await dbClient.query(`
          UPDATE clients SET last_trade_date = GREATEST(last_trade_date, v.d), is_active = true, updated_at = NOW()
          FROM (VALUES ${vals}) AS v(d, ucc)
          WHERE clients.ucc = v.ucc
        `, prms);
      }
      } // end if (!deferCompute) — aggregation deferred to /rebuild-daily
    }

    // ── BROKERAGE FILE (ALL SEGMENTS export) ──────────────────────────
    // Management format: multi-segment Excel, 31 columns, two-row grouped header, with a
    // party row ("NAME [UCC]") before each client's block. One row per client PER TRADE DATE.
    // col 0 = UCC, col 1 = Client Name, col 4 = Trade Date, col 17 = Total Brokerage,
    // col 18 = Total Turnover, col 29 = Net Brokerage. Brokerage is keyed by the file's own date.
    else if (file_type === 'brokerage') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const norm  = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();
      const ncols = sheet['!ref'] ? (XLSX.utils.decode_range(sheet['!ref']).e.c + 1) : 0;

      // ── Exact-format validation: 31 columns; header row carries UCC / Client Name / Trade Date ──
      const hIdx = rows.findIndex(r => norm(r[0]) === 'UCC');
      const h    = hIdx >= 0 ? rows[hIdx] : [];
      const okHeader = hIdx >= 0 && ncols === 31
        && norm(h[1]).startsWith('CLIENTNAME')
        && norm(h[4]).startsWith('TRADEDATE');
      if (!okHeader) {
        throw new Error('FORMAT:Brokerage file must be the ALL-SEGMENTS export — 31 columns with UCC, Client Name and Trade Date header columns.');
      }

      const brokerageMap = {};
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const ucc = String(row[0] ?? '').trim();
        // Skip the party-header rows ("NAME [UCC]") and the sub-header row only. UCCs are often
        // ALPHANUMERIC (NR000382, INT00300, CHP00179 …), so we must NOT filter by isNaN — doing
        // so dropped ~99% of the brokerage. Party rows carry a "[" and no trade date; real data
        // rows always have a parseable Trade Date in col 4.
        if (!ucc || ucc.includes('[') || ucc.toUpperCase() === 'UCC') continue;
        const tradeDate = parseDate(String(row[4] ?? '').trim());
        if (!tradeDate) continue;                             // no real date → party/blank row, not a failure
        if (!dataDate || tradeDate > dataDate) dataDate = tradeDate;  // stamp the log's Trade Date (latest in file)
        const brokerage = parseFloat(row[17]) || 0;          // col 17 = Total Brokerage
        const key = ucc + '__' + tradeDate;
        if (!brokerageMap[key]) brokerageMap[key] = { ucc, tradeDate, brokerage: 0 };
        brokerageMap[key].brokerage += brokerage;
        processed++;
      }

      const dedupedBrokerage = Object.values(brokerageMap);

      // ── Brokerage GATE (HTTP 409) ────────────────────────────────────────────────
      // Brokerage for a trade date can only be uploaded AFTER that date's trade file has
      // been ingested AND its daily_trades computed. Otherwise the ON CONFLICT upsert below
      // would create daily_trades rows carrying brokerage but no turnover — polluting every
      // section that reads the table. We reject and tell the user exactly what to do first:
      //   • date not in trades at all      → "upload that date's trade file first"
      //   • date queued but not computed    → "daily data is still computing, wait a moment"
      const brokDates = [...new Set(dedupedBrokerage.map(r => String(r.tradeDate)))].sort();
      if (brokDates.length) {
        const comp = await dbClient.query(
          `SELECT DISTINCT trade_date::text AS d FROM daily_trades WHERE trade_date = ANY($1::date[]) AND turnover > 0`,
          [brokDates]);
        const haveComputed = new Set(comp.rows.map(r => r.d));
        const missing = brokDates.filter(d => !haveComputed.has(d));
        if (missing.length) {
          // Split "trade file never uploaded" from "uploaded but still computing".
          const q = await dbClient.query(
            `SELECT trade_date::text AS d FROM pending_rebuild WHERE trade_date = ANY($1::date[])`,
            [missing]).catch(() => ({ rows: [] }));
          const pendSet     = new Set(q.rows.map(r => r.d));
          const computing   = missing.filter(d => pendSet.has(d));
          const notUploaded = missing.filter(d => !pendSet.has(d));
          await dbClient.query('ROLLBACK');
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          const fmtD = arr => arr.map(d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })).join(', ');
          const detail = notUploaded.length
            ? `First upload the trade file for ${fmtD(notUploaded)}${computing.length ? ` (and ${fmtD(computing)} is still computing)` : ''}, then upload this brokerage file.`
            : `Daily data for ${fmtD(computing)} is still being computed in the background. Wait for it to finish, then upload this brokerage file.`;
          return res.status(409).json({
            brokerage_gate: true,
            file_type: 'brokerage',
            file_name: req.file.originalname,
            message: 'Trade data required before brokerage upload',
            detail,
            missing_dates: missing,
            computing_dates: computing,
            not_uploaded_dates: notUploaded
          });
        }
      }

      for (let i = 0; i < dedupedBrokerage.length; i += BATCH_SIZE) {
        const batch = dedupedBrokerage.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.tradeDate, r.brokerage);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, brokerage_earned)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET brokerage_earned = EXCLUDED.brokerage_earned
        `, params);
      }

      // ── Tiered retention for brokerage: roll the file's month(s) into the permanent
      // client_monthly_summary. Brokerage is uploaded AFTER trades, so the trade import's
      // monthly rollup didn't yet include it — refresh the brokerage column here so the
      // monthly archive is correct even after daily_trades is purged at 90 days.
      const brokMonths = [...new Set(dedupedBrokerage.map(r => String(r.tradeDate).slice(0, 7)))];
      if (brokMonths.length) {
        await dbClient.query(`
          INSERT INTO client_monthly_summary (ucc, month_year, brokerage)
          SELECT ucc, TO_CHAR(trade_date,'YYYY-MM'), SUM(COALESCE(brokerage_earned,0))
          FROM daily_trades
          WHERE TO_CHAR(trade_date,'YYYY-MM') = ANY($1)
          GROUP BY ucc, TO_CHAR(trade_date,'YYYY-MM')
          ON CONFLICT (ucc, month_year) DO UPDATE SET brokerage = EXCLUDED.brokerage
        `, [brokMonths]);
      }

      // NOTE: brokerage and commission are independent revenue streams that BOTH apply to
      // every client — brokerage_earned comes from this file; commission (clearing charges)
      // is computed for all clients at trade import. No paying/zero-brokerage distinction.
    }

    // ── LEDGER FILE ───────────────────────────────────────────────────
    // NEW format: xlsx "Subsidiary Trial Balance" — header row [UCC, Account Name,
    // Closing Debit, Closing Credit]. Stored balance = Closing Credit − Closing Debit
    // (net client ledger balance; matches the file's own "Net Closing Balance" footer).
    // OLD format (kept as fallback): SYMPHONY RMS pipe-delimited text, 23 cols, col 4 = base capital.
    // ledger_date comes from the file name (parsed above) either way.
    else if (file_type === 'ledger') {
      const today = ledgerFileDate;          // ledger_date comes from the file name (parsed above)
      dataDate    = ledgerFileDate;          // record it as the file's date (audit log + duplicate check)

      const lname  = (req.file.originalname || req.file.path || '').toLowerCase();
      const isXlsx = lname.endsWith('.ods') || lname.endsWith('.xlsx') || lname.endsWith('.xls');

      const { rows: clientRows } = await dbClient.query('SELECT ucc FROM clients');
      const clientSet = new Set(clientRows.map(r => String(r.ucc).trim()));
      const ledgerMap = {};

      if (isXlsx) {
        const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        const hi  = arr.findIndex(r => Array.isArray(r) && String(r[0] ?? '').trim().toUpperCase() === 'UCC');
        if (hi < 0) throw new Error('FORMAT:Ledger (xlsx) must have a header row with UCC, Account Name, Closing Debit, Closing Credit.');
        const hdr    = arr[hi].map(c => String(c ?? '').replace(/[\r\n]+/g, ' ').replace(/_x000[dD]_/g, ' ').trim().toUpperCase());
        const debCol = hdr.findIndex(c => c.startsWith('CLOSING') && c.includes('DEBIT'));
        const creCol = hdr.findIndex(c => c.startsWith('CLOSING') && c.includes('CREDIT'));
        const numOf  = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
        for (let ri = hi + 1; ri < arr.length; ri++) {
          const row = arr[ri]; if (!Array.isArray(row)) continue;
          const ucc = String(row[0] ?? '').trim();
          if (!ucc || ucc.toUpperCase() === 'CLIENTS') continue;                                  // separator / blank rows
          if (/grand total|net closing balance/i.test(ucc + ' ' + String(row[1] ?? ''))) continue; // footer rows
          if (!clientSet.has(ucc)) { skipped++; continue; }                                        // not a known client
          ledgerMap[ucc] = { ucc, balance: numOf(row[creCol]) - numOf(row[debCol]), today };       // net = credit − debit
        }
      } else {
        const raw   = fs.readFileSync(req.file.path, 'utf8');
        const lines = raw.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length > 0);
        const sample    = lines.slice(0, 25);
        const wrongCols = sample.length === 0 || sample.some(l => l.split('|').length !== 23);
        const firstUcc  = lines[0] ? String(lines[0].split('|')[0]).trim() : '';
        if (wrongCols || !firstUcc) {
          throw new Error('FORMAT:Base Capital file must be pipe-delimited ( | ) with exactly 23 columns — UCC in column 1 and base capital in column 5.');
        }
        for (const line of lines) {
          const parts = line.split('|');
          const ucc = String(parts[0] || '').trim();
          if (!ucc) { failed++; continue; }   // UCC may be alphanumeric (BAA00110); only blank UCC is a real failure
          if (!clientSet.has(ucc)) { skipped++; continue; }        // skip member / non-client ids (not a failure)
          ledgerMap[ucc] = { ucc, balance: parseFloat(parts[4]) || 0, today };   // col 4 = base capital
        }
      }

      const dedupedLedger = Object.values(ledgerMap);
      for (let i = 0; i < dedupedLedger.length; i += BATCH_SIZE) {
        const batch = dedupedLedger.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.today, r.balance);
        }
        await dbClient.query(`
          INSERT INTO daily_ledger (ucc, ledger_date, opening_balance)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, ledger_date) DO UPDATE SET opening_balance = EXCLUDED.opening_balance
        `, params);
        processed += batch.length;
      }

      // ── TIERED RETENTION for ledger (mirror of trades) ──
      // Roll this file's MONTH up into the permanent client_monthly_summary:
      //   avg_ledger_balance = average daily balance across the month's snapshots
      //   float_income       = Σ (balance × effective fd_rate ÷ 100 ÷ 365) over the month's days
      // Then purge daily_ledger rows older than 90 days — the monthly archive keeps the info.
      await dbClient.query(`ALTER TABLE client_monthly_summary ADD COLUMN IF NOT EXISTS avg_ledger_balance NUMERIC`);
      await dbClient.query(`ALTER TABLE client_monthly_summary ADD COLUMN IF NOT EXISTS float_income NUMERIC`);
      await dbClient.query(`
        INSERT INTO client_monthly_summary (ucc, month_year, avg_ledger_balance, float_income)
        SELECT ucc, TO_CHAR(ledger_date,'YYYY-MM') AS month_year,
          AVG(opening_balance) AS avg_bal,
          SUM(opening_balance * COALESCE(
                (SELECT rate FROM float_rate_history h
                   WHERE h.effective_from <= daily_ledger.ledger_date
                   ORDER BY h.effective_from DESC LIMIT 1),
                (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) / 100 / 365) AS float_income
        FROM daily_ledger
        WHERE TO_CHAR(ledger_date,'YYYY-MM') = $1
        GROUP BY ucc, TO_CHAR(ledger_date,'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          avg_ledger_balance = EXCLUDED.avg_ledger_balance,
          float_income       = EXCLUDED.float_income
      `, [String(ledgerFileDate).slice(0, 7)]);
    }

    // ── BHAVCOPY FILE (daily closing prices per ISIN) ─────────────────
    // NSE/BSE cash bhavcopy. Columns: ISIN, ClsPric (closing price), TradDt (date).
    // Stored per (isin, price_date); used to value holdings at MARKET (qty × close).
    else if (file_type === 'bhavcopy') {
      await dbClient.query(`CREATE TABLE IF NOT EXISTS bhavcopy (
        isin VARCHAR(20) NOT NULL, price_date DATE NOT NULL, close_price NUMERIC,
        CONSTRAINT uq_bhavcopy UNIQUE (isin, price_date))`);
      await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_bhavcopy_date ON bhavcopy(price_date)`);
      const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const hdr = (arr[0] || []).map(c => String(c ?? '').trim());
      const iIsin = hdr.indexOf('ISIN'), iCls = hdr.indexOf('ClsPric'), iDt = hdr.indexOf('TradDt');
      const iSer = hdr.indexOf('SctySrs');   // series (EQ, BE, BL, GB…) — NSE only; -1 on BSE
      if (iIsin < 0 || iCls < 0) throw new Error('FORMAT:Bhavcopy must have ISIN and ClsPric columns.');
      // One ISIN can appear on several rows the same day (e.g. an EQ row and a BL block-deal
      // row), which would collide on (isin, price_date) inside a single INSERT ("cannot affect
      // row a second time"). Collapse to ONE row per ISIN, preferring the EQ series close.
      const bhavMap = {};
      for (let ri = 1; ri < arr.length; ri++) {
        const row = arr[ri];
        const isin = String(row[iIsin] ?? '').trim().toUpperCase();
        const close = parseFloat(String(row[iCls] ?? '').replace(/,/g, '')) || 0;
        const dtStr = String(row[iDt] ?? '').trim();
        const pdate = /^\d{4}-\d{2}-\d{2}$/.test(dtStr) ? dtStr : parseDate(dtStr);
        const series = iSer >= 0 ? String(row[iSer] ?? '').trim().toUpperCase() : '';
        if (!isin || !close || !pdate) { skipped++; continue; }
        const prev = bhavMap[isin];
        // keep the first seen, but let an EQ-series row override any non-EQ row we picked earlier
        if (prev && !(series === 'EQ' && prev.series !== 'EQ')) { skipped++; continue; }
        bhavMap[isin] = { isin, pdate, close, series };
        dataDate = pdate;
      }
      const bhavRows = Object.values(bhavMap).map(r => [r.isin, r.pdate, r.close]);
      for (let i = 0; i < bhavRows.length; i += BATCH_SIZE) {
        const batch = bhavRows.slice(i, i + BATCH_SIZE);
        const vals = [], params = []; let pi = 1;
        for (const r of batch) { vals.push(`($${pi++},$${pi++},$${pi++})`); params.push(...r); }
        await dbClient.query(`
          INSERT INTO bhavcopy (isin, price_date, close_price) VALUES ${vals.join(',')}
          ON CONFLICT (isin, price_date) DO UPDATE SET close_price = EXCLUDED.close_price`, params);
        processed += batch.length;
      }
    }

    // ── CM MTM PRICES FILE (per-ISIN mark-to-market price) ────────────
    // A single ROLLING snapshot — NOT dated. Columns: Security Symbol, Security Series,
    // Security ISIN, MTM Price. Holdings are valued off whatever is currently in this table
    // (latest upload wins). Re-uploading REPLACES the whole table with the new file.
    // This supersedes the bhavcopy as the holdings price source (wider ISIN coverage).
    else if (file_type === 'mtm_prices') {
      await dbClient.query(`CREATE TABLE IF NOT EXISTS mtm_prices (
        isin VARCHAR(20) PRIMARY KEY, mtm_price NUMERIC, updated_at TIMESTAMP DEFAULT NOW())`);
      const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const hdr = (arr[0] || []).map(c => String(c ?? '').replace(/\s+/g, '').toUpperCase());
      const iIsin = hdr.indexOf('SECURITYISIN');
      let iPx = hdr.findIndex(c => c.startsWith('MTMPRICE') || c.startsWith('MTMPRC'));
      if (iIsin < 0 || iPx < 0) throw new Error('FORMAT:CM MTM Prices must have Security ISIN and MTM Price columns.');
      // Collapse to one row per ISIN (guard against any dup) — last non-zero price wins.
      const mtmMap = {};
      for (let ri = 1; ri < arr.length; ri++) {
        const row = arr[ri];
        const isin = String(row[iIsin] ?? '').trim().toUpperCase();
        const price = parseFloat(String(row[iPx] ?? '').replace(/,/g, '')) || 0;
        if (!isin || !price) { skipped++; continue; }
        mtmMap[isin] = price;
      }
      const mtmRows = Object.entries(mtmMap);
      // Full REPLACE: wipe the old snapshot, load the new one (atomic within this txn).
      await dbClient.query('DELETE FROM mtm_prices');
      for (let i = 0; i < mtmRows.length; i += BATCH_SIZE) {
        const batch = mtmRows.slice(i, i + BATCH_SIZE);
        const vals = [], params = []; let pi = 1;
        for (const [isin, price] of batch) { vals.push(`($${pi++},$${pi++})`); params.push(isin, price); }
        await dbClient.query(`INSERT INTO mtm_prices (isin, mtm_price) VALUES ${vals.join(',')}
          ON CONFLICT (isin) DO UPDATE SET mtm_price = EXCLUDED.mtm_price, updated_at = NOW()`, params);
        processed += batch.length;
      }
    }

    // ── HOLDINGS FILE ─────────────────────────────────────
    else if (file_type === 'holdings') {
      const today    = holdingFileDate;      // holding_date comes from the file name (parsed above)
      dataDate       = holdingFileDate;      // record it as the file's date (audit log + duplicate check)
      const holdings = {};

      // ── Gate: the CM MTM Prices snapshot must be loaded first ──
      // Holdings are valued at market (qty × MTM price). The MTM prices are a single rolling
      // snapshot (not dated); block the upload if that table is empty so nothing values at cost
      // by accident. Re-uploading the MTM file refreshes it.
      await dbClient.query(`CREATE TABLE IF NOT EXISTS mtm_prices (
        isin VARCHAR(20) PRIMARY KEY, mtm_price NUMERIC, updated_at TIMESTAMP DEFAULT NOW())`);
      const mtmChk = await dbClient.query('SELECT 1 FROM mtm_prices LIMIT 1');
      if (mtmChk.rows.length === 0) {
        throw new Error('FORMAT:Upload the CM MTM Prices file before the Holdings file — holdings are valued at those market prices.');
      }

      // Holdings may arrive as a plain pipe-delimited text file, OR as a spreadsheet
      // (.ods / .xlsx) whose single column holds the pipe-delimited strings.
      const fname = (req.file.originalname || req.file.path || '').toLowerCase();
      let lines;
      if (fname.endsWith('.ods') || fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
        const rowsArr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        lines = rowsArr
          .map(r => (Array.isArray(r) ? String(r[0] ?? '') : String(r ?? '')).trim())
          .filter(l => l.includes('|'));
      } else {
        // Read raw file — pipe-delimited, no headers
        const rawContent = fs.readFileSync(req.file.path, 'utf8');
        lines = rawContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      }

      // ── Exact-format validation: pipe-delimited, exactly 12 fields, numeric UCC in col 0 ──
      const hSample = lines.slice(0, 25);
      const hWrong  = hSample.length === 0 || hSample.some(l => l.split('|').length !== 12);
      const hUcc    = lines[0] ? String(lines[0].split('|')[0]).trim() : '';
      if (hWrong || !hUcc) {
        throw new Error('FORMAT:Holdings file must be pipe-delimited ( | ) with exactly 12 columns — UCC in column 1, quantity in column 3, price in column 12.');
      }

      // First pass: collect (ucc, isin, qty, cost). col 0=UCC, col 1=ISIN, col 2=qty, col 11=cost/avg price.
      const hRows = []; const isinSet = new Set();
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 12) continue;
        const ucc  = String(parts[0]).trim();
        if (!ucc) continue;                                   // UCC may be alphanumeric
        const isin = String(parts[1]).trim().toUpperCase();
        const qty  = parseFloat(String(parts[2]).replace(/,/g, ''))  || 0;
        const cost = parseFloat(String(parts[11]).replace(/,/g, '')) || 0;   // fallback price only
        if (qty === 0) { skipped++; continue; }
        hRows.push({ ucc, isin, qty, cost });
        if (isin) isinSet.add(isin);
      }

      // Load the MARKET price per ISIN from the current CM MTM snapshot (not dated).
      const priceMap = {};
      if (isinSet.size) {
        const pr = await dbClient.query(
          `SELECT isin, mtm_price FROM mtm_prices WHERE isin = ANY($1)`, [Array.from(isinSet)]);
        pr.rows.forEach(r => { priceMap[String(r.isin).toUpperCase()] = Number(r.mtm_price); });
      }

      // Value each holding at MARKET (qty × MTM price). If an ISIN has no MTM price at all
      // (e.g. an open-ended mutual fund), fall back to the file's cost price so it is never lost.
      let unpriced = 0;
      for (const h of hRows) {
        const mkt = priceMap[h.isin];
        const px  = (mkt != null && mkt > 0) ? mkt : h.cost;   // market close, else cost fallback
        if (mkt == null) unpriced++;
        const value = h.qty * px;
        if (value === 0) continue;
        holdings[h.ucc] = (holdings[h.ucc] || 0) + value;
        processed++;
      }
      if (unpriced) console.warn('[import] holdings: ' + unpriced + ' ISIN rows had no MTM price — valued at cost.');

      const holdingRows = Object.entries(holdings);
      for (let i = 0; i < holdingRows.length; i += BATCH_SIZE) {
        const batch = holdingRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const [ucc, totalValue] of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(ucc, today, totalValue);
        }
        await dbClient.query(`
          INSERT INTO holdings_summary (ucc, holding_date, total_holding_value)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, holding_date) DO UPDATE SET total_holding_value = EXCLUDED.total_holding_value
        `, params);
      }

      // ── TIERED RETENTION for holdings (mirror of trades) ──
      // Roll this file's MONTH up into client_monthly_summary as the MONTH-END holding value
      // (the latest holding_date's total per client in that month), then purge holdings_summary
      // rows older than 90 days.
      await dbClient.query(`ALTER TABLE client_monthly_summary ADD COLUMN IF NOT EXISTS holding_value NUMERIC`);
      await dbClient.query(`
        INSERT INTO client_monthly_summary (ucc, month_year, holding_value)
        SELECT DISTINCT ON (ucc, TO_CHAR(holding_date,'YYYY-MM'))
          ucc, TO_CHAR(holding_date,'YYYY-MM') AS month_year, total_holding_value
        FROM holdings_summary
        WHERE TO_CHAR(holding_date,'YYYY-MM') = $1
        ORDER BY ucc, TO_CHAR(holding_date,'YYYY-MM'), holding_date DESC
        ON CONFLICT (ucc, month_year) DO UPDATE SET holding_value = EXCLUDED.holding_value
      `, [String(holdingFileDate).slice(0, 7)]);
    }

    // ── MTF FILE (weekly) ─────────────────────────────────────────────
    // Management format: 6-column Excel — header (From Date, To Date, Interest Rate,
    // Grace Days, Interest (Rs.), Net Charged), then a party row "NAME [UCC]" before each
    // client's interest periods. Each period's interest is spread evenly across its days
    // (interest ÷ day-count, inclusive) for real daily MTF interest — done at read time in the MIS.
    else if (file_type === 'mtf') {
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const norm = (s) => String(s ?? '').replace(/_x000[dD]_/g, '').replace(/[\s\r\n]+/g, '').toUpperCase();

      // ── Exact-format validation: header carries From Date / To Date / Interest (Rs.) ──
      const hIdx = rows.findIndex(r => norm(r[0]).startsWith('FROMDATE'));
      const h    = hIdx >= 0 ? rows[hIdx] : [];
      const okHeader = hIdx >= 0 && norm(h[1]).startsWith('TODATE') && norm(h[4]).startsWith('INTEREST');
      if (!okHeader) {
        throw new Error('FORMAT:MTF file must be the interest export — From Date, To Date, Interest Rate, Grace Days, Interest (Rs.), Net Charged header columns.');
      }

      // Period table — one row per client interest period; the MIS spreads it to daily.
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS mtf_interest (
          ucc TEXT NOT NULL, from_date DATE NOT NULL, to_date DATE NOT NULL,
          interest NUMERIC DEFAULT 0, rate NUMERIC DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (ucc, from_date, to_date)
        )
      `);
      await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_mtf_int_dates ON mtf_interest(from_date, to_date)`);

      const periods = {};
      let currentUcc = null;
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const c0  = String(row[0] ?? '').trim();
        // UCCs are ALPHANUMERIC (e.g. CHH00027, NA000657, FRS0B314, INM00128), not just digits.
        // Matching only \d+ here silently dropped every letter-prefixed client: currentUcc stayed
        // on the previous numeric client, so their identical period collapsed via ON CONFLICT and
        // the interest was lost (~₹34.7k on the 27–31 Jul file). Accept the full alphanumeric code.
        const bracket = c0.match(/\[([A-Za-z0-9]+)\]/);
        if (bracket) { currentUcc = bracket[1]; continue; }      // party row → set current client
        const fromDate = parseDate(c0);
        const toDate   = parseDate(String(row[1] ?? '').trim());
        if (!currentUcc || !fromDate || !toDate) continue;       // skip totals / blank rows
        const rate     = parseFloat(row[2]) || 0;
        const interest = parseFloat(row[4]) || 0;                // col 4 = Interest (Rs.)
        periods[`${currentUcc}__${fromDate}__${toDate}`] = { ucc: currentUcc, fromDate, toDate, interest, rate };
        processed++;
      }

      const rowsArr = Object.values(periods);

      // ── Duplicate-by-MONTH check (HTTP 409) ──────────────────────────────────────
      // MTF has no upload-day identity — it is identified by the interest month(s) it
      // covers. If mtf_monthly already holds any month present in THIS file, prompt the
      // user to Replace (Replace re-runs with overwrite=true, whose upserts refresh the
      // month). Runs BEFORE any write so a decline leaves the existing data untouched.
      if (!overwrite && rowsArr.length) {
        try {
          const mtfMonths = [...new Set(rowsArr.map(r => String(r.fromDate).slice(0, 7)))];
          const ex = await dbClient.query(
            `SELECT DISTINCT month_year FROM mtf_monthly WHERE month_year = ANY($1) ORDER BY 1`,
            [mtfMonths]);
          if (ex.rows.length) {
            await dbClient.query('ROLLBACK');
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            const months = ex.rows.map(r => r.month_year).join(', ');
            return res.status(409).json({
              conflict: true,
              file_type: 'mtf',
              file_name: req.file.originalname,
              message: `MTF interest for ${months} has already been uploaded. Replace the existing data for ${ex.rows.length > 1 ? 'these months' : 'this month'}?`,
              existing: { months: ex.rows.map(r => r.month_year) }
            });
          }
        } catch (e) {
          console.warn('MTF month duplicate-check skipped:', e.message); // never block import on a check failure
        }
      }

      for (let i = 0; i < rowsArr.length; i += BATCH_SIZE) {
        const batch = rowsArr.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.fromDate, r.toDate, r.interest, r.rate);
        }
        await dbClient.query(`
          INSERT INTO mtf_interest (ucc, from_date, to_date, interest, rate)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, from_date, to_date) DO UPDATE SET
            interest = EXCLUDED.interest, rate = EXCLUDED.rate, updated_at = NOW()
        `, params);
      }

      // Recompute the monthly rollup from all periods (Client 360 / concentration views).
      // Non-destructive: upserts each (ucc, month) from the current detail and never deletes.
      // NOTE: this means re-importing *changed* MTF data for a month can leave stale (ucc, month)
      // rows from a prior import (a UCC that was in the old file but not the new one keeps its old
      // interest_earned). To re-import corrected data cleanly, clear mtf_interest + mtf_monthly
      // first (manual delete) rather than relying on the upload to prune.
      // avg_mtf_balance is ESTIMATED by inverting the interest formula, because the interest
      // export carries no principal column: interest = balance × rate% ÷ 100 × days ÷ 365, so
      //   balance = interest ÷ (rate% ÷ 100 × days ÷ 365),  days = inclusive (to − from + 1).
      // This is an estimate (chargeable days can differ from the stated window), surfaced in the
      // UI as "MTF book (estimated)". If a real funding/exposure file becomes available, replace
      // this derivation with the actual outstanding debit balance.
      await dbClient.query(`
        INSERT INTO mtf_monthly (ucc, month_year, avg_mtf_balance, interest_earned, from_date, to_date, interest_rate)
        SELECT ucc, TO_CHAR(from_date,'YYYY-MM'),
               SUM(interest / NULLIF((rate/100.0) * ((to_date - from_date + 1)/365.0), 0)),
               SUM(interest), MIN(from_date), MAX(to_date), AVG(rate)
        FROM mtf_interest
        GROUP BY ucc, TO_CHAR(from_date,'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          avg_mtf_balance = EXCLUDED.avg_mtf_balance,
          interest_earned = EXCLUDED.interest_earned,
          from_date = EXCLUDED.from_date, to_date = EXCLUDED.to_date, interest_rate = EXCLUDED.interest_rate
      `);

      // ── Tiered retention for MTF: mtf_monthly (above) is the permanent archive, so periods
      // whose interest window has fully aged past 90 days can be dropped from the raw
      // mtf_interest table — the monthly totals are already preserved. Mirrors trades/ledger.
    }

    else if (file_type === 'bhavcopy') {
      await dbClient.query('COMMIT');
      dbClient.release();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ message: 'Bhavcopy not required — holdings file already contains computed values', processed: 0, failed: 0 });
    }

    // ── Duplicate check for date-bearing files (Trade, Brokerage, Ledger), by the file's REAL date ──
    // Trade/Brokerage carry the date inside the file; Ledger carries it in the file name. Either way,
    // a different date uploads normally; only the SAME date already imported is blocked (unless the
    // user chose Replace). This runs post-parse so it can roll back the just-parsed rows.
    if (!overwrite && ['nse_cm', 'bse_cm', 'nse_fo', 'bse_fo', 'mcx', 'brokerage', 'ledger', 'holdings'].includes(file_type) && dataDate) {
      await dbClient.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE`);
      const dupd = await dbClient.query(
        `SELECT file_name, created_at, records_processed FROM import_log
         WHERE file_type = $1 AND trade_date = $2 AND status IN ('success','partial')
         ORDER BY created_at DESC LIMIT 1`,
        [file_type, dataDate]);
      if (dupd.rows.length > 0) {
        const p = dupd.rows[0];
        await dbClient.query('ROLLBACK');
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const dstr = new Date(dataDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return res.status(409).json({
          conflict: true,
          file_type,
          file_name: req.file.originalname,
          message: `A ${FILE_LABELS[file_type] || file_type} for ${dstr} was already uploaded (${p.records_processed} records). Replace that date's data?`,
          existing: { file_name: p.file_name, imported_at: p.created_at, records: p.records_processed }
        });
      }
    }

    // ── Whole-month graduation + missing-file gate (document §5.3 / §6) ──
    // Archive-then-purge only COMPLETE months past the 90-trading-day window; capture
    // any month blocked by missing segment files so compliance can be alerted.
    // Deferred trade uploads are insert-only — the retention sweep runs in /rebuild-daily.
    const retention = deferCompute ? null : await retentionSweep(dbClient);

    await dbClient.query('COMMIT');
    const audit = require('../utils/audit');

    // Inside handleUpload after dbClient.query('COMMIT'):
    await audit(req,
      overwrite ? 'IMPORT_REPLACED' : 'FILE_IMPORT',
      `${overwrite ? 'Replaced' : 'Imported'} ${processed} records, ${skipped} skipped, ${failed} failed (${req.file.originalname})`,
      null, failed > 0 ? 'partial' : 'success', 'import');

    await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE`);
    await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS records_skipped INT DEFAULT 0`);
    await pool.query(`
      INSERT INTO import_log (import_date, file_type, file_name, records_processed, records_failed, records_skipped, status, imported_by, trade_date, created_at)
      VALUES (NOW() AT TIME ZONE 'Asia/Kolkata',$1,$2,$3,$4,$5,$6,$7,$8,NOW() AT TIME ZONE 'Asia/Kolkata')
    `, [file_type, req.file.originalname, processed, failed, skipped,
        failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'), req.user.id, dataDate]);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    // Deferred trade upload → automatically compute daily_trades in the background so the
    // figures land without a manual "Rebuild daily data" click, and brokerage upload is
    // unlocked as soon as the compute finishes.
    if (queuedRebuild) triggerRebuild();

    // Surface retention outcome: graduated months (archived+purged) and any month
    // blocked by missing files (with the exact date+file gaps) for a compliance alert.
    res.json({ message: 'Import complete', processed, skipped, failed, errors: errors.slice(0, 10),
      rebuild_queued: queuedRebuild,
      retention: retention ? {
        cutoff: retention.cutoff, graduated: retention.graduated,
        blocked: retention.blocked,
        alert: (retention.blocked && retention.blocked.length)
          ? retention.blocked.map(b => `${b.month}: missing ${b.missing.length} file(s) — ` +
              b.missing.slice(0, 8).map(m => `${m.date}/${m.file}`).join(', ') +
              (b.missing.length > 8 ? ` …(+${b.missing.length - 8} more)` : '')).join(' | ')
          : null
      } : null });

  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    if (fs.existsSync(req.file?.path)) fs.unlinkSync(req.file.path);
    // Format-validation failures are surfaced as a clean 400 (not a server error).
    if (err && typeof err.message === 'string' && err.message.startsWith('FORMAT:')) {
      return res.status(400).json({ message: 'Invalid file format — please upload the correct format for this file type.', detail: err.message.slice(7) });
    }
    console.error('IMPORT ERROR:', err.message);
    res.status(500).json({ message: 'Import failed', error: err.message });
  } finally {
    dbClient.release();
  }
});

router.get('/logs', auth, async (req, res) => {
  try {
    const from = req.query.from || null, to = req.query.to || null;
    const cond = [], params = [];
    if (from) { params.push(from); cond.push(`il.created_at::date >= $${params.length}`); }
    if (to)   { params.push(to);   cond.push(`il.created_at::date <= $${params.length}`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const result = await pool.query(`
      SELECT il.*, u.name AS imported_by_name FROM import_log il
      LEFT JOIN users u ON il.imported_by = u.id
      ${where}
      ORDER BY il.created_at DESC LIMIT 500
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

router.post('/run-pipeline', auth, async (req, res) => {
  try {
    res.json({ message: 'Import pipeline completed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Pipeline failed', error: err.message });
  }
});

// ── Rebuild daily data (the "compute" half of the ingest→compute split) ──────────
// Aggregates the raw `trades` table into daily_trades for EVERY distinct trade date,
// then runs the retention sweep — once, instead of on every file upload. Call this
// after a batch of deferred (insert-only) trade uploads.
// Optional body { from, to } restricts to a date window; otherwise all trade dates.
router.post('/rebuild-daily', auth, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    await dbClient.query(`CREATE TABLE IF NOT EXISTS pending_rebuild (trade_date DATE PRIMARY KEY, queued_at TIMESTAMP DEFAULT NOW())`);
    const { from, to, all } = req.body || {};
    let dates, mode;
    if (from && to) {
      // Explicit window — recompute exactly these dates.
      const r = await dbClient.query(
        `SELECT DISTINCT trade_date::text AS d FROM trades WHERE trade_date BETWEEN $1 AND $2 ORDER BY 1`,
        [String(from).slice(0, 10), String(to).slice(0, 10)]);
      dates = r.rows.map(x => x.d); mode = 'window';
    } else if (all) {
      // Full rebuild — every date in trades (use after e.g. a commission-rate change).
      const r = await dbClient.query(`SELECT DISTINCT trade_date::text AS d FROM trades ORDER BY 1`);
      dates = r.rows.map(x => x.d); mode = 'all';
    } else {
      // DEFAULT: incremental — only the dates queued by deferred uploads since the last rebuild.
      const r = await dbClient.query(`SELECT trade_date::text AS d FROM pending_rebuild ORDER BY 1`);
      dates = r.rows.map(x => x.d); mode = 'incremental';
    }
    if (!dates.length) {
      await dbClient.query('ROLLBACK');
      return res.json({ message: mode === 'incremental' ? 'No new trade data to rebuild — everything is up to date.' : 'No trades found to compute.', dates: 0, mode });
    }
    const out = await computeDailyTrades(dbClient, dates);
    const retention = await retentionSweep(dbClient);
    // Clear the queue for the dates we just built.
    await dbClient.query(`DELETE FROM pending_rebuild WHERE trade_date = ANY($1::date[])`, [dates]);
    await dbClient.query('COMMIT');
    res.json({
      message: `Daily data rebuilt for ${out.dates} trade date(s)${mode === 'incremental' ? ' (new data only)' : ''}.`,
      dates: out.dates, mode, from: dates[0], to: dates[dates.length - 1], retention
    });
  } catch (err) {
    try { await dbClient.query('ROLLBACK'); } catch (_) {}
    console.error('REBUILD-DAILY ERROR:', err.message);
    res.status(500).json({ message: 'Rebuild failed', error: err.message });
  } finally {
    dbClient.release();
  }
});

// ── Auto-rebuild: the "compute" half of the ingest→compute split, run OUT OF BAND ──
// A deferred trade upload only inserts raw `trades` rows (fast) and queues the touched
// dates in pending_rebuild. This background job aggregates those dates into daily_trades
// (computeDailyTrades) and runs the retention sweep, so the upload request can return
// immediately and the daily figures appear a moment later without a manual click.
// Guarded so only ONE rebuild runs at a time; it loops until the queue is empty so dates
// queued *while* a pass is running are still picked up promptly (the cron backstop in
// server.js is the final safety net if a trigger is ever missed).
let _rebuildRunning = false;
let _lastRebuild    = null;   // { at, dates, error }

async function runPendingRebuild() {
  if (_rebuildRunning) return { skipped: true, reason: 'already-running' };
  _rebuildRunning = true;
  let totalDates = 0, lastErr = null;
  try {
    // Cheap idle pre-check: the 2-min backstop shouldn't open a transaction every tick when the
    // queue is empty. pool.query auto-manages (and releases) its own connection.
    const chk = await pool.query(`SELECT 1 FROM pending_rebuild LIMIT 1`).catch(() => ({ rows: [] }));
    if (!chk.rows.length) return { dates: 0 };

    for (let pass = 0; pass < 25; pass++) {   // bounded loop; each pass drains the current queue
      const dbClient = await pool.connect();
      let done = false;   // stop the loop after this pass (queue drained or error)
      try {
        await dbClient.query('BEGIN');
        await dbClient.query("SET statement_timeout = '600000'"); // 10 min
        await dbClient.query(`CREATE TABLE IF NOT EXISTS pending_rebuild (trade_date DATE PRIMARY KEY, queued_at TIMESTAMP DEFAULT NOW())`);
        const q = await dbClient.query(`SELECT trade_date::text AS d FROM pending_rebuild ORDER BY 1`);
        const dates = q.rows.map(r => r.d);
        if (!dates.length) {
          await dbClient.query('ROLLBACK');
          done = true;                       // nothing queued → stop (connection released in finally)
        } else {
          const out = await computeDailyTrades(dbClient, dates);
          await retentionSweep(dbClient);
          await dbClient.query(`DELETE FROM pending_rebuild WHERE trade_date = ANY($1::date[])`, [dates]);
          await dbClient.query('COMMIT');
          totalDates += out.dates;
        }
      } catch (err) {
        try { await dbClient.query('ROLLBACK'); } catch (_) {}
        lastErr = err.message;
        console.error('AUTO-REBUILD ERROR:', err.message);
        done = true;                          // stop the loop on error
      } finally {
        dbClient.release();                   // ALWAYS release — the leak that exhausted the pool
      }
      if (done) break;
    }
  } finally {
    // Only record a rebuild when something actually happened — don't let idle backstop ticks
    // overwrite the last real rebuild's summary with a "0 dates" entry.
    if (totalDates > 0 || lastErr) _lastRebuild = { at: new Date().toISOString(), dates: totalDates, error: lastErr };
    _rebuildRunning = false;
  }
  return { dates: totalDates, error: lastErr };
}

// Fire-and-forget: never blocks the request that calls it.
function triggerRebuild() {
  setImmediate(() => { runPendingRebuild().catch(e => console.error('triggerRebuild:', e.message)); });
}

// ── Rebuild status (drives the Import page banner + brokerage gating) ──────────────
// computing        → a background rebuild is running right now
// pending          → # of dates queued but not yet computed (0 = nothing waiting)
// ready            → nothing running and nothing queued (safe to upload brokerage)
// latest_computed  → most recent trade date that has computed daily_trades
router.get('/rebuild-status', auth, async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS pending_rebuild (trade_date DATE PRIMARY KEY, queued_at TIMESTAMP DEFAULT NOW())`);
    const pend   = await pool.query(`SELECT trade_date::text AS d FROM pending_rebuild ORDER BY 1`);
    const latest = await pool.query(`SELECT MAX(trade_date)::text AS d FROM daily_trades WHERE turnover > 0`);
    const pendingDates = pend.rows.map(r => r.d);
    res.json({
      computing:       _rebuildRunning,
      pending:         pendingDates.length,
      pending_dates:   pendingDates,
      ready:           !_rebuildRunning && pendingDates.length === 0,
      latest_computed: latest.rows[0] ? latest.rows[0].d : null,
      last_rebuild:    _lastRebuild
    });
  } catch (err) {
    res.status(500).json({ message: 'Status check failed', error: err.message });
  }
});

// Exposed so the server.js cron backstop can drain the queue on a timer even if a
// fire-and-forget trigger was ever missed (e.g. a process restart mid-upload).
router.runPendingRebuild = runPendingRebuild;

module.exports = router;