const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const audit   = require('../utils/audit');
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const axios   = require('axios');

// ── Groq helper (same config as routes/ai.js) ─────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.1-8b-instant';
async function callGroq(systemPrompt, userPrompt, maxTokens = 700) {
  const response = await axios.post(GROQ_URL, {
    model: GROQ_MODEL, max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ]
  }, {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return response.data.choices[0].message.content;
}

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

// ── Shared: assign one lead to an RM (updates lead_pool + sends opt-in email) ──
// Mirrors the single-client /assign flow so bulk auto-assign behaves identically.
// rm_id is an rm_master.id (same id space the /rm/list dropdown and per-row Assign use).
async function assignLeadToRm(rm_id, ucc) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);

  const rmRes      = await pool.query('SELECT id, name FROM users WHERE id=$1', [rm_id]);
  const clientRes  = await pool.query('SELECT name, email FROM clients WHERE ucc=$1', [ucc]);
  const rmName     = rmRes.rows[0]?.name?.trim() || 'RM';
  const clientName = clientRes.rows[0]?.name?.trim() || ucc;
  let clientEmail  = clientRes.rows[0]?.email || null;

  // Fetch email from Sharepro if not in DB (POST form, then GET fallback)
  if (!clientEmail) {
    try {
      const spRes = await axios.post(
        'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails',
        { key: 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=', ucc },
        { headers: { 'Content-Type': 'application/json' } }
      );
      clientEmail = spRes.data?.[0]?.EmailAddress?.trim() || null;
      if (clientEmail) await pool.query('UPDATE clients SET email=$1 WHERE ucc=$2', [clientEmail, ucc]);
    } catch (e) { console.warn('Sharepro fetch failed:', e.message); }
  }
  if (!clientEmail) {
    try {
      const spRes = await axios.get(
        'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails',
        { params: { ApiKey: 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=', UCC: ucc } }
      );
      const spData = spRes.data;
      clientEmail = spData?.EmailId || spData?.Email || spData?.email || null;
      if (clientEmail) await pool.query('UPDATE clients SET email=$1 WHERE ucc=$2', [clientEmail, ucc]);
    } catch (spErr) { console.warn('Sharepro fetch failed:', spErr.message); }
  }

  const optinToken = jwt.sign({ ucc, rm_id: parseInt(rm_id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const baseUrl    = process.env.OPTIN_BASE_URL || 'http://localhost:3000';
  const optinLink  = baseUrl + '/optin/' + optinToken;

  await pool.query(`
    UPDATE lead_pool
    SET assigned_to_rm=$1, assigned_at=NOW(), assignment_expires_at=$2,
        status='assigned', updated_at=NOW()
    WHERE ucc=$3
  `, [rm_id, expiry, ucc]);

  let emailed = false;
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
      emailed = true;
      console.log('Opt-in email sent to', clientEmail);
    } catch (emailErr) { console.error('Opt-in email failed:', emailErr.message); }
  } else {
    console.warn('No email for client', ucc, '— opt-in link:', optinLink);
  }

  return { optin_link: optinLink, emailed };
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

// ── GET /to-call-today — leads needing action, with an AI reason to call ──
// "Needing action" = assigned lead that is expiring soon, high churn risk, or dormant.
router.get('/to-call-today', auth, async (req, res) => {
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
      SELECT lp.ucc, c.name AS client_name, c.client_type, c.plan,
             c.last_trade_date, lp.lead_score, lp.churn_risk_score,
             lp.assignment_expires_at, a.ai_notes,
             CASE WHEN lp.assignment_expires_at IS NULL THEN NULL
                  ELSE GREATEST(0, lp.assignment_expires_at::date - CURRENT_DATE) END AS days_to_expiry,
             CASE WHEN c.last_trade_date IS NULL THEN NULL
                  ELSE (CURRENT_DATE - c.last_trade_date::date) END AS days_since_trade,
             COALESCE(t.total_turnover, 0) AS total_turnover,
             COALESCE(t.brokerage, 0)      AS brokerage,
             (SELECT MAX(i.created_at) FROM interactions i
                WHERE i.ucc = lp.ucc AND i.rm_id = $1) AS last_contact,
             EXISTS (SELECT 1 FROM interactions i
                WHERE i.ucc = lp.ucc AND i.rm_id = $1
                  AND DATE(i.created_at) = CURRENT_DATE) AS contacted_today
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN ai_scores a ON a.ucc = lp.ucc
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = lp.ucc)
      LEFT JOIN (
        SELECT ucc,
               SUM(COALESCE(eq_cash_turnover,0) + COALESCE(eq_fo_turnover,0)
                 + COALESCE(options_premium_turnover,0) + COALESCE(commodity_fo_turnover,0)) AS total_turnover,
               SUM(COALESCE(brokerage_earned,0)) AS brokerage
        FROM daily_trades GROUP BY ucc
      ) t ON t.ucc = lp.ucc
      WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = $2
        AND lp.status = 'assigned'
        AND (
             (lp.assignment_expires_at IS NOT NULL AND lp.assignment_expires_at::date <= CURRENT_DATE + 7)
          OR lp.churn_risk_score >= 7
          OR c.last_trade_date IS NULL
          OR c.last_trade_date::date < CURRENT_DATE - 30
        )
      ORDER BY lp.lead_score DESC NULLS LAST
    `, [req.user.id, rmId]);

    const inr = n => {
      const v = Number(n) || 0;
      if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
      if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
      if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
      return `₹${Math.round(v)}`;
    };

    // Classify each lead. The "Why" is built DETERMINISTICALLY from real data (never AI —
    // so the numbers are always correct); only the "Talk about" points are AI-generated.
    const rows = result.rows.map(r => {
      const dte      = r.days_to_expiry;
      const dst      = r.days_since_trade;
      const expiring = dte != null && dte <= 7;
      const churn    = (r.churn_risk_score || 0) >= 7;

      // Shared factual tail for context.
      const ctx = [];
      ctx.push(`lead score ${r.lead_score ?? 'NA'}`);
      if (r.churn_risk_score != null) ctx.push(`churn risk ${r.churn_risk_score}/10`);
      if (Number(r.total_turnover) > 0) ctx.push(`lifetime turnover ${inr(r.total_turnover)}`);
      const ctxStr = ctx.length ? ` (${ctx.join(', ')})` : '';

      let reason, whyText, talkFallback, priority;
      if (expiring) {
        reason       = 'Lead expiring';
        whyText      = `Assignment expires in ${dte} day${dte === 1 ? '' : 's'} — contact before it auto-reassigns to another RM${ctxStr}.`;
        talkFallback = 'Confirm you are their dedicated RM, understand their goals, and agree a concrete next step so the mapping is retained.';
        priority     = dte <= 3 ? 'Critical' : 'High';
      } else if (churn) {
        reason       = 'Churn risk';
        whyText      = `High churn risk at ${r.churn_risk_score}/10${ctxStr}. Proactive retention call needed.`;
        talkFallback = 'Ask about any service or pricing concerns, review brokerage and charges, and offer a retention benefit or a call with a dealer.';
        priority     = 'Critical';
      } else {
        reason  = 'Dormant';
        priority = 'High';
        if (r.last_trade_date == null) {
          whyText      = `No trades on record yet${ctxStr}. Account opened but not activated.`;
          talkFallback = 'Walk them through the platform, explain the segments available (equity delivery, F&O, MTF), and help them place a confident first trade.';
        } else {
          whyText      = `No trade for ${dst} days${ctxStr}. Re-engage before the client goes fully cold.`;
          talkFallback = 'Share current market ideas, discuss MTF on their delivery holdings, and compare delivery vs intraday to rebuild activity.';
        }
      }

      return {
        ucc:              r.ucc,
        client_name:      r.client_name,
        name:             r.client_name,
        client_type:      r.client_type,
        lead_score:       r.lead_score,
        churn_risk_score: r.churn_risk_score,
        reason,
        _whyText:         whyText,
        reason_detail:    `Why: ${whyText} Talk about: ${talkFallback}`,
        priority,
        last_contact:     r.last_contact,
        best_time:        null,
        contacted_today:  r.contacted_today,
      };
    });

    // AI generates ONLY the talking points (the "Talk about" part). The factual "Why" stays
    // deterministic. One batched Groq call; on any error the rule-based talk fallback remains.
    if (GROQ_API_KEY && rows.length > 0) {
      try {
        const list = result.rows.map((r, i) => {
          const bits = [`lead score ${r.lead_score ?? 'NA'}`, `churn risk ${r.churn_risk_score ?? 'NA'} out of 10`, `type ${r.client_type || 'NA'}`];
          if (r.plan) bits.push(`plan ${r.plan}`);
          bits.push(r.last_trade_date == null ? 'has never traded' : `last traded ${r.days_since_trade} days ago`);
          if (Number(r.total_turnover) > 0) bits.push(`lifetime turnover ${inr(r.total_turnover)}`);
          if (Number(r.brokerage) > 0)      bits.push(`brokerage ${inr(r.brokerage)}`);
          if (r.ai_notes)                   bits.push(`notes: ${String(r.ai_notes).slice(0, 100)}`);
          return `${i}. ${r.client_name} — trigger: ${rows[i].reason}; ${bits.join('; ')}`;
        }).join('\n');

        const systemPrompt = `You are an assistant for Navia Markets, an Indian stock broker.
For each client, write ONLY the "talk about" section for the Relationship Manager's call: 2-3 concrete, specific talking points for the conversation.
Tailor to the client's trigger and profile — e.g. MTF on delivery holdings, an options strategy, a re-activation offer, addressing service concerns, a first-trade walkthrough.
Use Indian broking context (NSE, BSE, MTF, options, delivery vs intraday). Do NOT restate scores or day counts, and do NOT invent any numbers — give actionable points only. 35-60 words each.
Return ONLY a JSON array like [{"i":0,"talk":"..."},{"i":1,"talk":"..."}], one object per client. No prose, no code fences.`;
        const userPrompt = `Clients:\n${list}`;

        const raw = await callGroq(systemPrompt, userPrompt, 1400);
        const match = raw && raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          parsed.forEach(item => {
            if (item && typeof item.i === 'number' && rows[item.i] && item.talk) {
              const talk = String(item.talk).replace(/\*/g, '').trim();
              rows[item.i].reason_detail = `Why: ${rows[item.i]._whyText} Talk about: ${talk}`;
            }
          });
        }
      } catch (groqErr) {
        console.error('to-call-today Groq talking points failed, using rule text:', groqErr.message);
      }
    }
    rows.forEach(r => { delete r._whyText; });

    rows.sort((a, b) => {
      const p = v => (v.priority === 'Critical' ? 0 : 1);
      return p(a) - p(b) || (b.lead_score || 0) - (a.lead_score || 0);
    });

    res.json(rows);
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
        a.ai_notes
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN ai_scores a ON lp.ucc = a.ucc
        AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = lp.ucc)
      WHERE lp.status IN ('unassigned', 'opted_in')
      ORDER BY lp.lead_score DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── GET /rm-list — all active RMs ─────────────────────────────
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
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /assign ───────────────────────────────────────────────
router.post('/assign', auth, async (req, res) => {
  const { ucc, rm_id } = req.body;
  if (!ucc || !rm_id) return res.status(400).json({ message: 'UCC and RM ID are required' });
  try {
    const { optin_link } = await assignLeadToRm(rm_id, ucc);
    res.json({ success: true, optin_link });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Shared: build a capacity-aware round-robin plan for score>=60 leads ──
// Returns { plan:[{ucc,name,lead_score,rm_id,rm_name}], per_rm:[...], counts:{...} }.
async function buildRoundRobinPlan() {
  const threshold = 60;

  // Eligible unassigned leads, best score first (this is the ranked order the pool shows).
  const leadsRes = await pool.query(`
    SELECT lp.ucc, COALESCE(lp.client_name, c.name, lp.ucc) AS name, lp.lead_score::float AS lead_score
    FROM lead_pool lp
    LEFT JOIN clients c ON c.ucc = lp.ucc
    WHERE lp.status = 'unassigned' AND lp.lead_score >= $1
    ORDER BY lp.lead_score DESC NULLS LAST, lp.ucc
  `, [threshold]);

  // RMs with capacity and current mapped load. remaining = capacity - already-assigned clients.
  const rmsRes = await pool.query(`
    SELECT rm.id, rm.rm_name, COALESCE(rm.capacity, 0)::int AS capacity,
           (SELECT COUNT(*) FROM clients c WHERE c.assigned_rm_id = rm.id)::int AS current_load
    FROM rm_master rm
    ORDER BY rm.id
  `);

  const rms = rmsRes.rows.map(r => ({
    rm_id: r.id, rm_name: r.rm_name,
    capacity: r.capacity, current: r.current_load,
    remaining: Math.max(0, r.capacity - r.current_load),
    adding: 0,
  }));

  const plan = [];
  const eligible = leadsRes.rows.length;
  let li = 0;

  // Round-robin: cycle through RMs, giving one lead per RM per pass, skipping full RMs.
  // Stops when leads run out or every RM has hit capacity.
  while (li < leadsRes.rows.length) {
    const withRoom = rms.filter(r => r.remaining - r.adding > 0);
    if (withRoom.length === 0) break;           // all RMs full → remaining leads overflow
    for (const r of withRoom) {
      if (li >= leadsRes.rows.length) break;
      const lead = leadsRes.rows[li++];
      r.adding += 1;
      plan.push({
        ucc: lead.ucc, name: lead.name,
        lead_score: lead.lead_score != null ? Math.round(lead.lead_score) : null,
        rm_id: r.rm_id, rm_name: r.rm_name,
      });
    }
  }

  const per_rm = rms.map(r => ({
    rm_id: r.rm_id, rm_name: r.rm_name,
    capacity: r.capacity, current: r.current,
    adding: r.adding, new_total: r.current + r.adding,
  }));

  return {
    plan, per_rm,
    counts: {
      eligible,
      assignable: plan.length,
      overflow: eligible - plan.length,   // eligible leads with no RM capacity left
      threshold,
    },
  };
}

// ── GET /auto-assign/preview — round-robin plan (no writes, no emails) ──
router.get('/auto-assign/preview', auth, async (req, res) => {
  try {
    const result = await buildRoundRobinPlan();
    res.json(result);
  } catch (err) {
    console.error('AUTO-ASSIGN PREVIEW ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /auto-assign/commit — assign the reviewed plan (writes + opt-in emails) ──
// Body: { assignments: [{ ucc, rm_id }] }. Re-validates each lead is still unassigned
// before acting, so a stale preview can't double-assign or reassign a client.
router.post('/auto-assign/commit', auth, async (req, res) => {
  const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
  if (!assignments || assignments.length === 0) {
    return res.status(400).json({ message: 'No assignments provided' });
  }
  const results = { assigned: 0, emailed: 0, skipped: 0, failed: 0, errors: [] };
  for (const a of assignments) {
    const ucc = a && a.ucc;
    const rm_id = a && a.rm_id;
    if (!ucc || !rm_id) { results.skipped++; continue; }
    try {
      // Guard: only act if the lead is still unassigned (avoids racing the per-row modal).
      const chk = await pool.query(
        `SELECT 1 FROM lead_pool WHERE ucc=$1 AND status='unassigned'`, [ucc]
      );
      if (chk.rowCount === 0) { results.skipped++; continue; }
      const { emailed } = await assignLeadToRm(rm_id, ucc);
      results.assigned++;
      if (emailed) results.emailed++;
    } catch (err) {
      results.failed++;
      results.errors.push({ ucc, error: err.message });
    }
  }
  res.json({ success: true, ...results });
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
      UPDATE clients SET assigned_rm_id=$1, is_mapped=true, mapped_at=COALESCE(mapped_at, NOW()), updated_at=NOW() WHERE ucc=$2
    `, [rm_id, ucc]);
    res.json({ success: true, message: 'Client mapped and lead assigned to RM' });
    await audit(req, 'MAPPING_APPROVED', 'Client ' + ucc + ' mapped to RM ' + rm_id, ucc, 'success', 'leads');
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /reject-mapping ───────────────────────────────────────
router.post('/reject-mapping', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });
  try {
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
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/pending-approvals', auth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT lp.id, lp.ucc, lp.lead_score, lp.churn_risk_score,
        lp.status, lp.assigned_at, lp.updated_at,
        c.name AS client_name, c.client_type, c.plan,
        u.name AS rm_name, lp.assigned_to_rm AS rm_id
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN users u ON lp.assigned_to_rm = u.id
      WHERE lp.status = 'opted_in'
      ORDER BY lp.lead_score DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/all', auth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await pool.query(`
      SELECT lp.id, lp.ucc, lp.lead_score, lp.churn_risk_score,
        lp.status, lp.assigned_at, lp.assignment_expires_at,
        lp.reassign_count, lp.updated_at,
        c.name AS client_name, c.client_type, c.plan,
        u.name AS rm_name, lp.assigned_to_rm AS rm_id,
        lp.optin_clicked, lp.optin_date
      FROM lead_pool lp
      JOIN clients c ON lp.ucc = c.ucc
      LEFT JOIN users u ON lp.assigned_to_rm = u.id
      ORDER BY lp.lead_score DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;