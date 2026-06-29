const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// GET interactions — exclude automated system duplicates
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (ucc, interaction_type, DATE(created_at),
             COALESCE(SUBSTRING(notes FROM 'Subject: (.+)'), notes))
        id, ucc, interaction_type, notes, outcome, follow_up_date, created_at,
        COALESCE(client_name, (SELECT name FROM clients WHERE ucc = interactions.ucc LIMIT 1)) as client_name
      FROM interactions
      WHERE rm_id = $1
        AND notes NOT LIKE '%from alert@navia.co.in%'
        AND notes NOT LIKE '%sent to 9%'
      ORDER BY ucc, interaction_type, DATE(created_at),
               COALESCE(SUBSTRING(notes FROM 'Subject: (.+)'), notes),
               created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// POST new interaction
router.post('/', auth, async (req, res) => {
  const { ucc, interaction_type, outcome, notes, follow_up_date } = req.body;
  try {
    const clientRes  = await pool.query('SELECT name FROM clients WHERE ucc = $1 LIMIT 1', [ucc]);
    const clientName = clientRes.rows[0]?.name || null;

    const result = await pool.query(`
      INSERT INTO interactions (ucc, rm_id, interaction_type, outcome, notes, follow_up_date, client_name, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [ucc, req.user.id, interaction_type, outcome, notes, follow_up_date || null, clientName]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;