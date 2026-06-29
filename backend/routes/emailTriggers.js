const pool       = require('../db');
const nodemailer = require('nodemailer');

function createTransporter(type = 'alerts') {
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
  const c = configs[type] || configs.alerts;
  return {
    transporter: nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.auth }),
    from: c.from
  };
}

// Replace {variable} placeholders with actual values
function fillTemplate(text, vars) {
  if (!text) return '';
  let result = text;
  Object.entries(vars).forEach(([k, v]) => {
    result = result.replace(new RegExp('\\{' + k + '\\}', 'g'), v || '');
  });
  return result;
}

// Convert plain text body to formatted HTML email
function toHtml(body, senderName) {
  const lines = body.split('\n').map(line => {
    if (!line.trim()) return '<br/>';
    return '<p style="margin: 8px 0; line-height: 1.6;">' + line + '</p>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">' +
    '<div style="background: #223872; padding: 16px 24px; border-radius: 8px 8px 0 0;">' +
    '<span style="color: white; font-size: 18px; font-weight: bold;">Navia Markets</span>' +
    '</div>' +
    '<div style="background: white; padding: 28px 24px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">' +
    lines +
    '</div>' +
    '<div style="text-align: center; padding: 16px; font-size: 11px; color: #aaa;">' +
    'Navia Markets &middot; SEBI Registered &middot; NSE/BSE/MCX Member' +
    '</div></body></html>';
}

async function getTemplate(key) {
  const result = await pool.query('SELECT * FROM email_templates WHERE template_key = $1', [key]);
  return result.rows[0] || null;
}

async function sendEmail(to, subject, body, type, senderName) {
  const { transporter, from } = createTransporter(type || 'alerts');
  const displayName = senderName || 'Navia Markets';
  await transporter.sendMail({
    from:    '"' + displayName + '" <' + from + '>',
    to:      to,
    subject: subject,
    html:    toHtml(body, displayName)
  });
  console.log('Email sent: ' + subject + ' to ' + to);
}

// TRIGGER: Opt-in email to client
async function triggerOptinClient({ ucc, client_name, client_email, rm_name, rm_phone, rm_id }) {
  try {
    const tmpl = await getTemplate('optin_client');
    if (!tmpl || !client_email) return;
    const token      = Buffer.from(ucc + ':' + rm_id + ':' + Date.now()).toString('base64');
    const optin_link = 'https://navia.co.in/optin/' + token;
    const vars = { client_name, rm_name, rm_phone: rm_phone || '', optin_link, token_expiry_days: '7' };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(client_email, subject, body, 'updates', tmpl.sender_name);
    console.log('Opt-in email sent to ' + client_email);
  } catch (err) { console.error('triggerOptinClient error:', err.message); }
}

// TRIGGER: Confirmation to RM when client opts in
async function triggerOptinRM({ client_name, rm_email, rm_name }) {
  try {
    const tmpl = await getTemplate('optin_rm');
    if (!tmpl || !rm_email) return;
    const vars    = { client_name, rm_name };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(rm_email, subject, body, 'alerts', tmpl.sender_name);
  } catch (err) { console.error('triggerOptinRM error:', err.message); }
}

// TRIGGER: Supervisor approval request
async function triggerSupervisorApproval({ client_name, rm_name, supervisor_email }) {
  try {
    const tmpl = await getTemplate('supervisor_approval');
    if (!tmpl || !supervisor_email) return;
    const vars    = { client_name, rm_name };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(supervisor_email, subject, body, 'alerts', tmpl.sender_name);
  } catch (err) { console.error('triggerSupervisorApproval error:', err.message); }
}

// TRIGGER: Mapping confirmed to client
async function triggerMappingConfirmed({ client_name, client_email, rm_name }) {
  try {
    const tmpl = await getTemplate('mapping_confirmed');
    if (!tmpl || !client_email) return;
    const vars    = { client_name, rm_name };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(client_email, subject, body, 'updates', tmpl.sender_name);
  } catch (err) { console.error('triggerMappingConfirmed error:', err.message); }
}

// TRIGGER: Churn alert to RM
async function triggerChurnAlert({ client_name, rm_email, rm_name, churn_score }) {
  try {
    const tmpl = await getTemplate('churn_alert');
    if (!tmpl || !rm_email) return;
    const vars    = { client_name, rm_name, churn_score: String(churn_score) };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(rm_email, subject, body, 'alerts', tmpl.sender_name);
    console.log('Churn alert sent to ' + rm_email);
  } catch (err) { console.error('triggerChurnAlert error:', err.message); }
}

// TRIGGER: Lead expiry warning
async function triggerLeadExpiry({ client_name, rm_email, rm_name, expiry_date }) {
  try {
    const tmpl = await getTemplate('lead_expiry');
    if (!tmpl || !rm_email) return;
    const vars    = { client_name, rm_name, expiry_date };
    const subject = fillTemplate(tmpl.subject, vars);
    const body    = fillTemplate(tmpl.body, vars);
    await sendEmail(rm_email, subject, body, 'alerts', tmpl.sender_name);
  } catch (err) { console.error('triggerLeadExpiry error:', err.message); }
}

// TRIGGER: Daily digest email to all RMs
async function triggerDailyDigest() {
  try {
    const tmpl = await getTemplate('daily_digest');
    if (!tmpl) return;

    const rmsResult = await pool.query(
      "SELECT u.id, u.name, u.email FROM users u WHERE u.role IN ('rm','team_leader') AND u.is_active = true AND u.email IS NOT NULL"
    );

    for (const rm of rmsResult.rows) {
      try {
        const leadsResult = await pool.query(
          "SELECT lp.ucc, c.name, lp.lead_score FROM lead_pool lp JOIN clients c ON lp.ucc = c.ucc JOIN rm_master rmm ON rmm.id = lp.assigned_rm_id JOIN users u ON LOWER(u.name) = LOWER(rmm.rm_name) WHERE u.id = $1 AND lp.status = 'assigned' ORDER BY lp.lead_score DESC LIMIT 5",
          [rm.id]
        );

        const digestContent = leadsResult.rows.length > 0
          ? 'Top priority clients:\n' + leadsResult.rows.map((l, i) => (i+1) + '. ' + l.name + ' (Score: ' + l.lead_score + ')').join('\n')
          : 'No priority leads assigned today.';

        const vars = {
          rm_name:        rm.name,
          date:           new Date().toLocaleDateString('en-IN'),
          digest_content: digestContent
        };
        const subject = fillTemplate(tmpl.subject, vars);
        const body    = fillTemplate(tmpl.body, vars);
        await sendEmail(rm.email, subject, body, 'updates', tmpl.sender_name);
        console.log('Daily digest sent to ' + rm.email);
      } catch (e) { console.error('Digest failed for ' + rm.email + ':', e.message); }
    }
  } catch (err) { console.error('triggerDailyDigest error:', err.message); }
}

// Check and send churn alerts
async function checkAndSendChurnAlerts() {
  try {
    const result = await pool.query(
      "SELECT a.ucc, c.name as client_name, a.churn_risk_score, u.email as rm_email, u.name as rm_name FROM ai_scores a JOIN clients c ON a.ucc = c.ucc JOIN rm_master rmm ON rmm.id = c.assigned_rm_id JOIN users u ON LOWER(u.name) = LOWER(rmm.rm_name) WHERE a.churn_risk_score >= 7 AND a.score_date = CURRENT_DATE"
    );
    for (const row of result.rows) {
      await triggerChurnAlert({ client_name: row.client_name, rm_email: row.rm_email, rm_name: row.rm_name, churn_score: row.churn_risk_score });
    }
    console.log('Churn alerts sent for ' + result.rows.length + ' clients');
  } catch (err) { console.error('checkAndSendChurnAlerts error:', err.message); }
}

// Check and send lead expiry warnings
async function checkAndSendLeadExpiryWarnings() {
  try {
    const result = await pool.query(
      "SELECT lp.ucc, c.name as client_name, lp.assignment_expires_at, u.email as rm_email, u.name as rm_name FROM lead_pool lp JOIN clients c ON lp.ucc = c.ucc JOIN rm_master rmm ON rmm.id = lp.assigned_rm_id JOIN users u ON LOWER(u.name) = LOWER(rmm.rm_name) WHERE lp.status = 'assigned' AND lp.assignment_expires_at::date = (CURRENT_DATE + INTERVAL '7 days')::date"
    );
    for (const row of result.rows) {
      await triggerLeadExpiry({ client_name: row.client_name, rm_email: row.rm_email, rm_name: row.rm_name, expiry_date: new Date(row.assignment_expires_at).toLocaleDateString('en-IN') });
    }
  } catch (err) { console.error('checkAndSendLeadExpiryWarnings error:', err.message); }
}

module.exports = {
  triggerOptinClient, triggerOptinRM, triggerSupervisorApproval,
  triggerMappingConfirmed, triggerChurnAlert, triggerLeadExpiry,
  triggerDailyDigest, checkAndSendChurnAlerts, checkAndSendLeadExpiryWarnings
};