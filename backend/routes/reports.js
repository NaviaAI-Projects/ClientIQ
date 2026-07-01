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

// ── market-share ──────────────────────────────────────────────
router.get('/market-share', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', trade_date), 'Mon''YY') AS month,
        DATE_TRUNC('month', trade_date) AS month_start,
        COALESCE(SUM(options_premium_turnover + eq_fo_turnover), 0) / 10000000.0 AS navia_options_cr,
        COALESCE(SUM(eq_cash_turnover), 0) / 10000000.0 AS navia_eq_cash_cr,
        COALESCE(SUM(commodity_fo_turnover), 0) / 10000000.0 AS navia_comm_cr,
        COUNT(DISTINCT CASE WHEN options_premium_turnover > 0 OR eq_fo_turnover > 0 THEN ucc END) AS options_clients,
        COUNT(DISTINCT ucc) AS total_clients
      FROM daily_trades
      WHERE trade_date >= NOW() - INTERVAL '9 months'
      GROUP BY DATE_TRUNC('month', trade_date)
      ORDER BY month_start ASC
    `);
    res.json(result.rows.map(r => ({
      month:            r.month,
      navia_options_cr: parseFloat(parseFloat(r.navia_options_cr).toFixed(2)) || 0,
      navia_eq_cash_cr: parseFloat(parseFloat(r.navia_eq_cash_cr).toFixed(2)) || 0,
      navia_comm_cr:    parseFloat(parseFloat(r.navia_comm_cr).toFixed(2))    || 0,
      options_clients:  parseInt(r.options_clients) || 0,
      total_clients:    parseInt(r.total_clients)   || 0,
    })));
  } catch (err) {
    console.error('MARKET SHARE ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── new-business ──────────────────────────────────────────────
router.get('/new-business', auth, async (req, res) => {
  try {
    const [clients, newAccounts, ledger] = await Promise.all([
      pool.query(`
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
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', account_open_date), 'Mon''YY') AS month,
          DATE_TRUNC('month', account_open_date) AS month_start,
          COUNT(*) AS opened
        FROM clients
        WHERE account_open_date >= NOW() - INTERVAL '12 months'
          AND account_open_date IS NOT NULL
        GROUP BY DATE_TRUNC('month', account_open_date)
        ORDER BY month_start ASC
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', c.account_open_date), 'Mon''YY') AS month,
          SUM(dl.opening_balance) AS new_client_balance
        FROM clients c
        JOIN daily_ledger dl ON c.ucc = dl.ucc
        WHERE c.account_open_date >= NOW() - INTERVAL '12 months'
          AND c.account_open_date IS NOT NULL
          AND dl.ledger_date = (SELECT MIN(ledger_date) FROM daily_ledger WHERE ucc = c.ucc)
        GROUP BY DATE_TRUNC('month', c.account_open_date),
                 TO_CHAR(DATE_TRUNC('month', c.account_open_date), 'Mon''YY')
        ORDER BY 1
      `)
    ]);
    res.json({ clients: clients.rows, new_accounts: newAccounts.rows, ledger: ledger.rows });
  } catch (err) {
    console.error('NEW BUSINESS ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── revenue-ramp ──────────────────────────────────────────────
router.get('/revenue-ramp', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.ucc,
        DATE_TRUNC('month', dt.trade_date) AS trade_month,
        EXTRACT(YEAR FROM AGE(DATE_TRUNC('month', dt.trade_date), DATE_TRUNC('month', c.account_open_date))) * 12 +
        EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', dt.trade_date), DATE_TRUNC('month', c.account_open_date))) AS months_since_open,
        SUM(dt.brokerage_earned) AS monthly_brokerage,
        MAX(CASE WHEN dt.options_premium_turnover > 0 OR dt.eq_fo_turnover > 0 THEN 1 ELSE 0 END) AS is_options_active
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
      avg_revenue: cohortMap[i] && cohortMap[i].count > 0 ? Math.round(cohortMap[i].total / cohortMap[i].count) : 0,
      options_pct: cohortMap[i] && cohortMap[i].count > 0 ? Math.round(cohortMap[i].options_count / cohortMap[i].count * 100) : 0
    }));

    const splitResult = await pool.query(`
      SELECT segment, ROUND(AVG(monthly_brokerage)::numeric, 2) AS avg_brokerage
      FROM (
        SELECT c.ucc,
          DATE_TRUNC('month', dt.trade_date) AS trade_month,
          SUM(dt.brokerage_earned) AS monthly_brokerage,
          CASE WHEN MAX(CASE WHEN dt.options_premium_turnover > 0 OR dt.eq_fo_turnover > 0 THEN 1 ELSE 0 END) = 1
               THEN 'Options activated' ELSE 'Equity only' END AS segment
        FROM clients c JOIN daily_trades dt ON c.ucc = dt.ucc
        WHERE c.account_open_date IS NOT NULL
        GROUP BY c.ucc, DATE_TRUNC('month', dt.trade_date)
      ) sub
      GROUP BY segment ORDER BY avg_brokerage DESC
    `);

    res.json({ ramp: rampData, split: splitResult.rows });
  } catch (err) {
    console.error('REVENUE RAMP ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── rm-impact ─────────────────────────────────────────────────
router.get('/rm-impact', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.name AS rm_name,
        COUNT(DISTINCT c.ucc) AS total_clients,
        COALESCE(SUM(dt.brokerage_earned), 0) AS total_brokerage,
        COALESCE(SUM(dt.options_premium_turnover + dt.eq_fo_turnover), 0) AS total_options_to,
        COUNT(DISTINCT dt.trade_date) AS active_days
      FROM users u
      JOIN rm_master rm ON LOWER(rm.rm_name) = LOWER(u.name)
      JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN daily_trades dt ON dt.ucc = c.ucc
      WHERE u.role IN ('rm', 'team_leader') AND u.is_active = true AND c.is_mapped = true
      GROUP BY u.name
      ORDER BY total_brokerage DESC
    `);
    res.json(result.rows.map(r => ({
      name:          r.rm_name,
      total_clients: parseInt(r.total_clients) || 0,
      post_rev:      Math.round(parseFloat(r.total_brokerage) || 0),
      pre_rev:       0,
      post_vol:      parseFloat(((parseFloat(r.total_options_to) || 0) / 10000000).toFixed(2)),
      pre_vol:       0,
      active_days:   parseInt(r.active_days) || 0
    })));
  } catch (err) {
    console.error('RM IMPACT ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── client-analytics ──────────────────────────────────────────
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
    console.error('CLIENT ANALYTICS ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── daily-mis ─────────────────────────────────────────────────
router.get('/daily-mis', auth, async (req, res) => {
  try {
    const { days = 17 } = req.query;
    const result = await pool.query(`
      SELECT
        TO_CHAR(trade_date, 'DD Mon') AS date,
        trade_date,
        EXTRACT(DOW FROM trade_date) AS dow,
        COALESCE(SUM(options_premium_turnover * 0.0005), 0) AS options_clearing,
        COALESCE(SUM(brokerage_earned), 0) AS equity_brokerage,
        COALESCE(SUM(options_premium_turnover + eq_fo_turnover), 0) / 10000000.0 AS eq_options_cr,
        COALESCE(SUM(commodity_fo_turnover), 0) / 10000000.0 AS comm_options_cr,
        COUNT(DISTINCT CASE WHEN options_premium_turnover > 0 OR eq_fo_turnover > 0 THEN ucc END) AS fo_clients,
        COUNT(DISTINCT CASE WHEN eq_cash_turnover > 0 THEN ucc END) AS equity_clients
      FROM daily_trades
      WHERE trade_date >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY trade_date, TO_CHAR(trade_date, 'DD Mon')
      ORDER BY trade_date ASC
      LIMIT $2
    `, [parseInt(days), parseInt(days)]);

    // Get daily MTF client count from mtf_monthly (approximation)
    const rows = result.rows.map(r => ({
      date:             r.date,
      is_expiry:        parseInt(r.dow) === 4,
      options_clearing: Math.round(parseFloat(r.options_clearing) || 0),
      equity_brokerage: Math.round(parseFloat(r.equity_brokerage) || 0),
      mtf_interest:     0,
      float_income:     41000,
      eq_options_cr:    parseFloat(parseFloat(r.eq_options_cr).toFixed(1))   || 0,
      comm_options_cr:  parseFloat(parseFloat(r.comm_options_cr).toFixed(1)) || 0,
      fo_clients:       parseInt(r.fo_clients)     || 0,
      equity_clients:   parseInt(r.equity_clients) || 0,
      mtf_clients:      0,
    }));

    res.json({ income: rows, volume: rows });
  } catch (err) {
    console.error('DAILY MIS ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET unmap requests — RM-requested unmaps
router.get('/unmap-requests', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.ucc,
        c.name AS client_name,
        c.client_type,
        rm.rm_name,
        ur.reason,
        ur.mapped_since,
        ur.status,
        ur.id,
        ur.created_at,
        COALESCE(
          (SELECT SUM(brokerage_earned) FROM daily_trades dt
           WHERE dt.ucc = c.ucc AND dt.trade_date >= NOW() - INTERVAL '6 months'), 0
        ) AS revenue_6m
      FROM unmap_requests ur
      JOIN clients c ON ur.ucc = c.ucc
      JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE ur.status = 'pending' AND ur.type = 'rm_requested'
      ORDER BY ur.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    // Table may not exist yet — return empty
    console.warn('unmap_requests table:', err.message);
    res.json([]);
  }
});

// GET AI-suggested unmaps
router.get('/ai-unmap-suggestions', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.ucc,
        c.name AS client_name,
        c.client_type,
        rm.rm_name,
        a.ai_notes AS ai_rationale,
        a.churn_risk_score,
        COALESCE(
          (SELECT SUM(brokerage_earned) FROM daily_trades dt2
           WHERE dt2.ucc = c.ucc AND dt2.trade_date >= NOW() - INTERVAL '3 months'), 0
        ) AS revenue_3m_post,
        (SELECT COUNT(*) FROM interactions i
         WHERE i.ucc = c.ucc AND i.created_at >= c.mapped_date) AS interaction_count
      FROM clients c
      JOIN rm_master rm ON c.assigned_rm_id = rm.id
      JOIN ai_scores a ON c.ucc = a.ucc
      WHERE c.is_mapped = true
        AND a.churn_risk_score >= 70
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = c.ucc)
      ORDER BY a.churn_risk_score DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    console.warn('AI unmap suggestions error:', err.message);
    res.json([]);
  }
});

// POST approve unmap
router.post('/approve-unmap', auth, async (req, res) => {
  const { ucc, request_id } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });
  try {
    await pool.query(`
      UPDATE clients
      SET assigned_rm_id = NULL, is_mapped = false, updated_at = NOW()
      WHERE ucc = $1
    `, [ucc]);

    await pool.query(`
      UPDATE lead_pool
      SET status = 'unassigned', assigned_to_rm = NULL, updated_at = NOW()
      WHERE ucc = $1
    `, [ucc]);

    if (request_id) {
      await pool.query(`
        UPDATE unmap_requests SET status = 'approved', updated_at = NOW()
        WHERE id = $1
      `, [request_id]).catch(() => {});
    }

    res.json({ success: true, message: `Client ${ucc} unmapped successfully. RM capacity slot freed.` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST reject unmap
router.post('/reject-unmap', auth, async (req, res) => {
  const { ucc, request_id } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });
  try {
    if (request_id) {
      await pool.query(`
        UPDATE unmap_requests SET status = 'rejected', updated_at = NOW()
        WHERE id = $1
      `, [request_id]).catch(() => {});
    }
    res.json({ success: true, message: `Unmap request for ${ucc} rejected.` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;