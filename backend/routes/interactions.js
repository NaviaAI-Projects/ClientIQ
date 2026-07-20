const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// ✅ /my/all MUST be before /:ucc
router.get('/my/all', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name AS client_name
      FROM interactions i
      LEFT JOIN clients c ON i.ucc = c.ucc
      WHERE i.rm_id = $1
      ORDER BY i.created_at DESC
      LIMIT 100
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ /scheduled-today MUST be before /:ucc — follow-ups due today for logged-in RM
router.get('/scheduled-today', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (i.ucc)
             i.ucc,
             COALESCE(i.client_name, c.name) AS client_name,
             COALESCE(i.client_name, c.name) AS name,
             c.client_type,
             u.name AS scheduled_by,
             i.created_at AS scheduled_date,
             i.follow_up_date,
             i.notes AS context,
             EXISTS (
               SELECT 1 FROM interactions x
               WHERE x.ucc = i.ucc AND x.rm_id = i.rm_id
                 AND DATE(x.created_at) = CURRENT_DATE
             ) AS contacted_today
      FROM interactions i
      LEFT JOIN clients c ON i.ucc = c.ucc
      LEFT JOIN users u   ON i.rm_id = u.id
      WHERE i.rm_id = $1
        AND i.follow_up_date IS NOT NULL
        AND i.follow_up_date::date = CURRENT_DATE
      ORDER BY i.ucc, i.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

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