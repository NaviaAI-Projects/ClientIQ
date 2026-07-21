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
const TRADE_BATCH = 200; // 200 rows × 19 cols = 3800 params (under 65535 limit)

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
  client_master: 'Client Master', trade: 'Trade File', brokerage: 'Brokerage File',
  ledger: 'Ledger File', holdings: 'Holdings File', mtf: 'MTF File'
};

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;
  const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // ── Duplicate pre-check ───────────────────────────────────────
  // Warn (HTTP 409) if this file/data was already imported, unless the user chose to overwrite.
  // Client Master → conflict on ANY prior client_master import (it's a full-base replace).
  // Other files   → conflict on same file_type + same file name already imported.
  if (!overwrite) {
    try {
      const dup = file_type === 'client_master'
        ? await pool.query(
            `SELECT file_name, created_at, records_processed FROM import_log
             WHERE file_type = 'client_master' AND status IN ('success','partial')
             ORDER BY created_at DESC LIMIT 1`)
        : await pool.query(
            `SELECT file_name, created_at, records_processed FROM import_log
             WHERE file_type = $1 AND LOWER(file_name) = LOWER($2) AND status IN ('success','partial')
             ORDER BY created_at DESC LIMIT 1`,
            [file_type, req.file.originalname]);
      if (dup.rows.length > 0) {
        const p = dup.rows[0];
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const when = p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : 'earlier';
        return res.status(409).json({
          conflict: true,
          file_type,
          file_name: req.file.originalname,
          message: file_type === 'client_master'
            ? `A Client Master file was already imported (${p.file_name}, ${p.records_processed} records on ${when}). Replacing will update all client records.`
            : `"${req.file.originalname}" (${FILE_LABELS[file_type] || file_type}) was already uploaded on ${when} — ${p.records_processed} records. Replace the existing data?`,
          existing: { file_name: p.file_name, imported_at: p.created_at, records: p.records_processed }
        });
      }
    } catch (e) {
      console.warn('Duplicate pre-check skipped:', e.message); // never block import on a check failure
    }
  }

  let processed = 0, failed = 0;
  let dataDate  = null;   // real data/trade date parsed from the file (for the audit log Trade Date column)
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
        const ucc  = String(row['UCC'] || '').trim();
        const name = String(row['Client Name'] || '').trim();
        if (!ucc || !name) { failed++; continue; }
        const status      = String(row['Accross Exch\nOverall Status'] || row['Accross ExchOverall Status'] || row['Overall Status'] || '').trim();
        const clientType  = String(row['Client Type'] || row['Type'] || 'RI').trim();
        const regdDate    = parseDate(row['Regd Date']);
        const lastTrade   = parseDate(String(row['Last Trade\nAccross Exch'] || row['Last TradeAccross Exch'] || '').trim());
        const isActive    = status.toLowerCase().includes('active');
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
            last_trade_date   = EXCLUDED.last_trade_date,
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
    // Key cols (0-indexed): 3=BizDt(date) 8=ClntId(UCC) 9=FinInstrmTp 11=TckrSymb 12=XpryDt
    //   14=StrkPric 15=OptnTp 21=OpnBuyTradgQty 22=OpnBuyTradgVal 23=OpnSellTradgQty 24=OpnSellTradgVal.
    else if (file_type === 'trade') {
      const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

      // ── Exact-format validation: 46-column NCL F&O header, exact names & order ──
      const EXPECTED = ['Sgmt','Src','RptgDt','BizDt','TradRegnOrgn','ClrMmbId','BrkrOrCtdnPtcptId',
        'ClntTp','ClntId','FinInstrmTp','ISIN','TckrSymb','XpryDt','FininstrmActlXpryDt','StrkPric',
        'OptnTp','NewBrdLotQty','OpngLngQty','OpngLngVal','OpngShrtQty','OpngShrtVal','OpnBuyTradgQty',
        'OpnBuyTradgVal','OpnSellTradgQty','OpnSellTradgVal','PreExrcAssgndLngQty','PreExrcAssgndLngVal',
        'PreExrcAssgndShrtQty','PreExrcAssgndShrtVal','ExrcdQty','AssgndQty','PstExrcAssgndLngQty',
        'PstExrcAssgndLngVal','PstExrcAssgndShrtQty','PstExrcAssgndShrtVal','SttlmPric','RefRate','PrmAmt',
        'DalyMrkToMktSettlmVal','FutrsFnlSttlmVal','ExrcAssgndVal','Rmks','Rsvd1','Rsvd2','Rsvd3','Rsvd4'];
      const header = (arr[0] || []).map(c => String(c ?? '').trim());
      const headerOk = header.length >= EXPECTED.length && EXPECTED.every((name, i) => header[i] === name);
      if (!headerOk) {
        throw new Error('FORMAT:Trade file must be the NCL F&O Position export — 46 columns beginning Sgmt, Src, RptgDt, BizDt … in the exact order.');
      }

      const { rows: uccRows } = await dbClient.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));
      const grouped   = {};
      const tradeRows = [];

      for (let ri = 1; ri < arr.length; ri++) {
        const row = arr[ri];
        if (!row || row.length < 25) continue;
        const ucc       = String(row[8] ?? '').trim();               // ClntId
        const tradeDate = parseDate(String(row[3] ?? '').trim());    // BizDt
        if (!ucc || !tradeDate) { failed++; continue; }
        if (!knownUCCs.has(ucc)) { failed++; continue; }
        if (!dataDate || tradeDate > dataDate) dataDate = tradeDate; // capture the trade file's date

        const instrName = String(row[9] ?? '').trim();               // FinInstrmTp (IDO/STO/FUT…)
        const tkr       = String(row[11] ?? '').trim();              // TckrSymb
        const expiry    = parseDate(String(row[12] ?? '').trim());   // XpryDt
        const strike    = parseFloat(row[14]) || null;               // StrkPric
        const ot        = String(row[15] ?? '').trim().toUpperCase() || null; // OptnTp
        const isOption  = ot === 'CE' || ot === 'PE';
        const buyQty    = parseFloat(row[21]) || 0;                  // OpnBuyTradgQty
        const buyVal    = parseFloat(row[22]) || 0;                  // OpnBuyTradgVal
        const sellQty   = parseFloat(row[23]) || 0;                  // OpnSellTradgQty
        const sellVal   = parseFloat(row[24]) || 0;                  // OpnSellTradgVal
        const exchange  = 'NFO';                                     // F&O only for now

        // Readable, contract-unique trading symbol
        const symbol = isOption
          ? `${tkr} ${strike != null ? strike : ''}${ot}${expiry ? ' ' + expiry : ''}`.replace(/\s+/g, ' ').trim()
          : `${tkr} FUT${expiry ? ' ' + expiry : ''}`.trim();

        // Split the position into a buy leg and a sell leg → raw `trades` rows. Columns:
        // (ucc, client_name, trade_date, trans_time, exchange, trading_symbol, instrument_name,
        //  buy_sell, trade_qty, trade_price, traded_value, product_type, order_type, option_type,
        //  strike_price, expiry_date, trade_id, order_no, pan_number)
        if (buyQty > 0 || buyVal > 0) {
          tradeRows.push([ucc, '', tradeDate, null, exchange, symbol, instrName,
            'B', buyQty, buyQty > 0 ? buyVal / buyQty : 0, buyVal, null, null,
            ot, strike, expiry, null, null, null]);
        }
        if (sellQty > 0 || sellVal > 0) {
          tradeRows.push([ucc, '', tradeDate, null, exchange, symbol, instrName,
            'S', sellQty, sellQty > 0 ? sellVal / sellQty : 0, sellVal, null, null,
            ot, strike, expiry, null, null, null]);
        }

        // Aggregate for daily_trades (F&O only: everything is eq_fo turnover; CE/PE also = options premium)
        const turnover = buyVal + sellVal;
        const key = `${ucc}__${tradeDate}`;
        if (!grouped[key]) grouped[key] = {
          ucc, trade_date: tradeDate,
          eq_cash: 0, eq_fo: 0, comm: 0, opt_prem: 0,
          instruments: {}, calls: 0, puts: 0
        };
        grouped[key].eq_fo    += turnover;
        grouped[key].opt_prem += isOption ? turnover : 0;
        if (symbol) grouped[key].instruments[symbol] = (grouped[key].instruments[symbol] || 0) + turnover;
        if (ot === 'CE') grouped[key].calls += turnover;
        if (ot === 'PE') grouped[key].puts  += turnover;
        processed++;
      }

      // Drop indexes for faster bulk insert
      await dbClient.query('DROP INDEX IF EXISTS idx_trades_ucc');
      await dbClient.query('DROP INDEX IF EXISTS idx_trades_date');
      await dbClient.query('DROP INDEX IF EXISTS idx_trades_ucc_date');
      await dbClient.query('DROP INDEX IF EXISTS idx_trades_symbol');

      // 1. Bulk insert individual trades (TRADE_BATCH kept small to avoid param limit)
      for (let i = 0; i < tradeRows.length; i += TRADE_BATCH) {
        const batch = tradeRows.slice(i, i + TRADE_BATCH);
        const values = [], params = [];
        let pi = 1;
        for (const t of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(...t);
        }
        await dbClient.query(`
          INSERT INTO trades (ucc, client_name, trade_date, trans_time, exchange, trading_symbol,
            instrument_name, buy_sell, trade_qty, trade_price, traded_value, product_type,
            order_type, option_type, strike_price, expiry_date, trade_id, order_no, pan_number)
          VALUES ${values.join(',')}
        `, params);
      }

      // Recreate indexes
      await dbClient.query('CREATE INDEX idx_trades_ucc ON trades(ucc)');
      await dbClient.query('CREATE INDEX idx_trades_date ON trades(trade_date)');
      await dbClient.query('CREATE INDEX idx_trades_ucc_date ON trades(ucc, trade_date)');
      await dbClient.query('CREATE INDEX idx_trades_symbol ON trades(trading_symbol)');

      // Delete raw trades older than 90 days (per document)
      await dbClient.query(`DELETE FROM trades WHERE trade_date < CURRENT_DATE - INTERVAL '90 days'`);

      // ══ 90-DAY TRADE SUMMARY (points 30/31) ═══════════════════════════════
      // One summarized row per client per trade date, rebuilt from the raw
      // `trades` table on every import. Trade Insights reads ONLY from this
      // table. Realized P&L is stored (per-day matched buy/sell). A compact
      // per-symbol breakdown is kept in the `symbols` JSONB so instrument-level
      // panels can be reconstructed without touching raw trades. Rolls off at 90 days.
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS trade_summary_90d (
          ucc          TEXT      NOT NULL,
          trade_date   DATE      NOT NULL,
          total_trades INTEGER   DEFAULT 0,
          total_qty    NUMERIC   DEFAULT 0,
          turnover     NUMERIC   DEFAULT 0,
          eq_cash_to   NUMERIC   DEFAULT 0,
          eq_fut_to    NUMERIC   DEFAULT 0,
          comm_to      NUMERIC   DEFAULT 0,
          options_to   NUMERIC   DEFAULT 0,
          call_to      NUMERIC   DEFAULT 0,
          put_to       NUMERIC   DEFAULT 0,
          cnc_to       NUMERIC   DEFAULT 0,
          mis_to       NUMERIC   DEFAULT 0,
          other_to     NUMERIC   DEFAULT 0,
          cnc_trades   INTEGER   DEFAULT 0,
          mis_trades   INTEGER   DEFAULT 0,
          buy_val      NUMERIC   DEFAULT 0,
          sell_val     NUMERIC   DEFAULT 0,
          buy_qty      NUMERIC   DEFAULT 0,
          sell_qty     NUMERIC   DEFAULT 0,
          realized_pnl NUMERIC   DEFAULT 0,
          symbols      JSONB     DEFAULT '[]'::jsonb,
          updated_at   TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (ucc, trade_date)
        )
      `);
      await dbClient.query(`CREATE INDEX IF NOT EXISTS idx_tsum_date ON trade_summary_90d(trade_date)`);

      // Rebuild the summary for every (ucc, trade_date) still present in trades
      // (bounded to the 90-day window because trades were just purged above).
      await dbClient.query(`
        INSERT INTO trade_summary_90d (
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
            SUM(CASE WHEN UPPER(buy_sell) LIKE 'S%' THEN trade_qty    ELSE 0 END)::float AS sq
          FROM trades
          GROUP BY ucc, trade_date, trading_symbol
        )
        SELECT
          ucc, trade_date,
          SUM(n)::int AS total_trades,
          SUM(q)      AS total_qty,
          SUM(to_)    AS turnover,
          SUM(CASE WHEN ex IN ('NSE','BSE') THEN to_ ELSE 0 END) AS eq_cash_to,
          SUM(CASE WHEN ex IN ('NFO','BFO') AND (ot IS NULL OR ot = '') THEN to_ ELSE 0 END) AS eq_fut_to,
          SUM(CASE WHEN ex = 'MCX' THEN to_ ELSE 0 END) AS comm_to,
          SUM(CASE WHEN ot IN ('CE','PE') THEN to_ ELSE 0 END) AS options_to,
          SUM(CASE WHEN ot = 'CE' THEN to_ ELSE 0 END) AS call_to,
          SUM(CASE WHEN ot = 'PE' THEN to_ ELSE 0 END) AS put_to,
          SUM(CASE WHEN pt ILIKE '%CNC%' OR pt ILIKE '%DELIV%' THEN to_ ELSE 0 END) AS cnc_to,
          SUM(CASE WHEN pt ILIKE '%MIS%' OR pt ILIKE '%INTRA%' THEN to_ ELSE 0 END) AS mis_to,
          SUM(CASE WHEN pt NOT ILIKE '%CNC%' AND pt NOT ILIKE '%DELIV%'
                    AND pt NOT ILIKE '%MIS%' AND pt NOT ILIKE '%INTRA%' THEN to_ ELSE 0 END) AS other_to,
          SUM(CASE WHEN pt ILIKE '%CNC%' OR pt ILIKE '%DELIV%' THEN n ELSE 0 END)::int AS cnc_trades,
          SUM(CASE WHEN pt ILIKE '%MIS%' OR pt ILIKE '%INTRA%' THEN n ELSE 0 END)::int AS mis_trades,
          SUM(bv) AS buy_val, SUM(sv) AS sell_val, SUM(bq) AS buy_qty, SUM(sq) AS sell_qty,
          SUM(CASE WHEN bq > 0 AND sq > 0
                   THEN ((sv / NULLIF(sq,0)) - (bv / NULLIF(bq,0))) * LEAST(bq, sq)
                   ELSE 0 END) AS realized_pnl,
          jsonb_agg(jsonb_build_object(
            's', s, 'ot', ot, 'pt', pt, 'ex', ex,
            'bv', bv, 'sv', sv, 'bq', bq, 'sq', sq, 'to', to_, 'n', n)) AS symbols,
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
      `);

      // Roll the summary window: drop rows for dates that have aged out of the 90-day window.
      await dbClient.query(`DELETE FROM trade_summary_90d WHERE trade_date < CURRENT_DATE - INTERVAL '90 days'`);

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

      // 3. Update permanent monthly summaries (per document)
      await dbClient.query(`
        INSERT INTO client_monthly_summary (ucc, month_year, eq_cash_to, eq_fo_to, comm_to, opt_prem_to, trade_days)
        SELECT ucc,
          TO_CHAR(trade_date, 'YYYY-MM') as month_year,
          SUM(eq_cash_turnover),
          SUM(eq_fo_turnover),
          SUM(commodity_fo_turnover),
          SUM(options_premium_turnover),
          COUNT(DISTINCT trade_date)
        FROM daily_trades
        WHERE trade_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY ucc, TO_CHAR(trade_date, 'YYYY-MM')
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          eq_cash_to  = EXCLUDED.eq_cash_to,
          eq_fo_to    = EXCLUDED.eq_fo_to,
          comm_to     = EXCLUDED.comm_to,
          opt_prem_to = EXCLUDED.opt_prem_to,
          trade_days  = EXCLUDED.trade_days
      `);

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
          UPDATE clients SET last_trade_date = GREATEST(last_trade_date, v.d), updated_at = NOW()
          FROM (VALUES ${vals}) AS v(d, ucc)
          WHERE clients.ucc = v.ucc
        `, prms);
      }
    }

    // ── BROKERAGE FILE (ALL SEGMENTS export) ──────────────────────────
    // Management format: multi-segment Excel, 31 columns, two-row grouped header, with a
    // party row ("NAME [UCC]") before each client's block. One row per client PER TRADE DATE.
    // col 0 = UCC, col 1 = Client Name, col 4 = Trade Date, col 17 = Total Brokerage,
    // col 18 = Total Turnover, col 29 = Net Brokerage. Brokerage is keyed by the file's own date.
    else if (file_type === 'brokerage') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const norm  = (s) => String(s ?? '').replace(/[\s\r\n]+/g, '').toUpperCase();
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
        if (!ucc || isNaN(Number(ucc))) continue;            // skip party rows / the sub-header row
        const tradeDate = parseDate(String(row[4] ?? '').trim());
        if (!tradeDate) { failed++; continue; }
        const brokerage = parseFloat(row[17]) || 0;          // col 17 = Total Brokerage
        const key = ucc + '__' + tradeDate;
        if (!brokerageMap[key]) brokerageMap[key] = { ucc, tradeDate, brokerage: 0 };
        brokerageMap[key].brokerage += brokerage;
        processed++;
      }

      const dedupedBrokerage = Object.values(brokerageMap);
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
    }

    // ── BASE CAPITAL FILE (replaces the old Ledger file) ──────────────
    // Management format: SYMPHONY RMS LIMIT export — pipe-delimited text, NO header,
    // 23 fields per row. col 0 = UCC, col 4 = base capital. The base-capital amount is
    // stored as the client's balance/float (daily_ledger.opening_balance) so every
    // existing float-income calculation keeps working unchanged.
    else if (file_type === 'ledger') {
      const today = new Date().toISOString().split('T')[0];
      const raw   = fs.readFileSync(req.file.path, 'utf8');
      const lines = raw.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length > 0);

      // ── Exact-format validation: pipe-delimited, exactly 23 fields, numeric UCC in col 0 ──
      const sample    = lines.slice(0, 25);
      const wrongCols = sample.length === 0 || sample.some(l => l.split('|').length !== 23);
      const firstUcc  = lines[0] ? String(lines[0].split('|')[0]).trim() : '';
      if (wrongCols || isNaN(parseInt(firstUcc))) {
        throw new Error('FORMAT:Base Capital file must be pipe-delimited ( | ) with exactly 23 columns — UCC in column 1 and base capital in column 5.');
      }

      const { rows: clientRows } = await dbClient.query('SELECT ucc FROM clients');
      const clientSet = new Set(clientRows.map(r => String(r.ucc).trim()));

      const ledgerMap = {};
      for (const line of lines) {
        const parts = line.split('|');
        const ucc = String(parts[0] || '').trim();
        if (!ucc || isNaN(parseInt(ucc))) { failed++; continue; }
        if (!clientSet.has(ucc)) { failed++; continue; }         // skip member / non-client ids
        const baseCapital = parseFloat(parts[4]) || 0;           // col 4 = base capital
        ledgerMap[ucc] = { ucc, balance: baseCapital, today };
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
    }

    // ── HOLDINGS FILE ─────────────────────────────────────
    else if (file_type === 'holdings') {
      const today    = new Date().toISOString().split('T')[0];
      const holdings = {};

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
      if (hWrong || isNaN(parseInt(hUcc))) {
        throw new Error('FORMAT:Holdings file must be pipe-delimited ( | ) with exactly 12 columns — UCC in column 1, quantity in column 3, price in column 12.');
      }

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 4) continue;
        const ucc      = String(parts[0]).trim();
        if (!ucc || isNaN(ucc)) continue;
        const qty      = parseFloat(parts[2])  || 0;  // col 2 = quantity
        const avgPrice = parseFloat(parts[11]) || 0;  // col 11 = average price per unit
        const value    = qty * avgPrice;               // total holding value
        if (value === 0) { failed++; continue; }
        if (!holdings[ucc]) holdings[ucc] = 0;
        holdings[ucc] += value;
        processed++;
      }

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
    }

    // ── MTF FILE ──────────────────────────────────────────
    else if (file_type === 'mtf') {
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 2, header: 1 });
      const mtfMap = {};

      for (const row of rows) {
        const ucc        = String(row['UCC'] || row[0] || '').trim();
        // MTF file has fixed columns — use index positions (more reliable than string keys with newlines)
        // Col 15 = From Date, Col 19 = Interest (Rs.), Col 27 = Net Charged
        const fromDateRaw = row[15] || row['From\nDate'] || row['From Date'] || row[2] || '';
        const fromDate    = parseDate(String(fromDateRaw).trim());
        const netCharged  = parseFloat(row[27]) || 0;
        const interest    = parseFloat(row[19]) || 0;
        const interestRate = parseFloat(row[17]) || 0;
        const toDateRaw   = row[16] || '';
        const toDate      = parseDate(String(toDateRaw).trim());

        if (!ucc || isNaN(parseInt(ucc)) || !fromDate) { failed++; continue; }
        const monthYear = fromDate.substring(0, 7);
        const amount    = netCharged || interest;
        if (!amount) { failed++; continue; }
        const k = `${ucc}__${monthYear}`;
        if (!mtfMap[k]) mtfMap[k] = { ucc, monthYear, amount, fromDate, toDate, interestRate };
        else mtfMap[k].amount += amount;
      }

      const dedupedMTF = Object.values(mtfMap);
      for (let i = 0; i < dedupedMTF.length; i += BATCH_SIZE) {
        const batch = dedupedMTF.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.monthYear, 0, r.amount, r.fromDate || null, r.toDate || null, r.interestRate || 0);
        }
        await dbClient.query(`
          INSERT INTO mtf_monthly (ucc, month_year, avg_mtf_balance, interest_earned, from_date, to_date, interest_rate)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, month_year) DO UPDATE SET
            interest_earned = mtf_monthly.interest_earned + EXCLUDED.interest_earned,
            to_date         = EXCLUDED.to_date,
            interest_rate   = EXCLUDED.interest_rate
        `, params);
        processed += batch.length;
      }
    }

    else if (file_type === 'bhavcopy') {
      await dbClient.query('COMMIT');
      dbClient.release();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ message: 'Bhavcopy not required — holdings file already contains computed values', processed: 0, failed: 0 });
    }

    await dbClient.query('COMMIT');
    const audit = require('../utils/audit');

    // Inside handleUpload after dbClient.query('COMMIT'):
    await audit(req,
      overwrite ? 'IMPORT_REPLACED' : 'FILE_IMPORT',
      `${overwrite ? 'Replaced' : 'Imported'} ${processed} records, ${failed} failed (${req.file.originalname})`,
      null, failed > 0 ? 'partial' : 'success', 'import');

    await pool.query(`ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE`);
    await pool.query(`
      INSERT INTO import_log (import_date, file_type, file_name, records_processed, records_failed, status, imported_by, trade_date, created_at)
      VALUES (NOW() AT TIME ZONE 'Asia/Kolkata',$1,$2,$3,$4,$5,$6,$7,NOW() AT TIME ZONE 'Asia/Kolkata')
    `, [file_type, req.file.originalname, processed, failed,
        failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'), req.user.id, dataDate]);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ message: 'Import complete', processed, failed, errors: errors.slice(0, 10) });

  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    if (fs.existsSync(req.file?.path)) fs.unlinkSync(req.file.path);
    // Format-validation failures are surfaced as a clean 400 (not a server error).
    if (err && typeof err.message === 'string' && err.message.startsWith('FORMAT:')) {
      return res.status(400).json({ message: 'File is not in the correct format', detail: err.message.slice(7) });
    }
    console.error('IMPORT ERROR:', err.message);
    res.status(500).json({ message: 'Import failed', error: err.message });
  } finally {
    dbClient.release();
  }
});

router.get('/logs', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT il.*, u.name AS imported_by_name FROM import_log il
      LEFT JOIN users u ON il.imported_by = u.id
      ORDER BY il.created_at DESC LIMIT 50
    `);
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

module.exports = router;