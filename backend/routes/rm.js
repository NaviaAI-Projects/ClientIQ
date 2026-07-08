const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/list',auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        rm.id,
        rm.rm_name,
        rm.capacity,
        rm.status,
        COUNT(c.id) AS assigned_clients
      FROM rm_master rm
      LEFT JOIN clients c
        ON c.assigned_rm_id = rm.id
      GROUP BY rm.id, rm.rm_name, rm.capacity, rm.status
      ORDER BY rm.rm_name
    `);

    res.json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

router.get('/settings', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM pipeline_settings
      ORDER BY id DESC
      LIMIT 1
    `);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/settings', auth, async (req, res) => {
  const { rm_capacity_limit, lead_expiry_window } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO pipeline_settings
      (rm_capacity_limit, lead_expiry_window, updated_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `, [rm_capacity_limit, lead_expiry_window]);

    res.json({
      message: 'Settings saved successfully',
      settings: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// GET /api/rm/revenue — RM revenue tracker
router.get('/revenue', auth, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const rmRes   = await pool.query('SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1)', [userRes.rows[0]?.name]);
    const rmId    = rmRes.rows[0]?.id;
    if (!rmId) return res.json({ monthly: [], summary: null });

    // Monthly breakdown
    const monthlyRes = await pool.query(`
      SELECT 
        TO_CHAR(dt.trade_date, 'Mon''YY') as month,
        COALESCE(SUM(dt.eq_cash_turnover), 0) as eq_cash,
        COALESCE(SUM(dt.eq_fo_turnover), 0) as eq_fo,
        COALESCE(SUM(dt.options_premium_turnover), 0) as options,
        COALESCE(SUM(dt.commodity_fo_turnover), 0) as commodity,
        COALESCE(SUM(dt.brokerage_earned), 0) as brokerage
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      WHERE c.assigned_rm_id = $1
      GROUP BY TO_CHAR(dt.trade_date, 'Mon''YY'), DATE_TRUNC('month', dt.trade_date)
      ORDER BY DATE_TRUNC('month', dt.trade_date)
    `, [rmId]);

    // Summary totals
    const summaryRes = await pool.query(`
      SELECT 
        COALESCE(SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.options_premium_turnover + dt.commodity_fo_turnover), 0) as total_turnover,
        COALESCE(SUM(dt.options_premium_turnover), 0) as options_turnover,
        COALESCE(SUM(dt.eq_cash_turnover), 0) as eq_cash,
        COALESCE(SUM(dt.brokerage_earned), 0) as brokerage
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      WHERE c.assigned_rm_id = $1
    `, [rmId]);

    // Client-wise breakdown
    const clientRes = await pool.query(`
      SELECT c.name,
        COALESCE(SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.options_premium_turnover + dt.commodity_fo_turnover), 0) as total_turnover,
        COALESCE(SUM(dt.options_premium_turnover), 0) as options,
        COALESCE(SUM(dt.eq_cash_turnover), 0) as eq_cash,
        COALESCE(SUM(dt.brokerage_earned), 0) as brokerage
      FROM clients c
      LEFT JOIN daily_trades dt ON c.ucc = dt.ucc
      WHERE c.assigned_rm_id = $1
      GROUP BY c.name
      ORDER BY total_turnover DESC
    `, [rmId]);

    res.json({
      monthly:  monthlyRes.rows,
      summary:  { ...summaryRes.rows[0], clients: clientRes.rows }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;