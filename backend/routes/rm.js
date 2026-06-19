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

module.exports = router;