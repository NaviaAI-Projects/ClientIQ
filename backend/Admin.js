const express    = require('express');
const axios      = require('axios');
const SHAREPRO_URL = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const SHAREPRO_KEY = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';
const router     = express.Router();
const pool       = require('../db');
const auth       = require('../middleware/auth');
const nodemailer = require('nodemailer');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

function createTransporter(type) {
  const configs = {
    alerts: {
      host: 'smtp.zatpatmail.com', port: 587, secure: false,
      auth: { user: 'emailapikey', pass: 'PHtE6r0MS+rrg28uoUUC4fLrEpL3Mtws/+tgelQUs9lBC6BRTk1W+dB6wWXkokgpXfIWEqTPz949s7if4uqHd2+8MzpNCGqyqK3sx/VYSPOZsbq6x00fuVsZfkXdUY7mddVo3CHRuNvfNA==' },
      from: 'alert@navia.co.in'
    },
    updates: {
      host: 'smtp.zatpatmail.com', port: 587, secure: false,
      auth: { user: 'emailapikey', pass: 'PHtE6r1YS+Hq2Wcs9RMF7fKxEc/wPIksq+IzKAZHuYpLDvRXFk0Br9F/wzO/rxcoBvEQE/+fnoNgtLuf4L3Xc27vMG5FX2qyqK3sx/VYSPOZsbq6x00fuVkZcUzUUY7od9Nj3CHVstbaNA==' },
      from: 'updates@navia.co.in'
    }
  };
  const c = configs[type || 'alerts'];
  return { transporter: nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.auth }), from: c.from };
}

function fillTemplate(text, vars) {
  if (!text) return '';
  return Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp('\\{' + k + '\\}', 'g'), v || ''), text);
}

function bodyToHtml(body) {
  const lines = body.replace(/\\n/g, '\n').split('\n');
  return lines.map(function(line) {
    if (!line.trim()) return '<br/>';
    return '<p style="margin:8px 0;font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">' + line + '</p>';
  }).join('');
}

function wrapHtml(content) {
  return '<div style="max-width:600px;margin:0 auto;padding:20px;">' +
    '<div style="background:#223872;padding:16px 24px;border-radius:8px 8px 0 0;">' +
    '<span style="color:white;font-size:18px;font-weight:bold;">Navia Markets</span>' +
    '</div>' +
    '<div style="background:white;padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">' +
    content +
    '</div>' +
    '<div style="text-align:center;padding:12px;font-size:11px;color:#aaa;">Navia Markets &middot; SEBI Registered &middot; NSE/BSE/MCX Member</div>' +
    '</div>';
}

// GET all settings
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET AI scoring weights
router.get('/ai-weights', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('options_to_weight','float_weight','equity_weight','mtf_weight','nri_weight','dormancy_weight','lead_score_threshold')"
    );
    const weights = {};
    result.rows.forEach(r => { weights[r.key] = parseFloat(r.value); });
    res.json({ success: true, data: weights });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET pipeline settings
router.get('/pipeline', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pipeline_settings ORDER BY id DESC LIMIT 1');
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET email templates
router.get('/email-templates', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY id');
    res.json({ success: true, templates: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT single email template
router.put('/email-templates/:key', auth, adminOnly, async (req, res) => {
  const { key } = req.params;
  const { subject, sender_name, body } = req.body;
  try {
    await pool.query(
      'INSERT INTO email_templates (template_key, subject, sender_name, body, updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (template_key) DO UPDATE SET subject=$2, sender_name=$3, body=$4, updated_at=NOW()',
      [key, subject, sender_name, body]
    );
    res.json({ success: true, message: 'Template saved' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST send test email
router.post('/email-templates/test', auth, adminOnly, async (req, res) => {
  const { test_email, subject, sender_name, body } = req.body;
  try {
    // Get first active RM name
    const rmRes  = await pool.query("SELECT name, phone FROM users WHERE role = 'rm' AND is_active = true ORDER BY id LIMIT 1");
    const rmUser = rmRes.rows[0];

    // Find client name from DB by email
    let clientName = null;
    try {
      const emailRes = await pool.query(
        'SELECT name FROM clients WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [test_email]
      );
      if (emailRes.rows.length > 0) {
        clientName = emailRes.rows[0].name.trim();
        console.log('Found client by email in DB:', clientName);
      } else {
        return res.status(400).json({
          success: false,
          message: 'No client found with email ' + test_email + '. Please sync client emails first.'
        });
      }
    } catch (e) {
      console.error('Email lookup error:', e.message);
      return res.status(500).json({ success: false, message: e.message });
    }

    const vars = {
      client_name:       clientName,
      rm_name:           rmUser?.name?.trim() || 'Relationship Manager',
      rm_phone:          rmUser?.phone?.trim() || '9240202965',
      optin_link:        'https://navia.co.in/optin/test123',
      token_expiry_days: '7',
      date:              new Date().toLocaleDateString('en-IN'),
      churn_score:       '75',
      expiry_date:       new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-IN'),
      digest_content:    'Priority client: ' + clientName + ' — review and call today.'
    };

    const filledSubject = fillTemplate(subject, vars);
    const filledBody    = fillTemplate(body, vars);
    const { transporter, from } = createTransporter('alerts');

    await transporter.sendMail({
      from:    '"' + (sender_name || 'Navia Markets') + '" <' + from + '>',
      to:      test_email,
      subject: '[TEST] ' + filledSubject,
      html:    wrapHtml(bodyToHtml(filledBody))
    });

    res.json({ success: true, message: 'Test email sent to ' + test_email });
  } catch (err) {
    console.error('Test email error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT multiple settings
router.put('/', auth, adminOnly, async (req, res) => {
  const settings = req.body;
  if (!settings || Object.keys(settings).length === 0)
    return res.status(400).json({ success: false, error: 'No settings provided' });
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
        [key, String(value)]
      );
    }
    await client.query('COMMIT');
    client.release();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT pipeline settings
router.put('/pipeline', auth, adminOnly, async (req, res) => {
  const {
    rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate,
    optin_base_url, token_expiry_days, remind_after_days,
    max_reassign_count, reassign_on_expiry
  } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM pipeline_settings ORDER BY id DESC LIMIT 1');
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE pipeline_settings SET
          rm_capacity_limit=$1, lead_expiry_window=$2, lead_score_threshold=$3, fd_rate=$4,
          optin_base_url=$5, token_expiry_days=$6, remind_after_days=$7,
          max_reassign_count=$8, reassign_on_expiry=$9, updated_at=NOW()
         WHERE id=$10`,
        [rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate,
         optin_base_url, token_expiry_days, remind_after_days,
         max_reassign_count, reassign_on_expiry, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO pipeline_settings
          (rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate,
           optin_base_url, token_expiry_days, remind_after_days, max_reassign_count, reassign_on_expiry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate,
         optin_base_url, token_expiry_days, remind_after_days, max_reassign_count, reassign_on_expiry]
      );
    }
    res.json({ success: true, message: 'Pipeline settings updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT single setting
router.put('/:key', auth, adminOnly, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
      [key, String(value)]
    );
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;