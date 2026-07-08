const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/:ucc', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, u.name as rm_name 
      FROM interactions i
      JOIN users u ON i.rm_id = u.id
      WHERE i.ucc = $1 
      ORDER BY i.interaction_date DESC
    `, [req.params.ucc]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  const { ucc, interaction_type, duration_seconds, notes, outcome } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO interactions (ucc, rm_id, interaction_type, duration_seconds, notes, outcome)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [ucc, req.user.id, interaction_type, duration_seconds, notes, outcome]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;