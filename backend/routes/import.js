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

  // DD/MM/YYYY or DD-MM-YYYY or DD-Mon-YY (e.g. 18-Jun-26)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const yr  = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${mon}-${day}`;
  }

  // DD-Mon-YY format (e.g. 18-Jun-26)
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                   jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const m2 = s.match(/^(\d{1,2})[\/\-]([a-zA-Z]{3})[\/\-](\d{2,4})$/);
  if (m2) {
    const day = m2[1].padStart(2, '0');
    const mon = months[m2[2].toLowerCase()] || '01';
    const yr  = m2[3].length === 2 ? '20' + m2[3] : m2[3];
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

// ── Helper: determine segment from Exchg. Seg + Instrument Name
// Real file values:
//   Exchg. Seg: NSE, BSE → EQ_CASH
//   Exchg. Seg: NFO, BFO + Instrument: OPTIDX/OPTSTK → EQ_OPT
//   Exchg. Seg: NFO, BFO + Instrument: FUTIDX/FUTSTK → EQ_FUT
//   Exchg. Seg: MCX, NCDEX + Instrument: OPTFUT/OPTIDX → COMM_OPT
//   Exchg. Seg: MCX, NCDEX + Instrument: FUTCOM → COMM_FUT
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
  // NSE / BSE — equity cash
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
    // FIX: Use raw:true + cellDates:false to avoid Trans. Time crash in trade ODS files
    const workbook = XLSX.readFile(req.file.path, { cellDates: false, raw: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // ──────────────────────────────────────────
    // CLIENT MASTER
    // Columns: UCC, Client Name, Gender, Regd Date,
    //          Accross ExchOverall Status, Mobile No1, Email Id1,
    //          Last TradeAccross Exch, Day Gap, Client Address, Client Country
    // ──────────────────────────────────────────
    if (file_type === 'client_master') {
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });

      for (const row of rows) {
        try {
          const ucc    = String(row['UCC'] || '').trim();
          const name   = String(row['Client Name'] || '').trim();
          const status = String(
            row['Accross Exch\nOverall Status'] ||
            row['Accross ExchOverall Status'] ||
            row['Overall Status'] || ''
          ).trim();
          const regdDate  = parseDate(row['Regd Date']);
          const lastTrade = parseDate(
            String(row['Last Trade\nAccross Exch'] || row['Last TradeAccross Exch'] || '').trim()
          );
          const isActive     = status.toLowerCase().includes('active');
          const clientStatus = status || 'Active';

          if (!ucc || !name) { failed++; continue; }

          await pool.query(`
            INSERT INTO clients
              (ucc, name, client_type, plan, account_open_date, last_trade_date, is_active, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (ucc) DO UPDATE SET
              name              = EXCLUDED.name,
              account_open_date = EXCLUDED.account_open_date,
              last_trade_date   = EXCLUDED.last_trade_date,
              is_active         = EXCLUDED.is_active,
              status            = EXCLUDED.status,
              updated_at        = NOW()
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
    // Columns: Account Id, Client Name, Exchg. Seg, Trading Symbol,
    //          Instrument Name, Traded Value, Trade Date
    //
    // FIX 1: Use Instrument Name (not Trading Symbol) for segment detection
    // FIX 2: Separate EQ_OPT and COMM_OPT correctly
    // FIX 3: raw:true avoids Trans. Time column crash
    // NOTE: Save TradeFile as .xlsx from LibreOffice before uploading
    //       (ODS Trans. Time column format "56:17.7" can crash on some servers)
    // ──────────────────────────────────────────
    else if (file_type === 'trade') {
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const grouped = {};

      // Pre-load all known UCCs once
      const { rows: uccRows } = await pool.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));

      for (const row of rows) {
        try {
          const ucc       = String(row['Account Id'] || '').trim();
          const exchg     = String(row['Exchg. Seg'] || '').trim();
          const instrName = String(row['Instrument Name'] || '').trim();
          const traded    = parseFloat(row['Traded Value']) || 0;
          const tradeDateRaw = String(row['Trade Date'] || '').trim();
          const tradeDate = parseDate(tradeDateRaw);
          const segment   = getSegment(exchg, instrName);

          if (!ucc || !tradeDate || traded <= 0) {
            failed++;
            continue;
          }

          if (!knownUCCs.has(ucc)) {
            failed++;
            errors.push(`UCC not in clients: ${ucc}`);
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
          errors.push(`Trade row: ${e.message}`);
        }
      }

      // Insert grouped aggregates into daily_trades
      for (const g of Object.values(grouped)) {
        try {
          const eqCash  = g.segment === 'EQ_CASH'  ? g.turnover : 0;
          const eqFut   = g.segment === 'EQ_FUT'   ? g.turnover : 0;
          const eqOpt   = g.segment === 'EQ_OPT'   ? g.turnover : 0;
          const commFut = g.segment === 'COMM_FUT'  ? g.turnover : 0;
          const commOpt = g.segment === 'COMM_OPT'  ? g.turnover : 0;

          // eq_fo_turnover = futures + options combined
          // options_premium_turnover = equity options + commodity options (primary AI signal)
          // commodity_fo_turnover = commodity futures + commodity options
          const eqFoTotal   = eqFut + eqOpt;
          const optPremTotal = eqOpt + commOpt;
          const commTotal    = commFut + commOpt;

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
          `, [g.ucc, g.trade_date, eqCash, eqFoTotal, commTotal, optPremTotal]);

          // Keep last_trade_date always at the latest date seen
          await pool.query(`
            UPDATE clients
            SET last_trade_date = GREATEST(last_trade_date, $1::date), updated_at = NOW()
            WHERE ucc = $2
          `, [g.trade_date, g.ucc]);

        } catch (e) {
          console.error(`Trade insert ERROR → UCC:${g.ucc} Seg:${g.segment} Date:${g.trade_date}:`, e.message);
          errors.push(`Trade insert ${g.ucc}: ${e.message}`);
        }
      }
    }

    // ──────────────────────────────────────────
    // BROKERAGE FILE
    // Has 2 header rows:
    //   Row 0: Party | Square-Off | ... | Total | ... | NetBrokerage | GST
    //   Row 1: NaN   | Brokerage  | TurnoverIn Rs. | ... | Brokerage(G) | Turnoverin Rs. | ...
    //   Row 2+: data
    // Col 0: "NAME [UCC]"
    // Col 7: Brokerage(G)  ← total brokerage
    // Col 8: Turnoverin Rs. ← total turnover
    //
    // FIX: was range:3 (skipped 3 rows, missed first data row). Correct is range:2
    // ──────────────────────────────────────────
    else if (file_type === 'brokerage') {
      // range:2 → skip 2 header rows, data starts at row index 2
      const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, header: 1, defval: '' });

      const today = new Date().toISOString().split('T')[0];

      for (const row of rows) {
        try {
          const party     = String(row[0] || '').trim();
          const ucc       = extractUCC(party);
          const brokerage = parseFloat(row[7]) || 0;  // Brokerage(G)
          const turnover  = parseFloat(row[8]) || 0;  // Turnoverin Rs.

          if (!ucc) { failed++; continue; }
          // Skip summary/total rows
          if (party.toLowerCase().includes('total') || party.toLowerCase().includes('grand')) continue;

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
    // Row 0: header row — UCC, Account Name, ClosingDebit, ClosingCredit
    // Row 1+: data
    // Opening balance = ClosingCredit - ClosingDebit
    //
    // FIX: was range:2 (skipped header + first data row). Correct is range:1
    // ──────────────────────────────────────────
    else if (file_type === 'ledger') {
      // range:1 → skip 1 header row, data starts at row index 1
      const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, header: 1, defval: 0 });

      const today = new Date().toISOString().split('T')[0];

      for (const row of rows) {
        try {
          const ucc     = String(row[0] || '').trim();
          const debit   = parseFloat(row[2]) || 0;  // ClosingDebit
          const credit  = parseFloat(row[3]) || 0;  // ClosingCredit
          const balance = credit - debit;            // Net opening balance

          if (!ucc || ucc === 'UCC') { failed++; continue; }

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
    // HOLDINGS FILE
    // Pipe-delimited single-column ODS:
    //   parts[0]  = UCC
    //   parts[1]  = ISIN
    //   parts[2]  = Qty
    //   parts[11] = Total holding value (already qty × price — do NOT multiply again)
    //
    // FIX: was doing qty * parts[11], but parts[11] is already the total value
    // ──────────────────────────────────────────
    else if (file_type === 'holdings') {
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const today = new Date().toISOString().split('T')[0];
      const holdings = {};

      for (const row of rawRows) {
        try {
          const rawStr = String(row[0] || '').trim();
          if (!rawStr || rawStr.startsWith('UCC')) continue;

          const parts = rawStr.split('|');
          if (parts.length < 12) continue;

          const ucc   = String(parts[0]).trim();
          const value = parseFloat(parts[11]) || 0;  // Total value — already computed

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
    // Real columns (from actual file):
    //   UCC, Client Name, ..., VoucherDate, FromDate, ToDate,
    //   InterestRate (%), GraceDays, Interest(Rs.), ..., NetCharged
    //
    // FIX: corrected column name lookup order to match real file
    // Use FromDate for month_year; fall back to VoucherDate
    // ──────────────────────────────────────────
    else if (file_type === 'mtf') {
      // Row 0 = header, data from row 1
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 });

      for (const row of rows) {
        try {
          const ucc = String(row['UCC'] || '').trim();

          // FromDate is the most reliable date field in real MTF file
          const fromDate = parseDate(
            row['FromDate'] || row['From\nDate'] || row['From Date'] ||
            row['VoucherDate'] || row['Voucher\nDate'] || ''
          );

          // NetCharged is the actual amount charged to client
          const netCharged = parseFloat(
            row['NetCharged'] || row['Net\nCharged'] || row['Net Charged'] || 0
          );
          const interest = parseFloat(
            row['Interest(Rs.)'] || row['Interest\n(Rs.)'] || row['Interest'] || 0
          );

          if (!ucc || ucc === 'UCC' || !fromDate) { failed++; continue; }

          const monthYear = fromDate.substring(0, 7); // YYYY-MM

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
    // BHAVCOPY
    // Not needed — holdings file already contains computed total values (parts[11])
    // Kept for future ISIN-level pricing if required
    // ──────────────────────────────────────────
    else if (file_type === 'bhavcopy') {
      res.json({ message: 'Bhavcopy not required — holdings file already contains computed values', processed: 0, failed: 0 });
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
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='trade'         AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='brokerage'     AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='ledger'        AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='holdings'      AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='client_master' AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '7 day'`),
    ]);

    const names   = ['Trade File', 'Brokerage File', 'Ledger File', 'Holdings File', 'Client Master'];
    const missing = checks.map((r, i) => parseInt(r.rows[0].count) === 0 ? names[i] : null).filter(Boolean);

    if (missing.length > 0) {
      return res.status(400).json({
        message: 'Pipeline cannot run. Missing recent imports: ' + missing.join(', ')
      });
    }

    res.json({ message: 'Import pipeline completed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Pipeline failed', error: err.message });
  }
});

module.exports = router;