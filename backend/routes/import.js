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

// ── Auto-detect file type from filename ───────────────────────
function detectFileType(filename) {
  const n = (filename || '').toLowerCase().replace(/[\s_\-\.]+/g, '');
  if (n.includes('clientmaster') || n.includes('client_master') || n.includes('clientmst')) return 'client_master';
  if (n.includes('mtf') || n.includes('margintrade') || n.includes('mtfinterest'))           return 'mtf';
  if (n.includes('brokerage') || n.includes('brokerge') || n.includes('brok'))               return 'brokerage';
  if (n.includes('ledger') || n.includes('ledgr'))                                           return 'ledger';
  if (n.includes('holding') || n.includes('dp') || n.includes('dpholding'))                  return 'holdings';
  if (n.includes('trade') || n.includes('tradefile') || n.includes('tradein'))               return 'trade';
  return null;
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let file_type = req.body.file_type || detectFileType(req.file?.originalname);
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  if (!file_type) return res.status(400).json({
    message: `Could not detect file type from "${req.file?.originalname}". Rename to include: clientmaster, trade, brokerage, ledger, holdings, or mtf.`
  });

  let processed = 0, failed = 0;
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

    // ── TRADE FILE ────────────────────────────────────────
    else if (file_type === 'trade') {
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const { rows: uccRows } = await dbClient.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));
      const grouped   = {};
      const tradeRows = [];

      for (const row of rows) {
        const ucc       = String(row['Account Id'] || '').trim();
        const exchg     = String(row['Exchg. Seg'] || '').trim();
        const instrName = String(row['Instrument Name'] || '').trim();
        const traded    = parseFloat(row['Traded Value']) || 0;
        const tradeDate = parseDate(String(row['Trade Date'] || '').trim());
        const segment   = getSegment(exchg, instrName);

        if (!ucc || !tradeDate) { failed++; continue; }
        if (!knownUCCs.has(ucc)) { failed++; continue; }

        const clientName  = String(row['Client Name'] || '').trim();
        const symbol      = String(row['Trading Symbol'] || '').trim();
        const buySell     = String(row['Buy/Sell'] || '').trim();
        const tradeQty    = parseFloat(row['Trade Qty']) || 0;
        const tradePrice  = parseFloat(row['Trade Price']) || 0;
        const productType = String(row['Product Type'] || '').trim();
        const orderType   = String(row['Order Type'] || '').trim();
        const optionType  = String(row['Option Type'] || '').trim() || null;
        const strikePrice = parseFloat(row['Strike Price']) || null;
        const expiryDate  = parseDate(String(row['Expiry Date'] || '').trim()) || null;
        const tradeId     = String(row['Trade Id'] || '').trim() || null;
        const orderNo     = String(row['Order No'] || '').trim() || null;
        const transTime   = String(row['Trans. Time'] || '').trim() || null;
        const panNumber   = String(row['Pan Number'] || '').trim() || null;

        // Store individual trade row (retained for 90 days per document)
        tradeRows.push([ucc, clientName, tradeDate, transTime, exchg, symbol, instrName,
          buySell, tradeQty, tradePrice, traded, productType, orderType,
          optionType, strikePrice, expiryDate, tradeId, orderNo, panNumber]);

        // Aggregate for daily_trades summary
        const key = `${ucc}__${tradeDate}`;
        if (!grouped[key]) grouped[key] = { ucc, trade_date: tradeDate, eq_cash: 0, eq_fo: 0, comm: 0, opt_prem: 0 };
        grouped[key].eq_cash  += segment === 'EQ_CASH'  ? traded : 0;
        grouped[key].eq_fo    += (segment === 'EQ_FUT'  || segment === 'EQ_OPT')   ? traded : 0;
        grouped[key].comm     += (segment === 'COMM_FUT' || segment === 'COMM_OPT') ? traded : 0;
        grouped[key].opt_prem += (segment === 'EQ_OPT'  || segment === 'COMM_OPT') ? traded : 0;
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

      // 2. Upsert aggregated daily_trades
      const groupedRows = Object.values(grouped);
      for (let i = 0; i < groupedRows.length; i += BATCH_SIZE) {
        const batch = groupedRows.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const g of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(g.ucc, g.trade_date, g.eq_cash, g.eq_fo, g.comm, g.opt_prem);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, eq_cash_turnover, eq_fo_turnover, commodity_fo_turnover, options_premium_turnover)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET
            eq_cash_turnover         = EXCLUDED.eq_cash_turnover,
            eq_fo_turnover           = EXCLUDED.eq_fo_turnover,
            commodity_fo_turnover    = EXCLUDED.commodity_fo_turnover,
            options_premium_turnover = EXCLUDED.options_premium_turnover
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

    // ── BROKERAGE FILE ────────────────────────────────────
    else if (file_type === 'brokerage') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { range: 2, header: 1, defval: '' });
      const today = new Date().toISOString().split('T')[0];
      const brokerageMap = {};

      for (const row of rows) {
        const party = String(row[0] || '').trim();
        const ucc   = extractUCC(party);
        if (!ucc) { failed++; continue; }
        if (party.toLowerCase().includes('total') || party.toLowerCase().includes('grand')) continue;
        const brokerage = parseFloat(row[7]) || 0;
        brokerageMap[ucc] = { ucc, brokerage, today };
      }

      const dedupedBrokerage = Object.values(brokerageMap);
      for (let i = 0; i < dedupedBrokerage.length; i += BATCH_SIZE) {
        const batch = dedupedBrokerage.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.today, r.brokerage);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, brokerage_earned)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET brokerage_earned = EXCLUDED.brokerage_earned
        `, params);
        processed += batch.length;
      }
    }

    // ── LEDGER FILE ───────────────────────────────────────
    else if (file_type === 'ledger') {
      const rows    = XLSX.utils.sheet_to_json(sheet, { range: 1, header: 1, defval: 0 });
      const today   = new Date().toISOString().split('T')[0];
      const ledgerMap = {};

      // Per document: only track ledger for clients active in last 30 days
      const { rows: activeRows } = await dbClient.query(`
        SELECT ucc FROM clients WHERE last_trade_date >= CURRENT_DATE - INTERVAL '30 days'
      `);
      const activeSet = new Set(activeRows.map(r => r.ucc));

      for (const row of rows) {
        const ucc = String(row[0] || '').trim();
        if (!ucc || ucc === 'UCC') { failed++; continue; }
        if (!activeSet.has(ucc)) { failed++; continue; } // Skip inactive > 30 days
        const balance = (parseFloat(row[3]) || 0) - (parseFloat(row[2]) || 0);
        ledgerMap[ucc] = { ucc, balance, today };
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
      const rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const today    = new Date().toISOString().split('T')[0];
      const holdings = {};

      for (const row of rawRows) {
        const rawStr = String(row[0] || '').trim();
        if (!rawStr || rawStr.startsWith('UCC')) continue;
        const parts = rawStr.split('|');
        if (parts.length < 12) continue;
        const ucc   = String(parts[0]).trim();
        const value = parseFloat(parts[11]) || 0;
        if (!ucc) continue;
        // ISIN detail discarded — only total value stored (per document)
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
        const fromDateRaw = row['From\nDate'] || row['FromDate'] || row['From Date'] || row[2] || '';
        const fromDate   = parseDate(fromDateRaw);
        const lastIdx    = row.length - 1;
        const netCharged = parseFloat(row['Net\nCharged'] || row['NetCharged'] || row['Net Charged'] || row[lastIdx] || 0);
        const interest   = parseFloat(row['Interest\n(Rs.)'] || row['Interest(Rs.)'] || row['Interest'] || row[lastIdx - 1] || 0);

        if (!ucc || isNaN(parseInt(ucc)) || !fromDate) { failed++; continue; }
        const monthYear = fromDate.substring(0, 7);
        const amount    = netCharged || interest;
        if (!amount) { failed++; continue; }
        const k = `${ucc}__${monthYear}`;
        if (!mtfMap[k]) mtfMap[k] = { ucc, monthYear, amount };
        else mtfMap[k].amount += amount;
      }

      const dedupedMTF = Object.values(mtfMap);
      for (let i = 0; i < dedupedMTF.length; i += BATCH_SIZE) {
        const batch = dedupedMTF.slice(i, i + BATCH_SIZE);
        const values = [], params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.monthYear, 0, r.amount);
        }
        await dbClient.query(`
          INSERT INTO mtf_monthly (ucc, month_year, avg_mtf_balance, interest_earned)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, month_year) DO UPDATE SET
            interest_earned = mtf_monthly.interest_earned + EXCLUDED.interest_earned
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
    await audit(req, 'FILE_IMPORT', `Imported ${processed} records, ${failed} failed`, null, failed > 0 ? 'partial' : 'success', 'import');

    await pool.query(`
      INSERT INTO import_log (import_date, file_type, file_name, records_processed, records_failed, status, imported_by, created_at)
      VALUES (NOW(),$1,$2,$3,$4,$5,$6,NOW())
    `, [file_type, req.file.originalname, processed, failed,
        failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'), req.user.id]);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ message: 'Import complete', processed, failed, errors: errors.slice(0, 10) });

  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    console.error('IMPORT ERROR:', err.message);
    if (fs.existsSync(req.file?.path)) fs.unlinkSync(req.file.path);
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