const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// GET all contact logs for logged-in RM
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id, i.ucc, i.rm_id, i.interaction_type,
        i.notes, i.outcome, i.follow_up_date,
        i.client_name, i.created_at
      FROM interactions i
      WHERE i.rm_id = $1
      ORDER BY i.created_at DESC
      LIMIT 100
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST — log new interaction
router.post('/', auth, async (req, res) => {
  const { ucc, client_name, interaction_type, notes, outcome, follow_up_date } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO interactions 
        (ucc, rm_id, client_name, interaction_type, notes, outcome, follow_up_date, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [
      ucc || null,
      req.user.id,
      client_name || null,
      interaction_type || 'call',
      notes || null,
      outcome || null,
      follow_up_date || null
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;