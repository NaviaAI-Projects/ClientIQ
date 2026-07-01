const express = require('express');
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../db');
const auth    = require('../middleware/auth');
const fs      = require('fs');
const upload  = multer({ dest: 'uploads/' });

const BATCH_SIZE = 500; // Insert 500 rows at a time

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
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06', jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
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

// Bulk insert helper — inserts rows in batches
async function bulkInsert(client, query, valuesFn, rows, batchSize = BATCH_SIZE) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch  = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    let   pi     = 1;
    for (const row of batch) {
      const v = valuesFn(row);
      if (!v) continue;
      values.push(`(${v.map(() => `$${pi++}`).join(',')})`);
      params.push(...v);
    }
    if (values.length === 0) continue;
    const sql = query.replace('__VALUES__', values.join(','));
    await client.query(sql, params);
    inserted += values.length;
  }
  return inserted;
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  let processed = 0, failed = 0;
  const errors = [];
  const dbClient = await pool.connect();

  try {
    const workbook  = XLSX.readFile(req.file.path, { cellDates: false, raw: true });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];

    await dbClient.query('BEGIN');

    // ── CLIENT MASTER ──────────────────────────────────────
    if (file_type === 'client_master') {
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const validRows = [];

      for (const row of rows) {
        const ucc    = String(row['UCC'] || '').trim();
        const name   = String(row['Client Name'] || '').trim();
        if (!ucc || !name) { failed++; continue; }

        const status    = String(row['Accross Exch\nOverall Status'] || row['Accross ExchOverall Status'] || row['Overall Status'] || '').trim();
        const regdDate  = parseDate(row['Regd Date']);
        const lastTrade = parseDate(String(row['Last Trade\nAccross Exch'] || row['Last TradeAccross Exch'] || '').trim());
        const isActive  = status.toLowerCase().includes('active');
        validRows.push({ ucc, name, regdDate, lastTrade, isActive, status: status || 'Active' });
      }

      // Deduplicate by UCC — keep last occurrence
      const uccMap = {};
      for (const r of validRows) uccMap[r.ucc] = r;
      const dedupedRows = Object.values(uccMap);

      // Bulk upsert in batches
      for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
        validRows.length = 0; // clear for loop reference fix
        const batch = dedupedRows.slice(i, i + BATCH_SIZE);
        const values = [];
        const params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(r.ucc, r.name, 'RI', 'zero-brokerage', r.regdDate, r.lastTrade, r.isActive, r.status);
        }
        await dbClient.query(`
          INSERT INTO clients (ucc, name, client_type, plan, account_open_date, last_trade_date, is_active, status)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc) DO UPDATE SET
            name = EXCLUDED.name,
            account_open_date = EXCLUDED.account_open_date,
            last_trade_date = EXCLUDED.last_trade_date,
            is_active = EXCLUDED.is_active,
            status = EXCLUDED.status,
            updated_at = NOW()
        `, params);
        processed += batch.length;
      }
    }

    // ── TRADE FILE ──────────────────────────────────────────
    else if (file_type === 'trade') {
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
      const { rows: uccRows } = await dbClient.query('SELECT ucc FROM clients');
      const knownUCCs = new Set(uccRows.map(r => String(r.ucc).trim()));
      const grouped = {};

      for (const row of rows) {
        const ucc       = String(row['Account Id'] || '').trim();
        const exchg     = String(row['Exchg. Seg'] || '').trim();
        const instrName = String(row['Instrument Name'] || '').trim();
        const traded    = parseFloat(row['Traded Value']) || 0;
        const tradeDate = parseDate(String(row['Trade Date'] || '').trim());
        const segment   = getSegment(exchg, instrName);

        if (!ucc || !tradeDate || traded <= 0) { failed++; continue; }
        if (!knownUCCs.has(ucc)) { failed++; errors.push(`UCC not found: ${ucc}`); continue; }

        const key = `${ucc}__${tradeDate}__${segment}`;
        if (!grouped[key]) grouped[key] = { ucc, trade_date: tradeDate, segment, turnover: 0 };
        grouped[key].turnover += traded;
        processed++;
      }

      // groupedRows already deduplicated by ucc+trade_date key
      const groupedRows = Object.values(grouped);
      // Extra safety - deduplicate by ucc+trade_date
      const tradeMap = {};
      for (const g of groupedRows) {
        const k = g.ucc + '__' + g.trade_date;
        if (!tradeMap[k]) tradeMap[k] = g;
        else {
          tradeMap[k].eq_cash  += g.eq_cash;
          tradeMap[k].eq_fo    += g.eq_fo;
          tradeMap[k].comm     += g.comm;
          tradeMap[k].opt_prem += g.opt_prem;
        }
      }
      const dedupedTrades = Object.values(tradeMap);
      for (let i = 0; i < dedupedTrades.length; i += BATCH_SIZE) {
        const batch = dedupedTrades.slice(i, i + BATCH_SIZE);
        const values = [];
        const params = [];
        let pi = 1;
        for (const g of batch) {
          values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
          params.push(g.ucc, g.trade_date, g.eq_cash, g.eq_fo, g.comm, g.opt_prem);
        }
        await dbClient.query(`
          INSERT INTO daily_trades (ucc, trade_date, eq_cash_turnover, eq_fo_turnover, commodity_fo_turnover, options_premium_turnover)
          VALUES ${values.join(',')}
          ON CONFLICT (ucc, trade_date) DO UPDATE SET
            eq_cash_turnover         = daily_trades.eq_cash_turnover + EXCLUDED.eq_cash_turnover,
            eq_fo_turnover           = daily_trades.eq_fo_turnover + EXCLUDED.eq_fo_turnover,
            commodity_fo_turnover    = daily_trades.commodity_fo_turnover + EXCLUDED.commodity_fo_turnover,
            options_premium_turnover = daily_trades.options_premium_turnover + EXCLUDED.options_premium_turnover
        `, params);
      }

      // Bulk update last_trade_date
      const uccsToUpdate = [...new Set(dedupedTrades.map(g => g.ucc))];
      for (let i = 0; i < uccsToUpdate.length; i += BATCH_SIZE) {
        const batch = uccsToUpdate.slice(i, i + BATCH_SIZE);
        const latestDates = {};
        dedupedTrades.filter(g => batch.includes(g.ucc)).forEach(g => {
          if (!latestDates[g.ucc] || g.trade_date > latestDates[g.ucc]) latestDates[g.ucc] = g.trade_date;
        });
        for (const [ucc, date] of Object.entries(latestDates)) {
          await dbClient.query(`UPDATE clients SET last_trade_date = GREATEST(last_trade_date, $1::date), updated_at = NOW() WHERE ucc = $2`, [date, ucc]);
        }
      }
    }

    // ── BROKERAGE FILE ──────────────────────────────────────
    else if (file_type === 'brokerage') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { range: 2, header: 1, defval: '' });
      const today = new Date().toISOString().split('T')[0];
      const validRows = [];

      for (const row of rows) {
        const party = String(row[0] || '').trim();
        const ucc   = extractUCC(party);
        if (!ucc) { failed++; continue; }
        if (party.toLowerCase().includes('total') || party.toLowerCase().includes('grand')) continue;
        const brokerage = parseFloat(row[7]) || 0;
        validRows.push({ ucc, brokerage, today });
      }

      // Deduplicate brokerage by UCC
      const brokerageMap = {};
      for (const r of validRows) brokerageMap[r.ucc] = r;
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

    // ── LEDGER FILE ─────────────────────────────────────────
    else if (file_type === 'ledger') {
      const rows  = XLSX.utils.sheet_to_json(sheet, { range: 1, header: 1, defval: 0 });
      const today = new Date().toISOString().split('T')[0];
      const validRows = [];

      for (const row of rows) {
        const ucc = String(row[0] || '').trim();
        if (!ucc || ucc === 'UCC') { failed++; continue; }
        const balance = (parseFloat(row[3]) || 0) - (parseFloat(row[2]) || 0);
        validRows.push({ ucc, balance, today });
      }

      // Deduplicate ledger by UCC
      const ledgerMap = {};
      for (const r of validRows) ledgerMap[r.ucc] = r;
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

    // ── HOLDINGS FILE ────────────────────────────────────────
    else if (file_type === 'holdings') {
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const today   = new Date().toISOString().split('T')[0];
      const holdings = {};

      for (const row of rawRows) {
        const rawStr = String(row[0] || '').trim();
        if (!rawStr || rawStr.startsWith('UCC')) continue;
        const parts = rawStr.split('|');
        if (parts.length < 12) continue;
        const ucc   = String(parts[0]).trim();
        const value = parseFloat(parts[11]) || 0;
        if (!ucc) continue;
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

    // ── MTF FILE ─────────────────────────────────────────────
    else if (file_type === 'mtf') {
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 });
      const validRows = [];

      for (const row of rows) {
        const ucc = String(row['UCC'] || '').trim();
        const fromDate = parseDate(row['FromDate'] || row['From\nDate'] || row['From Date'] || row['VoucherDate'] || row['Voucher\nDate'] || '');
        const netCharged = parseFloat(row['NetCharged'] || row['Net\nCharged'] || row['Net Charged'] || 0);
        const interest   = parseFloat(row['Interest(Rs.)'] || row['Interest\n(Rs.)'] || row['Interest'] || 0);
        if (!ucc || ucc === 'UCC' || !fromDate) { failed++; continue; }
        validRows.push({ ucc, monthYear: fromDate.substring(0, 7), amount: netCharged || interest });
      }

      // Deduplicate MTF by ucc+monthYear
      const mtfMap = {};
      for (const r of validRows) {
        const k = r.ucc + '__' + r.monthYear;
        if (!mtfMap[k]) mtfMap[k] = { ...r };
        else mtfMap[k].amount += r.amount;
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
          ON CONFLICT (ucc, month_year) DO UPDATE SET interest_earned = mtf_monthly.interest_earned + EXCLUDED.interest_earned
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

    // Log import
    await pool.query(`
      INSERT INTO import_log (import_date, file_type, file_name, records_processed, records_failed, status, imported_by, created_at)
      VALUES (NOW(),$1,$2,$3,$4,$5,$6,NOW())
    `, [file_type, req.file.originalname, processed, failed, failed === 0 ? 'success' : (processed > 0 ? 'partial' : 'failed'), req.user.id]);

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
    const checks = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='trade'         AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='brokerage'     AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='ledger'        AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='holdings'      AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM import_log WHERE file_type='client_master' AND status IN ('success','partial') AND import_date > NOW()-INTERVAL '7 day'`),
    ]);
    const names   = ['Trade File', 'Brokerage File', 'Ledger File', 'Holdings File', 'Client Master'];
    const missing = checks.map((r, i) => parseInt(r.rows[0].count) === 0 ? names[i] : null).filter(Boolean);
    if (missing.length > 0) return res.status(400).json({ message: 'Pipeline cannot run. Missing recent imports: ' + missing.join(', ') });
    res.json({ message: 'Import pipeline completed successfully' });
  } catch (err) { res.status(500).json({ message: 'Pipeline failed', error: err.message }); }
});

module.exports = router;