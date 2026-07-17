const express = require('express');
<<<<<<< HEAD
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const audit = require('../utils/audit');

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
=======
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const audit   = require('../utils/audit');
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ── Email transporter ──────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zatpatmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: 'emailapikey',
      pass: 'PHtE6r0MS+rrg28uoUUC4fLrEpL3Mtws/+tgelQUs9lBC6BRTk1W+dB6wWXkokgpXfIWEqTPz949s7if4uqHd2+8MzpNCGqyqK3sx/VYSPOZsbq6x00fuVsZfkXdUY7mddVo3CHRuNvfNA=='
    }
  });
}

// ── GET /my — leads assigned to logged-in RM ──────────────────
router.get('/my', auth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id]
    );
    const userName = userResult.rows[0]?.name || '';
    const rmResult = await pool.query(
      'SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1', [userName]
    );
    const rmId = rmResult.rows[0]?.id || null;
    if (!rmId) return res.json([]);

    const result = await pool.query(`
      SELECT lp.id, lp.ucc, c.name AS client_name, c.client_type, c.plan,
        lp.lead_score, lp.churn_risk_score, lp.assigned_at,
        lp.assignment_expires_at, lp.status
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      WHERE lp.assigned_to_rm = $1 AND lp.status = 'assigned'
      ORDER BY lp.lead_score DESC
    `, [rmId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── GET /unmap-requests ────────────────────────────────────────
router.get('/unmap-requests', auth, async (req, res) => {
  res.json([]);
});

// ── GET /mapping-pool — for supervisor ────────────────────────
router.get('/mapping-pool', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lp.id, lp.ucc, lp.lead_score, lp.churn_risk_score,
        lp.status, lp.created_at,
        c.name AS client_name, c.client_type, c.plan, c.status AS client_status,
>>>>>>> master
        a.ai_notes
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN ai_scores a ON lp.ucc = a.ucc
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = lp.ucc)
<<<<<<< HEAD
      WHERE lp.status = 'unassigned'
=======
      WHERE lp.status IN ('unassigned', 'opted_in')
>>>>>>> master
      ORDER BY lp.lead_score DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

<<<<<<< HEAD
// GET all RMs for assignment dropdown
=======
// ── GET /rm-list — all active RMs ─────────────────────────────
>>>>>>> master
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

<<<<<<< HEAD
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
    await audit(req, 'MAPPING_APPROVED', `Client ${ucc} mapped to RM ${rm_id}`, ucc, 'success', 'leads');
=======
// ── GET /optin/:token — validate opt-in token (PUBLIC) ────────
router.get('/optin', async (req, res) => {
  try {
    const token = req.query.token;
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: 'This link has expired or is invalid.' });
    }
    const { ucc, rm_id } = decoded;
    const clientRes = await pool.query('SELECT ucc, name FROM clients WHERE ucc = $1', [ucc]);
    const rmRes     = await pool.query('SELECT id, name, phone FROM users WHERE id = $1', [rm_id]);
    if (!clientRes.rows.length || !rmRes.rows.length) {
      return res.status(404).json({ message: 'Client or RM not found.' });
    }
    res.json({
      valid:       true,
      client_name: clientRes.rows[0].name.trim(),
      ucc,
      rm_name:     rmRes.rows[0].name.trim(),
      rm_phone:    rmRes.rows[0].phone || '',
      rm_id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /optin/:token/confirm — client confirms (PUBLIC) ──────
router.post('/optin/confirm', async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    const { action } = req.body;
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: 'This link has expired or is invalid.' });
    }
    const { ucc, rm_id } = decoded;

    if (action === 'decline') {
      await pool.query(
        `UPDATE lead_pool SET status='declined', updated_at=NOW() WHERE ucc=$1`,
        [ucc]
      );
      return res.json({ success: true, action: 'declined' });
    }

    // Confirm
    await pool.query(
      `UPDATE lead_pool SET status='opted_in', updated_at=NOW() WHERE ucc=$1`,
      [ucc]
    );

    // Notify supervisor
    const supRes     = await pool.query(`SELECT id, email, name FROM users WHERE role='supervisor' AND is_active=true LIMIT 1`);
    const clientRes  = await pool.query('SELECT name FROM clients WHERE ucc=$1', [ucc]);
    const rmRes      = await pool.query('SELECT name FROM users WHERE id=$1', [rm_id]);
    const clientName = clientRes.rows[0]?.name?.trim() || ucc;
    const rmName     = rmRes.rows[0]?.name?.trim() || 'RM';

    if (supRes.rows.length > 0) {
      const sup = supRes.rows[0];
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from:    '"Navia ClientIQ" <alert@navia.co.in>',
          to:      sup.email,
          subject: 'Client Opt-in Confirmed — ' + clientName,
          html:    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
                 + '<div style="background:#1B3F7A;padding:20px;border-radius:8px 8px 0 0;">'
                 + '<h2 style="color:white;margin:0;">Navia ClientIQ</h2></div>'
                 + '<div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">'
                 + '<p>Dear ' + sup.name + ',</p>'
                 + '<p>Client <strong>' + clientName + '</strong> (UCC: ' + ucc + ') has confirmed opt-in for RM <strong>' + rmName + '</strong>.</p>'
                 + '<p>Please log in to ClientIQ and approve the mapping.</p>'
                 + '<a href="https://clientiq.navia.in/mapping-approvals" style="display:inline-block;background:#1B3F7A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Review & Approve Mapping</a>'
                 + '</div></div>',
        });
      } catch (emailErr) {
        console.error('Supervisor email failed:', emailErr.message);
      }
    }

    res.json({ success: true, action: 'confirmed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET / — all leads with status filter ──────────────────────
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
      WHERE ($1 = 'unassigned' AND lp.status IN ('unassigned','pending') AND lp.assigned_to_rm IS NULL)
         OR ($1 != 'unassigned' AND lp.status = $1)
      ORDER BY lp.lead_score DESC
    `, [status]);
    res.json(result.rows);
>>>>>>> master
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

<<<<<<< HEAD
// POST reject mapping — remove from lead pool
=======
// ── POST /assign ───────────────────────────────────────────────
router.post('/assign', auth, async (req, res) => {
  const { ucc, rm_id } = req.body;
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    // Get RM user details to generate optin token
    const rmRes     = await pool.query('SELECT id, name FROM users WHERE id=$1', [rm_id]);
    const clientRes = await pool.query('SELECT name, email FROM clients WHERE ucc=$1', [ucc]);
    const rmName    = rmRes.rows[0]?.name?.trim() || 'RM';
    const clientName = clientRes.rows[0]?.name?.trim() || ucc;
    let clientEmail = clientRes.rows[0]?.email || null;

    // Fetch email from Sharepro if not in DB
    if (!clientEmail) {
      try {
        const axios = require('axios');
        const spRes = await axios.post(
          'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails',
          { key: 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=', ucc },
          { headers: { 'Content-Type': 'application/json' } }
        );
        clientEmail = spRes.data?.[0]?.EmailAddress?.trim() || null;
        if (clientEmail) {
          await pool.query('UPDATE clients SET email=$1 WHERE ucc=$2', [clientEmail, ucc]);
        }
      } catch (e) {
        console.warn('Sharepro fetch failed:', e.message);
      }
    }

    // Fetch email from Sharepro if not in DB
    if (!clientEmail) {
      try {
        const axios = require('axios');
        const spRes = await axios.get(
          'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails',
          { params: { ApiKey: 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=', UCC: ucc } }
        );
        const spData = spRes.data;
        clientEmail = spData?.EmailId || spData?.Email || spData?.email || null;
        if (clientEmail) {
          await pool.query('UPDATE clients SET email = $1 WHERE ucc = $2', [clientEmail, ucc]);
          console.log('Email fetched from Sharepro:', clientEmail);
        }
      } catch (spErr) {
        console.warn('Sharepro fetch failed:', spErr.message);
      }
    }

    // Generate opt-in token
    const optinToken = jwt.sign(
      { ucc, rm_id: parseInt(rm_id) },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const baseUrl = process.env.OPTIN_BASE_URL || 'http://localhost:3000';
    const optinLink = baseUrl + '/optin/' + optinToken;

    await pool.query(`
      UPDATE lead_pool
      SET assigned_to_rm=$1, assigned_at=NOW(), assignment_expires_at=$2,
          status='assigned', updated_at=NOW()
      WHERE ucc=$3
    `, [rm_id, expiry, ucc]);

    // Send opt-in email to client
    if (clientEmail) {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from:    '"Navia Markets" <alert@navia.co.in>',
          to:      clientEmail,
          subject: 'Your Dedicated Relationship Manager at Navia',
          html:    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
                 + '<div style="background:#1B3F7A;padding:20px;border-radius:8px 8px 0 0;">'
                 + '<h2 style="color:white;margin:0;">Navia Markets</h2></div>'
                 + '<div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">'
                 + '<p>Dear ' + clientName + ',</p>'
                 + '<p><strong>' + rmName + '</strong> from Navia Markets has been assigned as your dedicated Relationship Manager.</p>'
                 + '<p>Please click the button below to confirm this assignment:</p>'
                 + '<a href="' + optinLink + '" style="display:inline-block;background:#1B3F7A;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Confirm My RM</a>'
                 + '<p style="margin-top:16px;font-size:12px;color:#888;">This link is valid for 7 days. If you did not expect this email, please ignore it.</p>'
                 + '</div></div>',
        });
        console.log('Opt-in email sent to', clientEmail);
      } catch (emailErr) {
        console.error('Opt-in email failed:', emailErr.message);
      }
    } else {
      console.warn('No email for client', ucc, '— opt-in link:', optinLink);
    }

    res.json({ success: true, optin_link: optinLink });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /approve-mapping ──────────────────────────────────────
router.post('/approve-mapping', auth, async (req, res) => {
  const { ucc, rm_id } = req.body;
  if (!ucc || !rm_id) return res.status(400).json({ message: 'UCC and RM ID are required' });
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    await pool.query(`
      UPDATE lead_pool
      SET assigned_to_rm=$1, assigned_at=NOW(), assignment_expires_at=$2,
          status='assigned', updated_at=NOW()
      WHERE ucc=$3
    `, [rm_id, expiry, ucc]);
    await pool.query(`
      UPDATE clients SET assigned_rm_id=$1, is_mapped=true, updated_at=NOW() WHERE ucc=$2
    `, [rm_id, ucc]);
    res.json({ success: true, message: 'Client mapped and lead assigned to RM' });
    await audit(req, 'MAPPING_APPROVED', 'Client ' + ucc + ' mapped to RM ' + rm_id, ucc, 'success', 'leads');
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /reject-mapping ───────────────────────────────────────
>>>>>>> master
router.post('/reject-mapping', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });
  try {
<<<<<<< HEAD
    await pool.query(`
      UPDATE lead_pool SET status = 'rejected', updated_at = NOW()
      WHERE ucc = $1
    `, [ucc]);
    res.json({ success: true, message: 'Mapping request rejected' });
    await audit(req, 'MAPPING_REJECTED', `Client ${ucc} mapping rejected`, ucc, 'success', 'leads');
=======
    await pool.query(`UPDATE lead_pool SET status='rejected', updated_at=NOW() WHERE ucc=$1`, [ucc]);
    res.json({ success: true, message: 'Mapping request rejected' });
    await audit(req, 'MAPPING_REJECTED', 'Client ' + ucc + ' mapping rejected', ucc, 'success', 'leads');
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── PUT /:id/status ────────────────────────────────────────────
router.put('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE lead_pool SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
>>>>>>> master
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;