const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT c.*,
  rm.rm_name as rm_name,
  (SELECT opening_balance FROM daily_ledger WHERE ucc = c.ucc ORDER BY ledger_date DESC LIMIT 1) as latest_balance,
  (SELECT total_holding_value FROM holdings_summary WHERE ucc = c.ucc ORDER BY holding_date DESC LIMIT 1) as latest_holdings
FROM clients c
LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.name ILIKE $1 OR c.ucc ILIKE $1
      ORDER BY c.name ASC
      LIMIT $2 OFFSET $3
    `, [`%${search}%`, limit, offset]);

    const count = await pool.query(`
      SELECT COUNT(*)
      FROM clients
      WHERE name ILIKE $1 OR ucc ILIKE $1
    `, [`%${search}%`]);

    res.json({
      clients: result.rows,
      total: parseInt(count.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

router.get('/my/clients', auth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT name FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );

    const userName = userResult.rows[0]?.name || '';

    const rmResult = await pool.query(
      'SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1',
      [userName]
    );

    const rmId = rmResult.rows[0]?.id || null;
    if (!rmId) {
      console.warn(`No rm_master record found for user: ${userName} (id: ${req.user.id})`);
      return res.json([]); // or appropriate empty response
    }

    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT lead_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as lead_score,
        (SELECT churn_risk_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as churn_risk_score
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id = $1
      ORDER BY c.name ASC
    `, [rmId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

router.get('/:ucc/chart-data', auth, async (req, res) => {
  try {
    const { ucc } = req.params;

    const [trades, ledger, mtf] = await Promise.all([
      pool.query(`
        SELECT
          TO_CHAR(trade_date, 'Mon''YY') AS month,
          DATE_TRUNC('month', trade_date) AS month_start,
          SUM(eq_cash_turnover) AS eq_cash,
          SUM(eq_fo_turnover) AS eq_fo,
          SUM(options_premium_turnover) AS eq_options,
          SUM(commodity_fo_turnover) AS comm_fut
        FROM daily_trades
        WHERE ucc = $1
          AND trade_date >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', trade_date), TO_CHAR(trade_date, 'Mon''YY')
        ORDER BY month_start ASC
      `, [ucc]),

      pool.query(`
        SELECT
          TO_CHAR(ledger_date, 'Mon''YY') AS month,
          DATE_TRUNC('month', ledger_date) AS month_start,
          AVG(opening_balance) AS avg_balance
        FROM daily_ledger
        WHERE ucc = $1
          AND ledger_date >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', ledger_date), TO_CHAR(ledger_date, 'Mon''YY')
        ORDER BY month_start ASC
      `, [ucc]),

      pool.query(`
        SELECT
          month_year AS month,
          interest_earned AS mtf_interest
        FROM mtf_monthly
        WHERE ucc = $1
          AND month_year >= TO_CHAR(NOW() - INTERVAL '6 months', 'YYYY-MM')
        ORDER BY month_year ASC
      `, [ucc])
    ]);

    // Merge all into unified month list
    const monthMap = {};
    trades.rows.forEach(r => {
      monthMap[r.month] = {
        month: r.month,
        eq_cash:    parseFloat(r.eq_cash)    || 0,
        eq_futures: parseFloat(r.eq_fo)      || 0,
        eq_options: parseFloat(r.eq_options) || 0,
        comm_fut:   parseFloat(r.comm_fut)   || 0,
        comm_opt:   0,
        avg_balance: 0,
        mtf_interest: 0,
        holding_value: 0
      };
    });

    ledger.rows.forEach(r => {
      if (monthMap[r.month]) {
        monthMap[r.month].avg_balance = parseFloat(r.avg_balance) || 0;
      } else {
        monthMap[r.month] = { month: r.month, eq_cash: 0, eq_futures: 0, eq_options: 0, comm_fut: 0, comm_opt: 0, avg_balance: parseFloat(r.avg_balance) || 0, mtf_interest: 0, holding_value: 0 };
      }
    });

    mtf.rows.forEach(r => {
      const monthLabel = new Date(r.month + '-01').toLocaleString('en-US', { month: 'short', year: '2-digit' });
      if (monthMap[monthLabel]) {
        monthMap[monthLabel].mtf_interest = parseFloat(r.mtf_interest) || 0;
      }
    });

    // Get latest holding value
    const holding = await pool.query(
      'SELECT total_holding_value FROM holdings_summary WHERE ucc = $1 ORDER BY holding_date DESC LIMIT 1',
      [ucc]
    );
    const holdingVal = parseFloat(holding.rows[0]?.total_holding_value) || 0;

    const chartData = Object.values(monthMap);
    if (chartData.length > 0) {
      chartData[chartData.length - 1].holding_value = holdingVal;
    }

    res.json(chartData);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/:ucc', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT lead_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as lead_score,
        (SELECT churn_risk_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as churn_risk_score,
        (SELECT opening_balance FROM daily_ledger WHERE ucc = c.ucc ORDER BY ledger_date DESC LIMIT 1) as latest_balance,
        (SELECT total_holding_value FROM holdings_summary WHERE ucc = c.ucc ORDER BY holding_date DESC LIMIT 1) as latest_holdings
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.ucc = $1
    `, [req.params.ucc]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

module.exports = router;