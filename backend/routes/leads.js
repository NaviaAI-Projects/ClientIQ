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

    router.get('/unmap-requests', auth, async (req, res) => {
  res.json([]);
});

    const rmId = rmResult.rows[0]?.id || null;
    if (!rmId) {
      console.warn(`No rm_master record found for user: ${userName} (id: ${req.user.id})`);
      return res.json([]); // or appropriate empty response
    }

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

// GET all unassigned leads for supervisor mapping approval view
router.get('/mapping-pool', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        lp.id,
        lp.ucc,
        lp.lead_score,
        lp.churn_risk_score,
        lp.status,
        lp.created_at,
        c.name AS client_name,
        c.client_type,
        c.plan,
        c.status AS client_status,
        a.ai_notes
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN ai_scores a ON lp.ucc = a.ucc
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = lp.ucc)
      WHERE lp.status = 'unassigned'
      ORDER BY lp.lead_score DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET all RMs for assignment dropdown
router.get('/rm-list', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, rm.id AS rm_id, rm.capacity,
        COUNT(c.id) AS assigned_clients
      FROM users u
      JOIN rm_master rm ON LOWER(rm.rm_name) = LOWER(u.name)
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      WHERE u.role IN ('rm', 'team_leader') AND u.is_active = true
      GROUP BY u.id, u.name, rm.id, rm.capacity
      ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST approve mapping — assign lead to RM
router.post('/approve-mapping', auth, async (req, res) => {
  const { ucc, rm_id } = req.body;
  if (!ucc || !rm_id) {
    return res.status(400).json({ message: 'UCC and RM ID are required' });
  }
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    // Assign in lead_pool
    await pool.query(`
      UPDATE lead_pool
      SET assigned_to_rm = $1,
          assigned_at = NOW(),
          assignment_expires_at = $2,
          status = 'assigned',
          updated_at = NOW()
      WHERE ucc = $3
    `, [rm_id, expiry, ucc]);

    // Map client to RM in clients table
    await pool.query(`
      UPDATE clients
      SET assigned_rm_id = $1,
          is_mapped = true,
          updated_at = NOW()
      WHERE ucc = $2
    `, [rm_id, ucc]);

    res.json({ success: true, message: 'Client mapped and lead assigned to RM' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST reject mapping — remove from lead pool
router.post('/reject-mapping', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });
  try {
    await pool.query(`
      UPDATE lead_pool SET status = 'rejected', updated_at = NOW()
      WHERE ucc = $1
    `, [ucc]);
    res.json({ success: true, message: 'Mapping request rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;