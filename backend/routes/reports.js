const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/top-clients', auth, async (req, res) => {
  try {
    const { limit = 20, from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type,
        COALESCE(u.name, 'Unassigned') as rm_name,
        COALESCE(SUM(dt.brokerage_earned), 0) as total_brokerage,
        COALESCE(SUM(COALESCE(dt.eq_cash_turnover,0) + COALESCE(dt.eq_fo_turnover,0) + COALESCE(dt.options_premium_turnover,0) + COALESCE(dt.commodity_fo_turnover,0)), 0) as total_turnover, COALESCE(SUM(COALESCE(dt.eq_cash_turnover,0) + COALESCE(dt.eq_fo_turnover,0) + COALESCE(dt.options_premium_turnover,0) + COALESCE(dt.commodity_fo_turnover,0)), 0) as total,
        COALESCE(SUM(dt.options_premium_turnover), 0) as total_options
      FROM clients c
      LEFT JOIN daily_trades dt ON TRIM(dt.ucc) = TRIM(c.ucc)
      LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
      LEFT JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
      GROUP BY c.ucc, c.name, c.client_type, u.name
      ORDER BY total_turnover DESC, total_brokerage DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/inactive-clients', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        MAX(dt.trade_date) last_trade_date,
        CURRENT_DATE - MAX(dt.trade_date) days_inactive
      FROM clients c
      LEFT JOIN daily_trades dt ON c.ucc = dt.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE c.is_active = true
      GROUP BY c.ucc, c.name, c.client_type, u.name
      HAVING MAX(dt.trade_date) < NOW() - INTERVAL '30 days' OR MAX(dt.trade_date) IS NULL
      ORDER BY days_inactive DESC NULLS FIRST
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/rm-performance', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT u.id, u.name,
        COUNT(DISTINCT c.ucc) as total_clients,
        COUNT(DISTINCT c.ucc) as client_count,
        COALESCE(SUM(COALESCE(dt.eq_cash_turnover,0)+COALESCE(dt.eq_fo_turnover,0)+COALESCE(dt.options_premium_turnover,0)+COALESCE(dt.commodity_fo_turnover,0)), 0) as total_turnover,
        COALESCE(SUM(dt.brokerage_earned), 0) as total_brokerage,
        (SELECT COUNT(*) FROM lead_pool lp JOIN rm_master rmx ON rmx.id = lp.assigned_to_rm WHERE LOWER(rmx.rm_name) = LOWER(u.name) AND lp.status = 'assigned') as lead_count
      FROM users u
      LEFT JOIN rm_master rm ON LOWER(rm.rm_name) = LOWER(u.name)
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id AND c.is_mapped = true
      LEFT JOIN daily_trades dt ON dt.ucc = c.ucc
      WHERE u.role = 'rm' AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_turnover DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Monthly brokerage trend (last 6 months) — for RM Revenue Tracker + Supervisor Dashboard
router.get('/monthly-brokerage', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(trade_date, 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        SUM(brokerage_earned) AS brokerage,
        SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover) AS turnover,
        SUM(options_premium_turnover) AS options_turnover
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', trade_date), TO_CHAR(trade_date, 'Mon''YY')
      ORDER BY month_start ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Revenue streams breakdown (last 8 months)
router.get('/revenue-streams', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(trade_date, 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        SUM(options_premium_turnover * 0.0005) AS options_clearing,
        SUM(brokerage_earned) AS equity_brokerage
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '8 months'
      GROUP BY DATE_TRUNC('month', trade_date), TO_CHAR(trade_date, 'Mon''YY')
      ORDER BY month_start ASC
    `);

    const ledger = await pool.query(`
      SELECT
        TO_CHAR(ledger_date, 'Mon''YY') AS month,
        DATE_TRUNC('month', ledger_date) AS month_start,
        SUM(opening_balance) * 0.065 / 12 AS float_income
      FROM daily_ledger
      WHERE ledger_date >= NOW() - INTERVAL '8 months'
      GROUP BY DATE_TRUNC('month', ledger_date), TO_CHAR(ledger_date, 'Mon''YY')
      ORDER BY month_start ASC
    `);

    const mtf = await pool.query(`
      SELECT month_year AS month, SUM(interest_earned) AS mtf_interest
      FROM mtf_monthly
      WHERE month_year >= TO_CHAR(NOW() - INTERVAL '8 months', 'YYYY-MM')
      GROUP BY month_year ORDER BY month_year ASC
    `);

    res.json({ trades: result.rows, ledger: ledger.rows, mtf: mtf.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Active vs dormant clients trend (last 12 months)
router.get('/client-activity-trend', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(trade_date, 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        COUNT(DISTINCT ucc) AS active_clients
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', trade_date), TO_CHAR(trade_date, 'Mon''YY')
      ORDER BY month_start ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Concentration risk — top N clients % of revenue
router.get('/concentration', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ucc, SUM(brokerage_earned) AS total_brokerage
      FROM daily_trades GROUP BY ucc ORDER BY total_brokerage DESC
    `);
    const total = result.rows.reduce((s, r) => s + parseFloat(r.total_brokerage), 0);
    const brackets = [10, 25, 50, 100, 200, 500];
    const concentration = brackets.map(n => ({
      label: `Top ${n}`,
      pct: total > 0
        ? Math.round(result.rows.slice(0, n).reduce((s, r) => s + parseFloat(r.total_brokerage), 0) / total * 100)
        : 0
    }));
    res.json(concentration);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Inactive clients by dormancy band
router.get('/inactive-bands', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        CASE
          WHEN CURRENT_DATE - last_trade_date BETWEEN 30 AND 90   THEN '30–90 days'
          WHEN CURRENT_DATE - last_trade_date BETWEEN 91 AND 180  THEN '90–180 days'
          WHEN CURRENT_DATE - last_trade_date BETWEEN 181 AND 365 THEN '180–365 days'
          WHEN CURRENT_DATE - last_trade_date > 365               THEN '365+ days'
          WHEN last_trade_date IS NULL                             THEN 'Never traded'
          ELSE 'Active'
        END AS band,
        COUNT(*) AS clients,
        COUNT(hs.ucc) AS with_holdings
      FROM clients c
      LEFT JOIN holdings_summary hs ON c.ucc = hs.ucc AND hs.total_holding_value > 0
      WHERE c.is_active = true
      GROUP BY band
      ORDER BY band
    `);
    res.json(result.rows.filter(r => r.band !== 'Active'));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// RM performance comparison (monthly brokerage per RM)
router.get('/rm-monthly', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 5*30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        u.name AS rm_name,
        TO_CHAR(dt.trade_date, 'Mon''YY') AS month,
        DATE_TRUNC('month', dt.trade_date) AS month_start,
        SUM(dt.brokerage_earned) AS brokerage
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      JOIN rm_master rm ON c.assigned_rm_id = rm.id
      JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
      WHERE dt.trade_date BETWEEN $1 AND $2
      GROUP BY u.name, DATE_TRUNC('month', dt.trade_date), TO_CHAR(dt.trade_date, 'Mon''YY')
      ORDER BY month_start, u.name
    `, [fromDate, toDate]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/churn-risk', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        a.churn_risk_score, a.lead_score, a.ai_notes
      FROM clients c
      JOIN ai_scores a ON c.ucc = a.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = c.ucc)
        AND a.churn_risk_score >= 60
      ORDER BY a.churn_risk_score DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/daily-options', auth, async (req, res) => {
  try {
    const { days = 18 } = req.query;

    const result = await pool.query(`
      SELECT
        TO_CHAR(trade_date, 'DD Mon') AS date,
        trade_date,
        COALESCE(SUM(options_premium_turnover), 0) AS options_to_raw,
        COALESCE(SUM(eq_fo_turnover), 0) AS eq_fo_raw,
        COALESCE(SUM(eq_cash_turnover), 0) AS eq_cash_raw,
        COUNT(DISTINCT ucc) AS options_clients,
        EXTRACT(DOW FROM trade_date) AS day_of_week
      FROM daily_trades
      WHERE trade_date >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY trade_date, TO_CHAR(trade_date, 'DD Mon')
      ORDER BY trade_date ASC
      LIMIT $1
    `, [parseInt(days)]);

    // Mark Thursday as expiry day (weekly options expire on Thursday)
    const rows = result.rows.map(r => {
      // Use options_premium_turnover if available, fall back to eq_fo_turnover
      const optionsRaw = parseFloat(r.options_to_raw) || parseFloat(r.eq_fo_raw) || 0;
      const eqCashRaw  = parseFloat(r.eq_cash_raw) || 0;
      return {
        date:            r.date,
        trade_date:      r.trade_date,
        options_to_cr:   optionsRaw,   // keep in rupees, not crores — values are small
        eq_cash:         eqCashRaw,
        options_clients: parseInt(r.options_clients) || 0,
        is_expiry:       parseInt(r.day_of_week) === 4
      };
    });

    // Calculate MTD average
    const mtdAvg = rows.length > 0
      ? rows.reduce((s, r) => s + r.options_to_cr, 0) / rows.length
      : 0;

    res.json({ rows, mtd_avg: parseFloat(mtdAvg.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;