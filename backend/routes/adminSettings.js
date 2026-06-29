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

function formatAmount(amount) {
  const n = parseFloat(amount) || 0;
  if (n >= 100000) return '\u20b9' + (n / 100000).toFixed(2) + 'L';
  if (n >= 1000)   return '\u20b9' + (n / 1000).toFixed(2) + 'K';
  return '\u20b9' + n.toFixed(2);
}

function bodyToHtml(body) {
  const lines = (body || '').replace(/\\n/g, '\n').split('\n');
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

function buildInsightHtml(name, month, year, to, balance, hVal, hCount, isTest) {
  const toFmt   = formatAmount(to);
  const balFmt  = formatAmount(balance);
  const hFmt    = formatAmount(hVal);
  const balNum  = parseFloat(balance) || 0;
  const hNum    = parseFloat(hVal) || 0;
  const hCnt    = parseInt(hCount) || 0;

  const nudgeColor  = balNum > 200000 ? '#e8f3de' : '#fff8e6';
  const nudgeBorder = balNum > 200000 ? '#3b6d11' : '#d98a0e';
  const nudgeTitle  = balNum > 200000 ? '#3b6d11' : '#854f0b';
  const nudgeMsg    = balNum > 200000
    ? 'Your balance is healthy. Consider deploying via MTF for enhanced returns on your trading positions.'
    : 'Maintaining a healthy ledger balance ensures seamless trading. Your RM can guide you on optimising your capital deployment.';

  const holdingsHtml = hNum > 0
    ? '<tr><td style="background:white;padding:4px 28px 16px;"><div style="background:#eef2ff;border-radius:8px;padding:14px 16px;"><p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#223872;">&#128202; Portfolio Holdings</p><p style="margin:0;font-size:13px;color:#444;">' + hCnt + ' stock positions &middot; Current value: <strong>' + hFmt + '</strong></p></div></td></tr>'
    : '';

  const testHtml = isTest ? '<p style="margin:8px 0 0;font-size:11px;color:#aaa;">[TEST EMAIL]</p>' : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:20px 0;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">' +

    '<tr><td style="background:#223872;padding:20px 28px;border-radius:8px 8px 0 0;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td><span style="color:white;font-size:22px;font-weight:bold;">Navia Markets</span><br>' +
    '<span style="color:rgba(255,255,255,0.7);font-size:12px;">Client Portfolio Summary</span></td>' +
    '<td align="right"><span style="color:rgba(255,255,255,0.6);font-size:12px;">' + month + ' ' + year + '</span></td>' +
    '</tr></table></td></tr>' +

    '<tr><td style="background:white;padding:24px 28px 12px;">' +
    '<p style="margin:0 0 6px;font-size:16px;color:#111;font-weight:600;">Dear ' + name + ',</p>' +
    '<p style="margin:0;font-size:13px;color:#666;line-height:1.6;">Here is your personalised trading summary for <strong>' + month + ' ' + year + '</strong>, generated from your actual trading activity on the Navia platform.</p>' +
    '</td></tr>' +

    '<tr><td style="background:white;padding:16px 28px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="32%" style="text-align:center;padding:16px 8px;background:#f0f4ff;border-radius:8px;">' +
    '<div style="font-size:20px;font-weight:700;color:#223872;">' + toFmt + '</div>' +
    '<div style="font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Total Turnover</div></td>' +
    '<td width="2%"></td>' +
    '<td width="32%" style="text-align:center;padding:16px 8px;background:#f0f4ff;border-radius:8px;">' +
    '<div style="font-size:20px;font-weight:700;color:#223872;">' + hFmt + '</div>' +
    '<div style="font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Holdings Value</div></td>' +
    '<td width="2%"></td>' +
    '<td width="32%" style="text-align:center;padding:16px 8px;background:#f0f4ff;border-radius:8px;">' +
    '<div style="font-size:20px;font-weight:700;color:#223872;">' + balFmt + '</div>' +
    '<div style="font-size:10px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Ledger Balance</div></td>' +
    '</tr></table></td></tr>' +

    holdingsHtml +

    '<tr><td style="background:white;padding:4px 28px 16px;">' +
    '<div style="background:' + nudgeColor + ';border-radius:8px;padding:14px 16px;border-left:4px solid ' + nudgeBorder + ';">' +
    '<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:' + nudgeTitle + ';">&#128176; Ledger Insight</p>' +
    '<p style="margin:0;font-size:13px;color:#444;">' + nudgeMsg + '</p></div></td></tr>' +

    '<tr><td style="background:white;padding:4px 28px 24px;">' +
    '<div style="background:#f0f4ff;border-radius:8px;padding:14px 16px;border-left:4px solid #223872;">' +
    '<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#223872;">&#129302; AI Insight from Your Relationship Manager</p>' +
    '<p style="margin:0;font-size:13px;color:#444;line-height:1.6;">Based on your trading pattern, your RM recommends reviewing your position sizing strategy for better risk-adjusted returns. Reach out to your dedicated RM for a personalised strategy session.</p>' +
    '</div></td></tr>' +

    '<tr><td style="background:#f8f9fb;padding:16px 28px;border-top:1px solid #eee;border-radius:0 0 8px 8px;">' +
    '<p style="margin:0;font-size:12px;color:#888;line-height:1.6;">This report is auto-generated from your trading data. For queries, contact your Relationship Manager.</p>' +
    testHtml + '</td></tr>' +

    '<tr><td style="padding:12px 0;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#aaa;">Navia Markets &middot; SEBI Registered Stock Broker &middot; NSE/BSE/MCX Member</p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

async function getClientData(ucc) {
  const result = await pool.query(`
    SELECT c.ucc, c.name, c.client_type,
      COALESCE((SELECT SUM(COALESCE(eq_cash_turnover,0)+COALESCE(eq_fo_turnover,0)+COALESCE(options_premium_turnover,0)+COALESCE(commodity_fo_turnover,0)) FROM daily_trades WHERE ucc=c.ucc),0) as total_turnover,
      COALESCE((SELECT SUM(options_premium_turnover) FROM daily_trades WHERE ucc=c.ucc),0) as options_to,
      COALESCE((SELECT AVG(opening_balance) FROM daily_ledger WHERE ucc=c.ucc),0) as avg_balance,
      COALESCE((SELECT SUM(total_holding_value) FROM holdings_summary WHERE ucc=c.ucc),0) as holdings_value,
      COALESCE((SELECT COUNT(*) FROM holdings_summary WHERE ucc=c.ucc),0) as holdings_count
    FROM clients c WHERE c.ucc=$1
  `, [ucc]);
  return result.rows[0] || null;
}

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/ai-weights', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM settings WHERE key IN ('options_to_weight','float_weight','equity_weight','mtf_weight','nri_weight','dormancy_weight','lead_score_threshold')");
    const weights = {};
    result.rows.forEach(r => { weights[r.key] = parseFloat(r.value); });
    res.json({ success: true, data: weights });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/pipeline', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pipeline_settings ORDER BY id DESC LIMIT 1');
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/email-templates', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY id');
    res.json({ success: true, templates: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/email-templates/:key', auth, adminOnly, async (req, res) => {
  const { key } = req.params;
  const { subject, sender_name, body } = req.body;
  try {
    await pool.query('INSERT INTO email_templates (template_key,subject,sender_name,body,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (template_key) DO UPDATE SET subject=$2,sender_name=$3,body=$4,updated_at=NOW()', [key, subject, sender_name, body]);
    res.json({ success: true, message: 'Template saved' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/email-templates/test', auth, adminOnly, async (req, res) => {
  const { test_email, subject, sender_name, body } = req.body;
  try {
    const rmRes  = await pool.query("SELECT name, phone FROM users WHERE role='rm' AND is_active=true ORDER BY id LIMIT 1");
    const rmUser = rmRes.rows[0];
    const emailRes = await pool.query('SELECT name FROM clients WHERE LOWER(email)=LOWER($1) LIMIT 1', [test_email]);
    if (!emailRes.rows.length) return res.status(400).json({ success: false, message: 'No client found with email ' + test_email });
    const clientName = emailRes.rows[0].name.trim();
    const vars = {
      client_name: clientName, rm_name: rmUser?.name?.trim() || 'Relationship Manager',
      rm_phone: rmUser?.phone?.trim() || '9240202965', optin_link: 'https://navia.co.in/optin/test123',
      token_expiry_days: '7', date: new Date().toLocaleDateString('en-IN'),
      churn_score: '75', expiry_date: new Date(Date.now()+7*86400000).toLocaleDateString('en-IN'),
      digest_content: 'Priority client: ' + clientName + ' — review and call today.'
    };
    const { transporter, from } = createTransporter('alerts');
    await transporter.sendMail({ from: '"'+(sender_name||'Navia Markets')+'" <'+from+'>', to: test_email, subject: '[TEST] '+fillTemplate(subject,vars), html: wrapHtml(bodyToHtml(fillTemplate(body,vars))) });
    res.json({ success: true, message: 'Test email sent to ' + test_email });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/', auth, adminOnly, async (req, res) => {
  const settings = req.body;
  if (!settings || !Object.keys(settings).length) return res.status(400).json({ success: false, error: 'No settings provided' });
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query('INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=NOW()', [key, String(value)]);
    }
    await client.query('COMMIT');
    client.release();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/pipeline', auth, adminOnly, async (req, res) => {
  const { rm_capacity_limit, lead_expiry_window, lead_score_threshold, fd_rate, optin_base_url, token_expiry_days, remind_after_days, max_reassign_count, reassign_on_expiry } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM pipeline_settings ORDER BY id DESC LIMIT 1');
    if (existing.rows.length > 0) {
      await pool.query('UPDATE pipeline_settings SET rm_capacity_limit=$1,lead_expiry_window=$2,lead_score_threshold=$3,fd_rate=$4,optin_base_url=$5,token_expiry_days=$6,remind_after_days=$7,max_reassign_count=$8,reassign_on_expiry=$9,updated_at=NOW() WHERE id=$10',
        [rm_capacity_limit,lead_expiry_window,lead_score_threshold,fd_rate,optin_base_url,token_expiry_days,remind_after_days,max_reassign_count,reassign_on_expiry,existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO pipeline_settings (rm_capacity_limit,lead_expiry_window,lead_score_threshold,fd_rate,optin_base_url,token_expiry_days,remind_after_days,max_reassign_count,reassign_on_expiry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [rm_capacity_limit,lead_expiry_window,lead_score_threshold,fd_rate,optin_base_url,token_expiry_days,remind_after_days,max_reassign_count,reassign_on_expiry]);
    }
    res.json({ success: true, message: 'Pipeline settings updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:key', auth, adminOnly, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    await pool.query('INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=NOW()', [key, String(value)]);
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/insight-log', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM insight_email_log ORDER BY created_at DESC LIMIT 12');
    res.json({ success: true, logs: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/insight-preview', auth, adminOnly, async (req, res) => {
  try {
    const topClient = await pool.query("SELECT ucc FROM clients WHERE is_active=true ORDER BY (SELECT COALESCE(SUM(options_premium_turnover),0) FROM daily_trades WHERE ucc=clients.ucc) DESC LIMIT 1");
    if (!topClient.rows.length) return res.status(404).json({ message: 'No clients found' });
    const client = await getClientData(topClient.rows[0].ucc);
    if (!client) return res.status(404).json({ message: 'No client data found' });
    const avgBalance = parseFloat(client.avg_balance) || 0;
    const optionsTo  = parseFloat(client.options_to) || 0;
    res.json({
      client_name: client.name.trim(), ucc: client.ucc,
      options: optionsTo > 0 ? { turnover: formatAmount(optionsTo), lots: Math.round(optionsTo/50000)||1, segments: client.client_type==='NRI'?'NSE F&O':'NSE F&O, NSE Cash' } : null,
      holdings: parseFloat(client.holdings_value)>0 ? { value: formatAmount(parseFloat(client.holdings_value)), count: client.holdings_count } : null,
      float: { avg_balance: formatAmount(avgBalance), nudge: avgBalance>200000 ? 'Consider MTF to enhance your options positions.' : 'Keep maintaining your ledger balance.' },
      ai_narrative: 'Based on your trading pattern, your RM recommends reviewing your position sizing strategy for better risk-adjusted returns next month.'
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/insight-test', auth, adminOnly, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT name, email FROM users WHERE id=$1', [req.user.id]);
    const admin   = userRes.rows[0];
    if (!admin?.email) return res.status(400).json({ message: 'Admin email not found' });
    const topRes = await pool.query("SELECT ucc FROM clients WHERE is_active=true ORDER BY (SELECT COALESCE(SUM(COALESCE(eq_cash_turnover,0)+COALESCE(eq_fo_turnover,0)+COALESCE(options_premium_turnover,0)+COALESCE(commodity_fo_turnover,0)),0) FROM daily_trades WHERE ucc=clients.ucc) DESC LIMIT 1");
    if (!topRes.rows.length) return res.status(400).json({ message: 'No clients found' });
    const client  = await getClientData(topRes.rows[0].ucc);
    const month   = new Date().toLocaleString('en-IN', { month: 'long' });
    const year    = new Date().getFullYear();
    const { transporter, from } = createTransporter('updates');
    await transporter.sendMail({
      from:    '"Navia Markets" <' + from + '>',
      to:      admin.email,
      subject: '[TEST] Your Navia trading summary — ' + month + ' ' + year,
      html:    buildInsightHtml(client.name.trim(), month, year, client.total_turnover, client.avg_balance, client.holdings_value, client.holdings_count, true)
    });
    res.json({ success: true, message: 'Test insight email sent to ' + admin.email + ' with data for ' + client.name.trim() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/insight-send', auth, adminOnly, async (req, res) => {
  try {
    const month = new Date().toLocaleString('en-IN', { month: 'long' });
    const year  = new Date().getFullYear();
    const clientsRes = await pool.query("SELECT ucc, name, email FROM clients WHERE is_active=true AND email IS NOT NULL");
    const clients = clientsRes.rows;
    if (!clients.length) return res.status(400).json({ message: 'No clients with email found' });
    let sent = 0, failed = 0;
    const { transporter, from } = createTransporter('updates');
    for (const c of clients) {
      try {
        const data = await getClientData(c.ucc);
        await transporter.sendMail({
          from:    '"Navia Markets" <' + from + '>',
          to:      c.email,
          subject: 'Your Navia trading summary — ' + month + ' ' + year,
          html:    buildInsightHtml(c.name.trim(), month, year, data?.total_turnover||0, data?.avg_balance||0, data?.holdings_value||0, data?.holdings_count||0, false)
        });
        sent++;
      } catch (e) { failed++; console.error('Failed for', c.ucc, e.message); }
    }
    const existing = await pool.query("SELECT id FROM insight_email_log WHERE month=$1", [month+' '+year]);
    if (existing.rows.length===0) {
      await pool.query("INSERT INTO insight_email_log (month,sent_on,recipients,delivered,opened,status) VALUES ($1,NOW(),$2,$3,0,'sent')", [month+' '+year, clients.length, sent]);
    } else {
      await pool.query("UPDATE insight_email_log SET recipients=$1,delivered=$2,sent_on=NOW(),status='sent' WHERE month=$3", [clients.length, sent, month+' '+year]);
    }
    res.json({ success: true, message: 'Sent: '+sent+', Failed: '+failed+' out of '+clients.length+' clients' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;