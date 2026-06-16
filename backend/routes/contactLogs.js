const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        cl.*,
        c.name AS client_name
      FROM contact_logs cl
      LEFT JOIN clients c
        ON cl.ucc = c.ucc
      ORDER BY cl.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server Error'
    });
  }
});

module.exports = router;