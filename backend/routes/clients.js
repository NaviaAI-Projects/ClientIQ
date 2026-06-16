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

    const rmId = rmResult.rows[0]?.id || 0;

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