const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db');
const auth = require('../middleware/auth');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { file_type } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let processed = 0;
    let failed = 0;
    const errors = [];

    for (const row of rows) {
      try {

        // CLIENT MASTER
        if (file_type === 'client_master') {

          await pool.query(`
            INSERT INTO clients
            (ucc, name, client_type, plan, account_open_date)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (ucc)
            DO UPDATE SET
              name = EXCLUDED.name,
              client_type = EXCLUDED.client_type,
              plan = EXCLUDED.plan,
              account_open_date = EXCLUDED.account_open_date,
              updated_at = NOW()
          `, [
            row.UCC || row.ucc,
            row.Name || row.name,
            row.Type || row.client_type,
            row.Plan || row.plan,
            row.OpenDate || row.open_date || null
          ]);

        }

        // TRADE FILE
        else if (file_type === 'trade') {

          const ucc = row.UCC || row.ucc;
          const tradeDate = row.Date || row.trade_date;

          await pool.query(`
            INSERT INTO daily_trades
            (
              ucc,
              trade_date,
              eq_cash_turnover,
              eq_fo_turnover,
              commodity_fo_turnover,
              options_premium_turnover,
              brokerage_earned
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (ucc, trade_date)
            DO UPDATE SET
              eq_cash_turnover = EXCLUDED.eq_cash_turnover,
              eq_fo_turnover = EXCLUDED.eq_fo_turnover,
              commodity_fo_turnover = EXCLUDED.commodity_fo_turnover,
              options_premium_turnover = EXCLUDED.options_premium_turnover,
              brokerage_earned = EXCLUDED.brokerage_earned
          `, [
            ucc,
            tradeDate,
            row.EQCash || 0,
            row.EQFO || 0,
            row.CommodityFO || 0,
            row.Options || 0,
            row.Brokerage || 0
          ]);

          await pool.query(`
            UPDATE clients
            SET
              last_trade_date = $1,
              updated_at = NOW()
            WHERE ucc = $2
          `, [
            tradeDate,
            ucc
          ]);

          console.log('LAST TRADE DATE UPDATED:', ucc, tradeDate);
        }

        // BROKERAGE FILE
        else if (file_type === 'brokerage') {

          await pool.query(`
            INSERT INTO daily_trades
            (
              ucc,
              trade_date,
              brokerage_earned
            )
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, trade_date)
            DO UPDATE SET
              brokerage_earned = EXCLUDED.brokerage_earned
          `, [
            row.UCC || row.ucc,
            row.Date || row.trade_date,
            row.Brokerage ||
            row.brokerage ||
            row.BrokerageAmount ||
            0
          ]);
        }

        // LEDGER FILE
        else if (file_type === 'ledger') {

          await pool.query(`
            INSERT INTO daily_ledger
            (
              ucc,
              ledger_date,
              opening_balance
            )
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, ledger_date)
            DO UPDATE SET
              opening_balance = EXCLUDED.opening_balance
          `, [
            row.UCC || row.ucc,
            row.Date || row.ledger_date,
            row.Balance || 0
          ]);
        }

        // BHAVCOPY FILE
        else if (file_type === 'bhavcopy') {

          // Future logic pending
          console.log('BHAVCOPY FILE RECEIVED');
        }

        // HOLDINGS FILE
        else if (file_type === 'holdings') {

          await pool.query(`
            INSERT INTO holdings_summary
            (
              ucc,
              holding_date,
              total_holding_value
            )
            VALUES ($1,$2,$3)
            ON CONFLICT (ucc, holding_date)
            DO UPDATE SET
              total_holding_value = EXCLUDED.total_holding_value
          `, [
            row.UCC || row.ucc,
            row.Date || row.holding_date,
            row.HoldingValue || 0
          ]);
        }

        // MTF FILE
        else if (file_type === 'mtf') {

          await pool.query(`
            INSERT INTO mtf_monthly
            (
              ucc,
              month_year,
              avg_mtf_balance,
              interest_earned
            )
            VALUES ($1,$2,$3,$4)
            ON CONFLICT (ucc, month_year)
            DO UPDATE SET
              avg_mtf_balance = EXCLUDED.avg_mtf_balance,
              interest_earned = EXCLUDED.interest_earned
          `, [
            row.UCC || row.ucc,
            row.MonthYear || row.month_year,
            row.MTFBalance || 0,
            row.Interest || 0
          ]);
        }

        processed++;

      } catch (e) {

        console.log('IMPORT ERROR:', e.message);
        console.log('ROW:', row);

        failed++;
        errors.push(e.message);
      }
    }

    await pool.query(`
      INSERT INTO import_log
      (
        import_date,
        file_type,
        file_name,
        records_processed,
        records_failed,
        status,
        imported_by
      )
      VALUES
      (
        NOW(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
    `, [
      file_type,
      req.file.originalname,
      processed,
      failed,
      failed === 0 ? 'success' : 'failed',
      req.user.id
    ]);

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      message: 'Import complete',
      processed,
      failed,
      errors: errors.slice(0, 10)
    });

  } catch (err) {

    console.log('IMPORT MAIN ERROR:', err.message);

    res.status(500).json({
      message: 'Import failed',
      error: err.message
    });
  }
});

router.get('/logs', auth, async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        il.*,
        u.name AS imported_by_name
      FROM import_log il
      LEFT JOIN users u
        ON il.imported_by = u.id
      ORDER BY il.created_at DESC
      LIMIT 50
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      message: 'Server error'
    });
  }
});

router.post('/run-pipeline', auth, async (req, res) => {
  try {
    const checks = await Promise.all([
      pool.query("SELECT COUNT(*) FROM import_log WHERE file_type = 'trade' AND status = 'success'"),
      pool.query("SELECT COUNT(*) FROM import_log WHERE file_type = 'brokerage' AND status = 'success'"),
      pool.query("SELECT COUNT(*) FROM import_log WHERE file_type = 'ledger' AND status = 'success'"),
      pool.query("SELECT COUNT(*) FROM import_log WHERE file_type = 'holdings' AND status = 'success'"),
      pool.query("SELECT COUNT(*) FROM import_log WHERE file_type = 'mtf' AND status = 'success'")
    ]);

    const missing = [];
    const names = ['Trade File', 'Brokerage File', 'Ledger File', 'Holdings File', 'MTF File'];

    checks.forEach((r, i) => {
      if (parseInt(r.rows[0].count) === 0) missing.push(names[i]);
    });

    if (missing.length > 0) {
      return res.status(400).json({
        message: 'Pipeline cannot run. Missing files: ' + missing.join(', ')
      });
    }

    res.json({
      message: 'Import pipeline completed successfully'
    });

  } catch (err) {
    res.status(500).json({
      message: 'Pipeline failed',
      error: err.message
    });
  }
});

module.exports = router;