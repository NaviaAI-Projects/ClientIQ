const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db');
const auth = require('../middleware/auth');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// ── Helper: parse date string DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const yr  = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${mon}-${day}`;
  }

  // Excel serial date number (e.g. 46191)
  if (!isNaN(val) && Number(val) > 40000) {
    const d = new Date((Number(val) - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }

  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

// ── Helper: extract UCC from brokerage party string "NAME [UCC]"
function extractUCC(partyStr) {
  if (!partyStr) return null;
  const m = String(partyStr).match(/\[(\d+)\]/);
  return m ? m[1] : null;
}

// ── Helper: determine segment from exchange
function getSegment(exchg, symbol) {
  if (!exchg) return 'EQ_CASH';
  const e = String(exchg).toUpperCase();
  const s = String(symbol || '').toUpperCase();
  if (e === 'MCX' || e === 'NCDEX') return 'COMM_FO';
  if (s.includes('CE') || s.includes('PE')) return 'EQ_OPT';
  if (s.includes('FUT')) return 'EQ_FUT';
  return 'EQ_CASH';
}

// ══════════════════════════════════════════════
// POST /api/import/upload
// ══════════════════════════════════════════════
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  let processed = 0;
  let failed = 0;
  const errors = [];

  try {

    // ── Read file using XLSX
    const workbook = XLSX.readFile(req.file.path, { cellDates: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // ──────────────────────────────────────────
    // CLIENT MASTER
    // ──────────────────────────────────────────
    if (file_type === 'client_master') {
      // Columns: UCC, Client Name, Gender, Regd Date,
      //          Accross ExchOverall Status, Mobile No1, Email Id1,
      //          Last TradeAccross Exch, Day Gap, Client Address, Client Country
      const rows = XLSX.utils.sheet_to_json(sheet);

      for (const row of rows) {
        try {
          const ucc        = String(row['UCC'] || '').trim();
          const name       = String(row['Client Name'] || '').trim();
          const status     = (String(row['Accross Exch\nOverall Status'] || row['Accross ExchOverall Status'] || '').trim());
          const regdDate   = parseDate(row['Regd Date']);
          const lastTrade  = parseDate((row['Last Trade\nAccross Exch'] || row['Last TradeAccross Exch'] || '').toString().trim() || null);
          const isActive = status.toLowerCase().includes('active');
          const clientStatus = status.trim() || 'Active';

          if (!ucc || !name) { failed++; continue; }

          await pool.query(`
            INSERT INTO clients (ucc, name, client_type, plan, account_open_date, last_trade_date, is_active, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (ucc) DO UPDATE SET
              name             = EXCLUDED.name,
              account_open_date= EXCLUDED.account_open_date,
              last_trade_date  = EXCLUDED.last_trade_date,
              is_active        = EXCLUDED.is_active,
              status           = EXCLUDED.status,
              updated_at       = NOW()
          `, [ucc, name, 'RI', 'zero-brokerage', regdDate, lastTrade, isActive, clientStatus]);

          processed++;
        } catch (e) {
          failed++;
          errors.push(`Client ${row['UCC']}: ${e.message}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // TRADE FILE
    // Columns: Account Id, Client Name, Exchg. Seg,
    //          Trading Symbol, Buy/Sell, Trade Qty,
    //          Traded Value, Trade Date
    // ──────────────────────────────────────────
    else if (file_type === 'trade') {
    const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
    const grouped = {};

    // Pre-load all known UCCs once — avoids per-row DB query
    const { rows: uccRows } = await pool.query('SELECT ucc FROM clients');
    const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));

    for (const row of rows) {
      try {
        const ucc          = String(row['Account Id'] || '').trim();
        const exchg        = String(row['Exchg. Seg'] || '').trim();
        const symbol       = String(row['Trading Symbol'] || '').trim();
        const traded       = parseFloat(row['Traded Value']) || 0;
        const tradeDateRaw = String(row['Trade Date'] || '').trim();
        const tradeDate    = parseDate(tradeDateRaw);
        const segment      = getSegment(exchg, symbol);

        if (!ucc || !tradeDate) {
          failed++;
          errors.push(`Skipped row: ucc=${ucc}, date=${tradeDateRaw}`);
          continue;
        }

        if (!knownUCCs.has(ucc)) {
          failed++;
          errors.push(`UCC not found in clients: ${ucc}`);
          continue;
        }

        const key = `${ucc}__${tradeDate}__${segment}`;
        if (!grouped[key]) {
          grouped[key] = { ucc, trade_date: tradeDate, segment, turnover: 0 };
        }
        grouped[key].turnover += traded;
        processed++;

      } catch (e) {
        failed++;
        errors.push(`Trade row error: ${e.message}`);
      }
    }
    // Insert grouped aggregates into daily_trades
    for (const g of Object.values(grouped)) {
      try {
        const eqCash  = g.segment === 'EQ_CASH' ? g.turnover : 0;
        const eqFo    = (g.segment === 'EQ_OPT' || g.segment === 'EQ_FUT') ? g.turnover : 0;
        const commFo  = g.segment === 'COMM_FO' ? g.turnover : 0;
        const optPrem = g.segment === 'EQ_OPT'  ? g.turnover : 0;

        await pool.query(`
          INSERT INTO daily_trades
            (ucc, trade_date, eq_cash_turnover, eq_fo_turnover,
             commodity_fo_turnover, options_premium_turnover)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (ucc, trade_date) DO UPDATE SET
            eq_cash_turnover         = daily_trades.eq_cash_turnover + EXCLUDED.eq_cash_turnover,
            eq_fo_turnover           = daily_trades.eq_fo_turnover + EXCLUDED.eq_fo_turnover,
            commodity_fo_turnover    = daily_trades.commodity_fo_turnover + EXCLUDED.commodity_fo_turnover,
            options_premium_turnover = daily_trades.options_premium_turnover + EXCLUDED.options_premium_turnover
        `, [g.ucc, g.trade_date, eqCash, eqFo, commFo, optPrem]);

        // Update last_trade_date on clients using GREATEST to always keep latest
        await pool.query(`
          UPDATE clients
          SET last_trade_date = GREATEST(last_trade_date, $1::date), updated_at = NOW()
          WHERE ucc = $2
        `, [g.trade_date, g.ucc]);

      } catch (e) {
        console.error(`Trade insert ERROR → UCC:${g.ucc} Segment:${g.segment} Date:${g.trade_date} Error:`, e.message);
        errors.push(`Trade insert ${g.ucc}: ${e.message}`);
      }
    }
  }
    // ──────────────────────────────────────────
    // BROKERAGE FILE
    // Has 2 header rows. Row 2+ has:
    // Col 0: "NAME [UCC]", Col 7: Brokerage(G), Col 8: Turnoverin Rs.
    // ──────────────────────────────────────────
    else if (file_type === 'brokerage') {
      // Skip first 2 rows (double header)
      const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, header: 1, defval: '' });

      const today = new Date().toISOString().split('T')[0];

      for (const row of rows) {
        try {
          const party     = String(row[0] || '').trim();
          const ucc       = extractUCC(party);
          const brokerage = parseFloat(row[7]) || 0;   // Brokerage(G)
          const turnover  = parseFloat(row[8]) || 0;   // Turnoverin Rs.

          if (!ucc) { failed++; continue; }

          await pool.query(`
            INSERT INTO daily_trades (ucc, trade_date, brokerage_earned)
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, trade_date) DO UPDATE SET
              brokerage_earned = EXCLUDED.brokerage_earned
          `, [ucc, today, brokerage]);

          processed++;
        } catch (e) {
          failed++;
          errors.push(`Brokerage ${row[0]}: ${e.message}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // LEDGER FILE
    // Row 0 = header: UCC, Account Name, ClosingDebit, ClosingCredit
    // Opening balance = ClosingCredit - ClosingDebit
    // ──────────────────────────────────────────
    else if (file_type === 'ledger') {
      // First row is header (Unnamed: 0 = UCC etc)
      const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, header: 1, defval: 0 });

      const today = new Date().toISOString().split('T')[0];

      for (const row of rows) {
        try {
          const ucc     = String(row[0] || '').trim();
          const debit   = parseFloat(row[2]) || 0;  // ClosingDebit
          const credit  = parseFloat(row[3]) || 0;  // ClosingCredit
          const balance = credit - debit;            // Net balance

          if (!ucc || isNaN(balance)) { failed++; continue; }

          await pool.query(`
            INSERT INTO daily_ledger (ucc, ledger_date, opening_balance)
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, ledger_date) DO UPDATE SET
              opening_balance = EXCLUDED.opening_balance
          `, [ucc, today, balance]);

          processed++;
        } catch (e) {
          failed++;
          errors.push(`Ledger ${row[0]}: ${e.message}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // HOLDING FILE
    // Pipe-delimited single column:
    // UCC|ISIN|qty|0|1|0|price||0|||value
    // Position: 0=UCC, 1=ISIN, 2=qty, 6=price, 11=value
    // We compute: total_holding_value = SUM(qty * price) per UCC
    // ──────────────────────────────────────────
    else if (file_type === 'holdings') {
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const today = new Date().toISOString().split('T')[0];

      // Group holdings by UCC
      const holdings = {};

      for (const row of rawRows) {
        try {
          const rawStr = String(row[0] || '').trim();
          if (!rawStr) continue;

          const parts = rawStr.split('|');
          if (parts.length < 7) continue;

          const ucc   = String(parts[0]).trim();
          const value = parseFloat(parts[11]) || 0;

          if (!ucc) continue;

          if (!holdings[ucc]) holdings[ucc] = 0;
          holdings[ucc] += value;
          processed++;
        } catch (e) {
          failed++;
          errors.push(`Holding row: ${e.message}`);
        }
      }

      // Insert total holding value per UCC
      for (const [ucc, totalValue] of Object.entries(holdings)) {
        try {
          await pool.query(`
            INSERT INTO holdings_summary (ucc, holding_date, total_holding_value)
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, holding_date) DO UPDATE SET
              total_holding_value = EXCLUDED.total_holding_value
          `, [ucc, today, totalValue]);
        } catch (e) {
          errors.push(`Holdings insert ${ucc}: ${e.message}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // MTF FILE
    // Row 0 = header. Key columns:
    // UCC, FromDate, ToDate, InterestRate (%), Interest(Rs.), NetCharged
    // ──────────────────────────────────────────
    else if (file_type === 'mtf') {
  // Use header row (row 0) as keys
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 });

  for (const row of rows) {
    try {
      const ucc        = String(row['UCC'] || '').trim();
      const fromDate   = parseDate(row['From\nDate'] || row['FromDate'] || row['From Date'] || row['VoucherDate'] || row['Voucher\nDate']);
      const interest   = parseFloat(row['Interest\n(Rs.)'] || row['Interest(Rs.)'] || row['Interest'] || 0);
      const netCharged = parseFloat(row['Net\nCharged'] || row['NetCharged'] || row['Net Charged'] || 0);

      if (!ucc || ucc === 'UCC' || !fromDate) { failed++; continue; }

      const monthYear = fromDate.substring(0, 7);

      await pool.query(`
        INSERT INTO mtf_monthly (ucc, month_year, avg_mtf_balance, interest_earned)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (ucc, month_year) DO UPDATE SET
          interest_earned = mtf_monthly.interest_earned + EXCLUDED.interest_earned
      `, [ucc, monthYear, 0, netCharged || interest]);

      processed++;
    } catch (e) {
      failed++;
      errors.push(`MTF ${row['UCC']}: ${e.message}`);
    }
  }
}

    // ──────────────────────────────────────────
    // BHAVCOPY — future implementation
    // ──────────────────────────────────────────
    else if (file_type === 'bhavcopy') {
      res.json({ message: 'Bhavcopy import noted — implementation pending', processed: 0, failed: 0 });
      return;
    }

    // ── Log the import
    await pool.query(`
      INSERT INTO import_log
      (import_date, file_type, file_name, records_processed,
       records_failed, status, imported_by, created_at)
      VALUES (NOW(),$1,$2,$3,$4,$5,$6,NOW())
    `, [
      file_type,
      req.file.originalname,
      processed,
      failed,
      failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'),
      req.user.id
    ]);

    // ── Delete temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.json({
      message: 'Import complete',
      processed,
      failed,
      errors: errors.slice(0, 10)
    });

  } catch (err) {
    console.error('IMPORT MAIN ERROR:', err.message);
    if (fs.existsSync(req.file?.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: 'Import failed', error: err.message });
  }
});

// ══════════════════════════════════════════════
// GET /api/import/logs
// ══════════════════════════════════════════════
router.get('/logs', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT il.*, u.name AS imported_by_name
      FROM import_log il
      LEFT JOIN users u ON il.imported_by = u.id
      ORDER BY il.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ══════════════════════════════════════════════
// POST /api/import/run-pipeline
// ══════════════════════════════════════════════
router.post('/run-pipeline', auth, async (req, res) => {
  try {
    const checks = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='trade'        AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='brokerage'    AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='ledger'       AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='holdings'     AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='client_master'AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '7 day'`),
    ]);

    const names   = ['Trade File','Brokerage File','Ledger File','Holdings File','Client Master'];
    const missing = checks.map((r,i) => parseInt(r.rows[0].count) === 0 ? names[i] : null).filter(Boolean);

    if (missing.length > 0) {
      return res.status(400).json({
        message: 'Pipeline cannot run. Missing files: ' + missing.join(', ')
      });
    }

    res.json({ message: 'Import pipeline completed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Pipeline failed', error: err.message });
  }
});

module.exports = router;