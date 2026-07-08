const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const auth       = require('../middleware/auth');
const nodemailer = require('nodemailer');
const { getClientContact } = require('./sharepro');

// SMTP configs for Navia
const SMTP_CONFIGS = {
  alerts: {
    host:   'smtp.zatpatmail.com',
    port:   587,
    secure: false,
    auth: {
      user: 'emailapikey',
      pass: 'PHtE6r0MS+rrg28uoUUC4fLrEpL3Mtws/+tgelQUs9lBC6BRTk1W+dB6wWXkokgpXfIWEqTPz949s7if4uqHd2+8MzpNCGqyqK3sx/VYSPOZsbq6x00fuVsZfkXdUY7mddVo3CHRuNvfNA=='
    },
    from: 'alert@navia.co.in'
  },
  updates: {
    host:   'smtp.zatpatmail.com',
    port:   587,
    secure: false,
    auth: {
      user: 'emailapikey',
      pass: 'PHtE6r1YS+Hq2Wcs9RMF7fKxEc/wPIksq+IzKAZHuYpLDvRXFk0Br9F/wzO/rxcoBvEQE/+fnoNgtLuf4L3Xc27vMG5FX2qyqK3sx/VYSPOZsbq6x00fuVkZcUzUUY7od9Nj3CHVstbaNA=='
    },
    from: 'updates@navia.co.in'
  }
};

function createTransporter(type = 'alerts') {
  const config = SMTP_CONFIGS[type] || SMTP_CONFIGS.alerts;
  return nodemailer.createTransport({
    host:   config.host,
    port:   config.port,
    secure: config.secure,
    auth:   config.auth
  });
}


function buildEmail(body, rmName) {
  const lines = body.split('\n');
  const bodyHtml = lines.map(function(line) {
    if (!line.trim()) return '';
    return '<p style="margin:0 0 14px 0;font-size:14px;color:#333;line-height:1.7;font-family:Arial,sans-serif;">' + line + '</p>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:30px 0;">' +
    '<tr><td align="center">' +
    '<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">' +

    // Header
    '<tr><td style="background:#223872;padding:22px 30px;border-radius:8px 8px 0 0;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td><span style="color:white;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Navia Markets</span><br>' +
    '</td>' +
    '<td align="right"><span style="color:rgba(255,255,255,0.5);font-size:12px;">' + new Date().toLocaleDateString("en-IN", {day:"numeric",month:"long",year:"numeric"}) + '</span></td>' +
    '</tr></table></td></tr>' +

    // Blue accent bar
    '<tr><td style="background:#1a6ed8;height:3px;"></td></tr>' +

    // Body
    '<tr><td style="background:white;padding:32px 30px 24px;">' +
    bodyHtml +
    '</td></tr>' +

    // Divider
    '<tr><td style="background:white;padding:0 30px;"><hr style="border:none;border-top:1px solid #eee;margin:0;"></td></tr>' +



    // Footer
    '<tr><td style="background:#f8f9fb;padding:16px 30px;border-top:1px solid #eee;border-radius:0 0 8px 8px;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">Navia Markets &middot; SEBI Registered Stock Broker &middot; NSE | BSE | MCX Member</p>' +
    '<p style="margin:6px 0 0;font-size:11px;color:#bbb;">This is an automated message from your RM. Please do not reply to this email.</p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

// POST /api/email/send
// Send email to client — fetches email from Sharepro at runtime
router.post('/send', auth, async (req, res) => {
  const { ucc, subject, body, email_type } = req.body;
  if (!ucc)     return res.status(400).json({ message: 'UCC is required' });
  if (!subject) return res.status(400).json({ message: 'Subject is required' });
  if (!body)    return res.status(400).json({ message: 'Email body is required' });

  try {
    // 1. Fetch client email from Sharepro at runtime
    const contact = await getClientContact(ucc);
    if (!contact?.email) {
      return res.status(400).json({ message: `No email found for UCC ${ucc} in Sharepro` });
    }

    const clientEmail = contact.email.trim();
    const clientName  = contact.name ? 
      contact.name.trim().replace(/\s+/g, ' ') : 'Valued Client';
    const smtpType    = email_type || 'alerts';
    const config      = SMTP_CONFIGS[smtpType];

    console.log(`Email: from=${config.from} to=${clientEmail} name=${clientName} subject=${subject}`);

    // 2. Get RM details
    const rmRes = await pool.query("SELECT name, phone FROM users WHERE id = $1", [req.user.id]);
    const rmName  = rmRes.rows[0]?.name?.trim() || 'Relationship Manager';
    const rmPhone = rmRes.rows[0]?.phone?.trim() || '9240202965';

    // 3. Replace placeholders in subject and body
    const finalSubject = subject
      .replace(/Dear Client/gi, `Dear ${clientName}`)
      .replace(/\{client_name\}/gi, clientName)
      .replace(/\{rm_name\}/gi, rmName);
    const finalBody = body
      .replace(/Dear Client,/gi, `Dear ${clientName},`)
      .replace(/\[CLIENT_NAME\]/gi, clientName)
      .replace(/\[NAME\]/gi, clientName)
      .replace(/\{client_name\}/gi, clientName)
      .replace(/\{rm_name\}/gi, rmName)
      .replace(/\{rm_phone\}/gi, rmPhone);

    // 3. Send email via Zatpatmail SMTP
    const transporter = createTransporter(smtpType);
    await transporter.sendMail({
      from:    config.from,
      to:      clientEmail,
      subject: finalSubject,
      html:    buildEmail(finalBody, rmName)
    });

    // 3. Log interaction
    await pool.query(
      `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
       VALUES ($1, $2, 'email', $3, 'sent', NOW())`,
      [ucc, req.user.id, `Email sent from ${config.from}. Subject: ${subject}`]
    );

    res.json({ success: true, message: `Email sent to client successfully from ${config.from}` });

  } catch (err) {
    console.error('Email error:', err.message);
    res.status(500).json({ message: 'Email send failed', error: err.message });
  }
});

// POST /api/email/send-bulk
// Send email to multiple clients (e.g. opt-in campaign)
router.post('/send-bulk', auth, async (req, res) => {
  const { uccs, subject, body, email_type } = req.body;
  if (!uccs?.length) return res.status(400).json({ message: 'UCCs array is required' });

  const results = { sent: 0, failed: 0, errors: [] };
  const smtpType    = email_type || 'updates';
  const config      = SMTP_CONFIGS[smtpType];
  const transporter = createTransporter(smtpType);

  for (const ucc of uccs) {
    try {
      const contact = await getClientContact(ucc);
      if (!contact?.email) { results.failed++; continue; }

      await transporter.sendMail({
        from:    config.from,
        to:      contact.email.trim(),
        subject: subject,
        html:    body
      });

      await pool.query(
        `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
         VALUES ($1, $2, 'email', $3, 'sent', NOW())`,
        [ucc, req.user.id, `Bulk email sent. Subject: ${subject}`]
      );

      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ ucc, error: err.message });
    }
  }

  res.json({ success: true, message: `Bulk email complete`, results });
});

// GET /api/email/test
router.get('/test', auth, async (req, res) => {
  try {
    const transporter = createTransporter('alerts');
    await transporter.verify();
    res.json({ success: true, message: '✓ SMTP connection verified. Zatpatmail connected.' });
  } catch (err) {
    res.status(500).json({ success: false, message: `SMTP test failed: ${err.message}` });
  }
});

module.exports = router;