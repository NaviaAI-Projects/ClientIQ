const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

// GET all settings
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET AI scoring weights
router.get('/ai-weights', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM settings
       WHERE key IN (
         'options_to_weight','float_weight','equity_weight',
         'mtf_weight','nri_weight','dormancy_weight',
         'lead_score_threshold'
       )`
    );
    const weights = {};
    result.rows.forEach(r => { weights[r.key] = parseFloat(r.value); });
    res.json({ success: true, data: weights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET API integrations
router.get('/integrations', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM settings
       WHERE key IN (
         'click_to_call_url','click_to_call_key',
         'whatsapp_url','whatsapp_key',
         'email_url','email_key',
         'email_from','exchange_feed_url'
       )`
    );
    const integrations = {};
    result.rows.forEach(r => { integrations[r.key] = r.value; });
    res.json({ success: true, data: integrations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET pipeline settings
router.get('/pipeline', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pipeline_settings ORDER BY id DESC LIMIT 1'
    );
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE single setting
router.put('/:key', auth, adminOnly, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!value && value !== 0)
    return res.status(400).json({ success: false, error: 'Value is required' });
  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (key)
       DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, String(value)]
    );
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE multiple settings at once
router.put('/', auth, adminOnly, async (req, res) => {
  const settings = req.body;
  if (!settings || Object.keys(settings).length === 0)
    return res.status(400).json({ success: false, error: 'No settings provided' });
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (key)
         DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, String(value)]
      );
    }
    await client.query('COMMIT');
    client.release();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE pipeline settings
router.put('/pipeline', auth, adminOnly, async (req, res) => {
  const { rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM pipeline_settings ORDER BY id DESC LIMIT 1');
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE pipeline_settings SET rm_capacity_limit=$1, lead_expiry_window=$2,
         lead_score_threshold=$3, fd_rate=$4, updated_at=NOW() WHERE id=$5`,
        [rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO pipeline_settings (rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate, updated_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate]
      );
    }
    res.json({ success: true, message: 'Pipeline settings updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;