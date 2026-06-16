const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/my', auth, async (req, res) => {
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
      SELECT
        lp.id,
        lp.ucc,
        c.name AS client_name,
        c.client_type,
        c.plan,
        lp.lead_score,
        lp.churn_risk_score,
        lp.assigned_at,
        lp.assignment_expires_at,
        lp.status
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      WHERE lp.assigned_to_rm = $1
        AND lp.status = 'assigned'
      ORDER BY lp.lead_score DESC
    `, [rmId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { status = 'unassigned' } = req.query;
    const result = await pool.query(`
      SELECT lp.*, c.name, c.ucc, c.client_type, c.plan,
        a.lead_score, a.churn_risk_score, a.ai_notes,
        u.name as rm_name
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN ai_scores a ON lp.ucc = a.ucc 
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = lp.ucc)
      LEFT JOIN users u ON lp.assigned_to_rm = u.id
      WHERE lp.status = $1
      ORDER BY lp.lead_score DESC
    `, [status]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/assign', auth, async (req, res) => {
  const { ucc, rm_id } = req.body;
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const result = await pool.query(`
      UPDATE lead_pool 
      SET assigned_to_rm=$1, assigned_at=NOW(), assignment_expires_at=$2, status='assigned', updated_at=NOW()
      WHERE ucc=$3 RETURNING *
    `, [rm_id, expiry, ucc]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE lead_pool SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;