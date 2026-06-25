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
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        SUM(dt.brokerage_earned) total_brokerage,
        SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover) total_turnover,
        SUM(dt.options_premium_turnover) total_options
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE dt.trade_date BETWEEN $1 AND $2
      GROUP BY c.ucc, c.name, c.client_type, u.name
      ORDER BY total_brokerage DESC
      LIMIT $3
    `, [fromDate, toDate, limit]);
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
        COUNT(DISTINCT c.ucc) total_clients,
        COALESCE(SUM(dt.brokerage_earned), 0) total_brokerage,
        COALESCE(SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover), 0) total_turnover,
        COUNT(DISTINCT i.id) total_interactions
      FROM users u
      LEFT JOIN clients c ON c.assigned_rm_id = u.id AND c.is_mapped = true
      LEFT JOIN daily_trades dt ON dt.ucc = c.ucc AND dt.trade_date BETWEEN $1 AND $2
      LEFT JOIN interactions i ON i.rm_id = u.id AND i.interaction_date BETWEEN $1 AND $2
      WHERE u.role = 'rm' AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_brokerage DESC
    `, [fromDate, toDate]);
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
      WHERE trade_date >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY trade_date, TO_CHAR(trade_date, 'DD Mon')
      ORDER BY trade_date ASC
      LIMIT $2
    `, [parseInt(days), parseInt(days)]);

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

router.get('/client-analytics', auth, async (req, res) => {
  try {
    const { days = 17 } = req.query;

    const result = await pool.query(`
      SELECT
        TO_CHAR(trade_date, 'DD Mon') AS date,
        trade_date,
        COUNT(DISTINCT CASE WHEN dt.brokerage_earned > 0 THEN dt.ucc END) AS profitable_clients,
        COUNT(DISTINCT CASE WHEN dt.brokerage_earned = 0 OR dt.brokerage_earned IS NULL THEN dt.ucc END) AS loss_clients,
        COUNT(DISTINCT CASE WHEN c.client_type IN ('NRI','NRE','NRO','NRE-HV','NRO-HV') THEN dt.ucc END) AS nri_clients,
        COUNT(DISTINCT dt.ucc) AS total_clients
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      WHERE trade_date >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY trade_date, TO_CHAR(trade_date, 'DD Mon')
      ORDER BY trade_date ASC
      LIMIT $2
    `, [parseInt(days), parseInt(days)]);

    res.json(result.rows.map(r => ({
      date:               r.date,
      profitable_clients: parseInt(r.profitable_clients) || 0,
      loss_clients:       parseInt(r.loss_clients)       || 0,
      nri_clients:        parseInt(r.nri_clients)        || 0,
      total_clients:      parseInt(r.total_clients)      || 0,
      resident:           (parseInt(r.total_clients) - parseInt(r.nri_clients)) || 0
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/new-business', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', trade_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        COUNT(DISTINCT CASE WHEN eq_cash_turnover > 0 THEN ucc END) AS eq_cash,
        COUNT(DISTINCT CASE WHEN options_premium_turnover > 0 OR eq_fo_turnover > 0 THEN ucc END) AS eq_options,
        COUNT(DISTINCT CASE WHEN commodity_fo_turnover > 0 THEN ucc END) AS comm_futures
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', trade_date)
      ORDER BY month_start ASC
    `);

    const newAccounts = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', account_open_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', account_open_date) AS month_start,
        COUNT(*) AS opened
      FROM clients
      WHERE account_open_date >= NOW() - INTERVAL '12 months'
        AND account_open_date IS NOT NULL
      GROUP BY DATE_TRUNC('month', account_open_date)
      ORDER BY month_start ASC
    `);

    const ledgerBalance = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', c.account_open_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', c.account_open_date) AS month_start,
        SUM(dl.opening_balance) AS new_client_balance
      FROM clients c
      JOIN daily_ledger dl ON c.ucc = dl.ucc
      WHERE c.account_open_date >= NOW() - INTERVAL '12 months'
        AND c.account_open_date IS NOT NULL
        AND dl.ledger_date = (
          SELECT MIN(ledger_date) FROM daily_ledger WHERE ucc = c.ucc
        )
      GROUP BY DATE_TRUNC('month', c.account_open_date)
      ORDER BY month_start ASC
    `);

    res.json({
      clients:     result.rows,
      new_accounts: newAccounts.rows,
      ledger:      ledgerBalance.rows
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/revenue-ramp', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.ucc,
        DATE_TRUNC('month', dt.trade_date) AS trade_month,
        DATE_TRUNC('month', c.account_open_date) AS open_month,
        EXTRACT(YEAR FROM AGE(
          DATE_TRUNC('month', dt.trade_date),
          DATE_TRUNC('month', c.account_open_date)
        )) * 12 +
        EXTRACT(MONTH FROM AGE(
          DATE_TRUNC('month', dt.trade_date),
          DATE_TRUNC('month', c.account_open_date)
        )) AS months_since_open,
        SUM(dt.brokerage_earned) AS monthly_brokerage,
        MAX(CASE WHEN dt.options_premium_turnover > 0
                   OR dt.eq_fo_turnover > 0 THEN 1 ELSE 0 END) AS is_options_active
      FROM clients c
      JOIN daily_trades dt ON c.ucc = dt.ucc
      WHERE c.account_open_date IS NOT NULL
        AND dt.trade_date >= c.account_open_date
      GROUP BY c.ucc, c.account_open_date,
               DATE_TRUNC('month', c.account_open_date),
               DATE_TRUNC('month', dt.trade_date)
    `);

    const cohortMap = {};
    result.rows.forEach(r => {
      const m = parseInt(r.months_since_open);
      if (m < 0 || m > 7) return;
      if (!cohortMap[m]) cohortMap[m] = { total: 0, count: 0, options_count: 0 };
      cohortMap[m].total        += parseFloat(r.monthly_brokerage) || 0;
      cohortMap[m].count        += 1;
      if (parseInt(r.is_options_active) === 1) cohortMap[m].options_count += 1;
    });

    const rampData = Array.from({ length: 8 }, (_, i) => ({
      month:       `M${i + 1}`,
      avg_revenue: cohortMap[i] && cohortMap[i].count > 0
        ? Math.round(cohortMap[i].total / cohortMap[i].count)
        : 0,
      options_pct: cohortMap[i] && cohortMap[i].count > 0
        ? Math.round(cohortMap[i].options_count / cohortMap[i].count * 100)
        : 0
    }));

    const splitResult = await pool.query(`
      SELECT
        segment,
        ROUND(AVG(monthly_brokerage)::numeric, 2) AS avg_brokerage
      FROM (
        SELECT
          c.ucc,
          DATE_TRUNC('month', dt.trade_date) AS trade_month,
          SUM(dt.brokerage_earned) AS monthly_brokerage,
          CASE
            WHEN MAX(CASE WHEN dt.options_premium_turnover > 0
                            OR dt.eq_fo_turnover > 0 THEN 1 ELSE 0 END) = 1
            THEN 'Options activated'
            ELSE 'Equity only'
          END AS segment
        FROM clients c
        JOIN daily_trades dt ON c.ucc = dt.ucc
        WHERE c.account_open_date IS NOT NULL
        GROUP BY c.ucc, DATE_TRUNC('month', dt.trade_date)
      ) sub
      GROUP BY segment
      ORDER BY avg_brokerage DESC
    `);

    res.json({
      ramp:  rampData,
      split: splitResult.rows
    });
  } catch (err) {
    console.error('REVENUE RAMP ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/rm-impact', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.name AS rm_name,
        COUNT(DISTINCT c.ucc) AS total_clients,
        COALESCE(SUM(dt.brokerage_earned), 0) AS total_brokerage,
        COALESCE(SUM(dt.options_premium_turnover + dt.eq_fo_turnover), 0) AS total_options_to,
        COALESCE(SUM(dt.eq_cash_turnover), 0) AS total_eq_cash,
        COUNT(DISTINCT dt.trade_date) AS active_days
      FROM users u
      JOIN rm_master rm ON LOWER(rm.rm_name) = LOWER(u.name)
      JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN daily_trades dt ON dt.ucc = c.ucc
      WHERE u.role IN ('rm', 'team_leader')
        AND u.is_active = true
        AND c.is_mapped = true
      GROUP BY u.name
      ORDER BY total_brokerage DESC
    `);

    const rows = result.rows.map(r => ({
      name:          r.rm_name,
      total_clients: parseInt(r.total_clients) || 0,
      post_rev:      Math.round(parseFloat(r.total_brokerage) || 0),
      pre_rev:       0,
      post_vol:      parseFloat(
        ((parseFloat(r.total_options_to) || 0) / 10000000).toFixed(2)
      ),
      pre_vol:       0,
      active_days:   parseInt(r.active_days) || 0
    }));

    res.json(rows);
  } catch (err) {
    console.error('RM IMPACT ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/market-share', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', trade_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        SUM(options_premium_turnover + eq_fo_turnover) / 10000000.0 AS navia_options_cr,
        SUM(eq_cash_turnover) / 10000000.0 AS navia_eq_cash_cr,
        SUM(commodity_fo_turnover) / 10000000.0 AS navia_comm_cr,
        COUNT(DISTINCT CASE WHEN options_premium_turnover > 0
                              OR eq_fo_turnover > 0 THEN ucc END) AS options_clients,
        COUNT(DISTINCT ucc) AS total_clients
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '9 months'
      GROUP BY DATE_TRUNC('month', trade_date)
      ORDER BY month_start ASC
    `);

    res.json(result.rows.map(r => ({
      month:              r.month,
      navia_options_cr:   parseFloat(parseFloat(r.navia_options_cr).toFixed(2))   || 0,
      navia_eq_cash_cr:   parseFloat(parseFloat(r.navia_eq_cash_cr).toFixed(2))   || 0,
      navia_comm_cr:      parseFloat(parseFloat(r.navia_comm_cr).toFixed(2))      || 0,
      options_clients:    parseInt(r.options_clients) || 0,
      total_clients:      parseInt(r.total_clients)   || 0,
    })));
  } catch (err) {
    console.error('MARKET SHARE ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/market-share', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', trade_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        SUM(options_premium_turnover + eq_fo_turnover) / 10000000.0 AS navia_options_cr,
        SUM(eq_cash_turnover) / 10000000.0 AS navia_eq_cash_cr,
        SUM(commodity_fo_turnover) / 10000000.0 AS navia_comm_cr,
        COUNT(DISTINCT CASE WHEN options_premium_turnover > 0
                              OR eq_fo_turnover > 0 THEN ucc END) AS options_clients,
        COUNT(DISTINCT ucc) AS total_clients
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '9 months'
      GROUP BY DATE_TRUNC('month', trade_date)
      ORDER BY month_start ASC
    `);

    res.json(result.rows.map(r => ({
      month:              r.month,
      navia_options_cr:   parseFloat(parseFloat(r.navia_options_cr).toFixed(2))   || 0,
      navia_eq_cash_cr:   parseFloat(parseFloat(r.navia_eq_cash_cr).toFixed(2))   || 0,
      navia_comm_cr:      parseFloat(parseFloat(r.navia_comm_cr).toFixed(2))      || 0,
      options_clients:    parseInt(r.options_clients) || 0,
      total_clients:      parseInt(r.total_clients)   || 0,
    })));
  } catch (err) {
    console.error('MARKET SHARE ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;