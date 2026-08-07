const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const axios   = require('axios');
const audit = require('../utils/audit');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.1-8b-instant';

async function callGroq(systemPrompt, userPrompt, maxTokens = 500) {
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

async function getWeights(pool) {
  const result = await pool.query(
    `SELECT key, value FROM settings WHERE key IN ('options_to_weight','float_weight','equity_weight','mtf_weight','nri_weight','dormancy_weight','lead_score_threshold')`
  );
  const w = {};
  result.rows.forEach(r => { w[r.key] = parseFloat(r.value); });
  return {
    options:   w.options_to_weight   || 35,
    float:     w.float_weight        || 20,
    equity:    w.equity_weight       || 20,
    mtf:       w.mtf_weight          || 10,
    nri:       w.nri_weight          || 8,
    dormancy:  w.dormancy_weight     || 7,
    threshold: w.lead_score_threshold || 60
  };
}

// POST /api/ai/rescore
// POST /api/ai/rescore
router.post('/rescore', auth, async (req, res) => {
  try {
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('options_to_weight','float_weight','equity_weight','mtf_weight','nri_weight','dormancy_weight','lead_score_threshold')`
    );
    const w = {};
    settingsResult.rows.forEach(r => { w[r.key] = parseFloat(r.value) || 0; });
    const threshold = w.lead_score_threshold || 20;

    const clientsResult = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, c.status, c.last_trade_date,
        COALESCE(dt.options_to, 0)   AS options_to,
        COALESCE(dt.eq_cash_to, 0)   AS eq_cash_to,
        COALESCE(dl.avg_float, 0)    AS avg_float,
        COALESCE(mm.mtf_interest, 0) AS mtf_interest
      FROM clients c
      LEFT JOIN (SELECT ucc, SUM(options_premium_turnover) AS options_to, SUM(eq_cash_turnover) AS eq_cash_to FROM daily_trades GROUP BY ucc) dt ON dt.ucc = c.ucc
      LEFT JOIN (SELECT ucc, AVG(opening_balance) AS avg_float FROM daily_ledger GROUP BY ucc) dl ON dl.ucc = c.ucc
      LEFT JOIN (SELECT ucc, SUM(interest_earned) AS mtf_interest FROM mtf_monthly GROUP BY ucc) mm ON mm.ucc = c.ucc
      WHERE c.status != 'Suspended'
    `);

    const clients = clientsResult.rows;
    const scoreRows = [];
    const leadRows  = [];

    // Calculate all scores in memory (no DB calls)
    for (const client of clients) {
      const optScore   = client.options_to > 0      ? (w.options_to_weight || 35) : 0;
      const floatScore = client.avg_float >= 50000   ? (w.float_weight || 20)     : client.avg_float >= 10000 ? (w.float_weight || 20) / 2 : 0;
      const eqScore    = client.eq_cash_to > 0       ? (w.equity_weight || 20)    : 0;
      const mtfScore   = client.mtf_interest > 0     ? (w.mtf_weight || 10)       : 0;
      const nriScore   = client.client_type === 'NRI' ? (w.nri_weight || 8)       : 0;
      const lastTrade  = client.last_trade_date ? new Date(client.last_trade_date) : null;
      const daysSince  = lastTrade ? Math.floor((Date.now() - lastTrade) / 86400000) : 999;
      const dormScore  = daysSince > 30 ? -(w.dormancy_weight || 7) : 0;
      const leadScore  = Math.min(Math.max(optScore + floatScore + eqScore + mtfScore + nriScore + dormScore, 0), 100);
      const churnRisk  = daysSince > 60 ? 8 : daysSince > 30 ? 5 : 3;
      const aiNotes    = leadScore >= 50 ? 'High opportunity client. Priority engagement recommended.' : leadScore >= 30 ? 'Medium opportunity. Monitor activity and engage.' : 'Low opportunity client currently. Monitor activity.';

      scoreRows.push([client.ucc, leadScore, churnRisk, aiNotes]);
      if (leadScore >= threshold) leadRows.push([client.ucc, leadScore, churnRisk]);
    }

    const BATCH = 500;

    // Bulk upsert ai_scores
    for (let i = 0; i < scoreRows.length; i += BATCH) {
      const batch  = scoreRows.slice(i, i + BATCH);
      const values = batch.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4},CURRENT_DATE)`).join(',');
      const params = batch.flat();
      await pool.query(`
        INSERT INTO ai_scores (ucc, lead_score, churn_risk_score, ai_notes, score_date)
        VALUES ${values}
        ON CONFLICT (ucc, score_date) DO UPDATE SET
          lead_score = EXCLUDED.lead_score,
          churn_risk_score = EXCLUDED.churn_risk_score,
          ai_notes = EXCLUDED.ai_notes
      `, params);
    }

    // Bulk upsert lead_pool
    for (let i = 0; i < leadRows.length; i += BATCH) {
      const batch  = leadRows.slice(i, i + BATCH);
      const values = batch.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3},'unassigned')`).join(',');
      const params = batch.flat();
      await pool.query(`
        INSERT INTO lead_pool (ucc, lead_score, churn_risk_score, status)
        VALUES ${values}
        ON CONFLICT (ucc) DO UPDATE SET
          lead_score = EXCLUDED.lead_score,
          churn_risk_score = EXCLUDED.churn_risk_score,
          status = CASE WHEN lead_pool.status IN ('assigned','converted') THEN lead_pool.status ELSE 'unassigned' END
      `, params);
    }

    await audit(req, 'AI_RESCORE', `Rescored ${clients.length} clients`, null, 'success', 'ai');
    res.json({ success: true, processed: clients.length, message: `${clients.length} clients rescored successfully` });
  } catch (err) {
    console.error('Rescore error:', err.message);
    res.status(500).json({ message: 'Rescore failed', error: err.message });
  }
});

// GET /api/ai/digest — Groq-written daily brief for the logged-in RM, based on their clients.
// Response shape matches frontend AiDigest.js:
//   { summary(HTML), expiring_leads, churn_alerts, cross_sell_count, working_days_left, alerts:[{type,title,message}] }
router.get('/digest', auth, async (req, res) => {
  try {
    // RM identity: users.name → rm_master.rm_name → rm_master.id
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    const userName = userRes.rows[0]?.name || '';
    const rmRes = await pool.query(
      'SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1', [userName]
    );
    const rmId = rmRes.rows[0]?.id || null;

    // NSE 2026 trading holidays — for working-days-to-EOM
    const HOLIDAYS = new Set([
      '2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14',
      '2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20',
      '2026-11-10','2026-11-24','2026-12-25'
    ]);
    const now = new Date();
    const yy = now.getFullYear(), mm = now.getMonth();
    const lastDay = new Date(yy, mm + 1, 0).getDate();
    let workingDaysLeft = 0;
    for (let d = now.getDate(); d <= lastDay; d++) {
      const dow = new Date(yy, mm, d).getDay();
      const iso = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(iso)) workingDaysLeft++;
    }

    const firstName = (userName.split(' ')[0]) || 'there';

    if (!rmId) {
      return res.json({
        summary: '<p>No clients assigned yet. Contact your supervisor to get leads mapped to you.</p>',
        expiring_leads: 0, churn_alerts: 0, cross_sell_count: 0,
        working_days_left: workingDaysLeft, alerts: []
      });
    }

    // Pull the RM's book with the four signals: lead score, churn, expiry, trading activity.
    const bookRes = await pool.query(`
      SELECT lp.ucc, c.name, c.client_type, c.plan, c.last_trade_date, c.account_open_date,
             lp.lead_score, lp.churn_risk_score, lp.assignment_expires_at,
             a.ai_notes,
             CASE WHEN lp.assignment_expires_at IS NULL THEN NULL
                  ELSE GREATEST(0, lp.assignment_expires_at::date - CURRENT_DATE) END AS days_to_expiry,
             CASE WHEN c.last_trade_date IS NULL THEN NULL
                  ELSE (CURRENT_DATE - c.last_trade_date::date) END AS days_since_trade,
             COALESCE(t.total_turnover, 0) AS total_turnover,
             COALESCE(t.brokerage, 0)      AS brokerage
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
      WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = $1
        AND lp.status = 'assigned'
      ORDER BY lp.lead_score DESC NULLS LAST
    `, [rmId]);

    const book = bookRes.rows;
    const assignedTotal = book.length;
    const expiringList = book.filter(r => r.days_to_expiry != null && r.days_to_expiry <= 7);
    const churnList    = book.filter(r => (r.churn_risk_score || 0) >= 7);
    const dormantList  = book.filter(r => r.last_trade_date == null || (r.days_since_trade != null && r.days_since_trade > 30));
    // Cross-sell signal: actively-trading, high-value clients worth a product pitch.
    const crossSellList = book.filter(r => (r.lead_score || 0) >= 50 && r.days_since_trade != null && r.days_since_trade <= 30);
    // Per-client analysis buckets for the brief.
    const highScoreList = book.filter(r => (r.lead_score || 0) >= 60);                      // who is high score
    const lowRiskList   = book.filter(r => (r.churn_risk_score || 0) > 0 && (r.churn_risk_score || 0) <= 3); // low churn / low risk = stable
    const toCallList    = book.filter(r =>                                                   // whom to call today
         (r.days_to_expiry != null && r.days_to_expiry <= 7)
      || (r.churn_risk_score || 0) >= 7
      || r.last_trade_date == null
      || (r.days_since_trade != null && r.days_since_trade > 30));

    const expiring  = expiringList.length;
    const churn     = churnList.length;
    const crossSell = crossSellList.length;

    // Deterministic fallback brief (used only if Groq is unavailable/errors).
    let summary;
    if (assignedTotal === 0) {
      summary = '<p>You have no active leads assigned right now. Check the mapping pool or contact your supervisor.</p>';
    } else {
      summary =
        `<p style="margin-bottom:10px"><strong>Good morning, ${firstName}!</strong> You have <strong>${assignedTotal}</strong> active lead${assignedTotal === 1 ? '' : 's'} assigned to you.</p>` +
        `<p style="margin-bottom:10px"><strong>High score:</strong> ${highScoreList.length} priority client${highScoreList.length === 1 ? '' : 's'}${highScoreList.length ? ` (${highScoreList.slice(0,3).map(r => `${r.name} — ${r.lead_score}`).join(', ')})` : ''}.</p>` +
        `<p style="margin-bottom:10px"><strong>Call today:</strong> ${toCallList.length} need${toCallList.length === 1 ? 's' : ''} a call${toCallList.length ? ` (${toCallList.slice(0,3).map(r => r.name).join(', ')})` : ''} — expiry, churn, or dormancy.</p>` +
        `<p style="margin-bottom:10px"><strong>Retention:</strong> ${churn} at high churn risk${churnList.length ? ` (${churnList.slice(0,3).map(r => r.name).join(', ')})` : ''}.</p>` +
        `<p style="margin-bottom:10px"><strong>Stable:</strong> ${lowRiskList.length} low-risk client${lowRiskList.length === 1 ? '' : 's'}${lowRiskList.length ? ` (${lowRiskList.slice(0,3).map(r => r.name).join(', ')})` : ''} — keep warm.</p>` +
        `<p><strong>This month:</strong> ${workingDaysLeft} working day${workingDaysLeft === 1 ? '' : 's'} left to end of month.</p>`;
    }

    // Groq-written brief based on the RM's client data.
    if (GROQ_API_KEY && assignedTotal > 0) {
      try {
        // Compact INR formatter (lakh / crore) for turnover & brokerage.
        const inr = n => {
          const v = Number(n) || 0;
          if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
          if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
          if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
          return `₹${Math.round(v)}`;
        };
        // Full per-client profile so the AI can write real detail, not one-liners.
        const profile = r => {
          const bits = [];
          bits.push(`lead score ${r.lead_score ?? 'NA'}`);
          bits.push(`churn risk ${r.churn_risk_score ?? 'NA'} out of 10`);
          bits.push(`type ${r.client_type || 'NA'}`);
          if (r.plan) bits.push(`plan ${r.plan}`);
          bits.push(r.last_trade_date == null ? 'has never traded'
                    : `last traded ${r.days_since_trade} days ago`);
          if (Number(r.total_turnover) > 0) bits.push(`lifetime turnover ${inr(r.total_turnover)}`);
          if (Number(r.brokerage) > 0)      bits.push(`brokerage ${inr(r.brokerage)}`);
          if (r.days_to_expiry != null)     bits.push(`assignment expires in ${r.days_to_expiry} days`);
          if (r.ai_notes)                   bits.push(`notes: ${String(r.ai_notes).slice(0, 120)}`);
          return `- ${r.name} (${r.ucc}): ${bits.join('; ')}`;
        };

        const dataContext = `
RM: ${firstName}
Total active leads assigned: ${assignedTotal}
Working days left this month: ${workingDaysLeft}

FULL CLIENT PROFILES:
${book.slice(0, 12).map(profile).join('\n')}

GROUPS (for your structure):
High-score (score 60+): ${highScoreList.map(r => r.name).join(', ') || 'none'}
Call today (expiry/churn/dormant): ${toCallList.map(r => r.name).join(', ') || 'none'}
Expiring within 7 days: ${expiringList.map(r => r.name).join(', ') || 'none'}
High churn-risk (7+): ${churnList.map(r => r.name).join(', ') || 'none'}
Stable / low-risk (churn ≤3): ${lowRiskList.map(r => r.name).join(', ') || 'none'}
Dormant (30+ days): ${dormantList.map(r => r.name).join(', ') || 'none'}
Cross-sell candidates: ${crossSellList.map(r => r.name).join(', ') || 'none'}`.trim();

        const systemPrompt = `You are the AI assistant for Navia Markets, an Indian stock broker.
Write a DETAILED, personalised morning brief for a Relationship Manager that analyses their clients using ONLY the profile data provided.
Structure it as HTML with these <p> section headers (bold the label only with <strong>…</strong>):
 <strong>Overview:</strong> 1-2 sentences on the book's shape.
 <strong>High-score priorities:</strong> for each high-score client, name them and give 2-3 sentences — their score, activity/turnover, and the specific action to take.
 <strong>Call today:</strong> for EACH client to call, name them and explain in 2-3 sentences why (expiry / churn / dormancy, with the day counts) and exactly what to discuss (concrete talking points using MTF, options, delivery vs intraday, brokerage, etc.).
 <strong>Stable clients:</strong> name the low-risk clients and how to keep them engaged.
 <strong>Opportunities:</strong> cross-sell / re-activation ideas tied to specific clients and their numbers.
Be specific and use the actual numbers for each client, EXACTLY as given (e.g. "churn risk 3 out of 10", "last traded 38 days ago"). Never convert a value into a percentage, never change a day count, and never invent any figure or client name not in the data. Write full sentences with real depth — do NOT compress a client into a single line.
Output ONLY HTML <p> tags. Never use Markdown asterisks (** or *). Aim for 220-320 words.`;
        const userPrompt = `Client data:\n${dataContext}`;

        const groqText = await callGroq(systemPrompt, userPrompt, 1100);
        if (groqText && groqText.trim()) {
          let html = groqText.trim().replace(/```html?/gi, '').replace(/```/g, '').trim();
          // Safety net: convert any Markdown bold/italic the model emitted into HTML
          // so the page never shows literal ** or * characters.
          html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                     .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
          if (!/<p[\s>]/i.test(html)) {
            html = html.split(/\n+/).filter(Boolean)
                       .map(line => `<p style="margin-bottom:10px">${line}</p>`).join('');
          }
          if (html) summary = html;
        }
      } catch (groqErr) {
        console.error('Digest Groq generation failed, using fallback:', groqErr.message);
      }
    }

    const alerts = [];
    if (expiring > 0)  alerts.push({ type: 'urgent', title: 'Leads expiring soon', message: `${expiring} assigned lead${expiring === 1 ? '' : 's'} expire within 7 days. Call today before auto-reassignment.` });
    if (churn > 0)     alerts.push({ type: 'warning', title: 'Churn risk', message: `${churn} client${churn === 1 ? '' : 's'} at high churn risk — schedule a retention call.` });
    if (crossSell > 0) alerts.push({ type: 'opportunity', title: 'Cross-sell opportunity', message: `${crossSell} active high-value client${crossSell === 1 ? '' : 's'} — good candidate${crossSell === 1 ? '' : 's'} for an MTF / product pitch.` });

    res.json({
      summary,
      expiring_leads: expiring,
      churn_alerts: churn,
      cross_sell_count: crossSell,
      working_days_left: workingDaysLeft,
      alerts
    });
  } catch (err) {
    console.error('AI digest (/digest) error:', err.message);
    res.status(500).json({ message: 'Failed to generate digest', error: err.message });
  }
});

// GET /api/ai/daily-digest
router.get('/daily-digest', auth, async (req, res) => {
  try {
    const [clientsRes, leadsRes, interactionsRes] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (c.ucc) c.ucc, c.name, c.client_type, c.last_trade_date,
               a.lead_score, a.churn_risk_score, a.ai_notes, dl.opening_balance
        FROM clients c
        JOIN rm_master rm ON rm.id = c.assigned_rm_id
        JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        LEFT JOIN ai_scores a ON c.ucc = a.ucc
        LEFT JOIN daily_ledger dl ON c.ucc = dl.ucc
        WHERE u.id = $1
        ORDER BY c.ucc, a.lead_score DESC NULLS LAST
        LIMIT 20
      `, [req.user.id]),
      pool.query(`
        SELECT lp.ucc, c.name, lp.lead_score
        FROM lead_pool lp
        JOIN clients c ON lp.ucc = c.ucc
        JOIN rm_master rm ON rm.id = lp.assigned_to_rm
        JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        WHERE u.id = $1 AND lp.status = 'assigned'
        ORDER BY lp.lead_score DESC LIMIT 10
      `, [req.user.id]),
      pool.query(`
        SELECT COUNT(*) as count FROM interactions
        WHERE rm_id = $1 AND created_at > NOW() - INTERVAL '7 days'
      `, [req.user.id])
    ]);

    const clients      = clientsRes.rows;
    const leads        = leadsRes.rows;
    const interactions = interactionsRes.rows[0]?.count || 0;

    if (clients.length === 0) {
      return res.json({ digest: 'No clients assigned yet. Contact your supervisor to get clients mapped to you.', insights: [], alerts: [], opportunities: [] });
    }

    const today        = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const highPriority = clients.filter(c => c.lead_score >= 50);
    const dormant      = clients.filter(c => {
      const days = c.last_trade_date ? Math.floor((Date.now() - new Date(c.last_trade_date)) / 86400000) : 999;
      return days > 30;
    });
    const highChurn    = clients.filter(c => c.churn_risk_score >= 6);

    const dataContext = `
RM has ${clients.length} mapped clients and ${leads.length} active leads.
High priority clients (score 50+): ${highPriority.map(c => `${c.name} (score: ${c.lead_score})`).join(', ') || 'None'}
Dormant clients (30+ days no trade): ${dormant.map(c => c.name).join(', ') || 'None'}
High churn risk clients: ${highChurn.map(c => c.name).join(', ') || 'None'}
Interactions in last 7 days: ${interactions}
Top leads: ${leads.slice(0, 3).map(l => `${l.name} (score: ${l.lead_score})`).join(', ') || 'None'}
Today: ${today}`.trim();

    const systemPrompt = `You are an AI assistant for Navia Markets, a stock broking firm in India.
You generate concise, actionable daily briefings for Relationship Managers (RMs).
Keep responses professional, specific, and under 200 words.
Focus on: who to call today, churn risks, and opportunities.
Use Indian financial context (BSE, NSE, options expiry, MTF).`;

    const userPrompt = `Generate a daily morning briefing for this RM based on their client data:
${dataContext}
Format as:
🌅 Good morning! [1 sentence summary]
📞 Priority calls today:
[2-3 specific clients with reason]
⚠️ Watch list:
[1-2 churn risks]
💡 Opportunity:
[1 cross-sell or engagement opportunity]`;

    const digestText = await callGroq(systemPrompt, userPrompt, 400);

    const recentRes = await pool.query(`
      SELECT DISTINCT ON (i.ucc, i.interaction_type, DATE(i.created_at))
             i.id, i.ucc, i.interaction_type, i.notes, i.outcome, i.created_at,
             COALESCE(i.client_name, c.name) as client_name
      FROM interactions i
      LEFT JOIN clients c ON i.ucc = c.ucc
      WHERE i.rm_id = $1
      ORDER BY i.ucc, i.interaction_type, DATE(i.created_at), i.created_at DESC
      LIMIT 8
    `, [req.user.id]);

    res.json({
      digest: digestText,
      stats: {
        total_clients:   clients.length,
        active_leads:    leads.length,
        high_priority:   highPriority.length,
        dormant:         dormant.length,
        interactions_7d: parseInt(interactions)
      },
      top_clients: clients.slice(0, 5).map(c => ({
        ucc: c.ucc, name: c.name, client_type: c.client_type, lead_score: c.lead_score, ai_notes: c.ai_notes
      })),
      recent_interactions: recentRes.rows
    });
  } catch (err) {
    console.error('AI digest error:', err.message);
    res.status(500).json({ message: 'Failed to generate digest', error: err.message });
  }
});

// GET /api/ai/insights
router.get('/insights', auth, async (req, res) => {
  try {
    const [clientsRes, leadsRes, rmRes] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as total,
               AVG(a.lead_score) as avg_score,
               COUNT(CASE WHEN a.lead_score >= 50 THEN 1 END) as high_priority,
               COUNT(CASE WHEN a.churn_risk_score >= 6 THEN 1 END) as churn_risk
        FROM clients c
        LEFT JOIN ai_scores a ON c.ucc = a.ucc
        WHERE c.status = 'Active'
      `),
      pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'unassigned' THEN 1 END) as unassigned FROM lead_pool`),
      pool.query(`SELECT COUNT(*) as total FROM users WHERE role IN ('rm','team_leader') AND is_active = true`)
    ]);

    const clientStats = clientsRes.rows[0];
    const leadStats   = leadsRes.rows[0];
    const rmCount     = rmRes.rows[0]?.total || 0;

    const dataContext = `
Total active clients: ${clientStats.total}
Average lead score: ${parseFloat(clientStats.avg_score || 0).toFixed(1)}
High priority clients (score 50+): ${clientStats.high_priority}
Clients at churn risk: ${clientStats.churn_risk}
Total leads in pipeline: ${leadStats.total}
Unassigned leads: ${leadStats.unassigned}
Active RMs: ${rmCount}`.trim();

    const systemPrompt = `You are an AI analytics assistant for Navia Markets, a stock broking firm.
Generate concise supervisor-level insights about the client book and RM performance.
Keep under 200 words. Be specific and actionable.`;

    const userPrompt = `Generate AI insights for the Supervisor based on this data:
${dataContext}
Format as:
📊 Book Overview:
[2-3 key observations]
🎯 Action Items:
[2-3 specific actions for supervisor]
📈 Growth Opportunities:
[1-2 opportunities]`;

    const insightText = await callGroq(systemPrompt, userPrompt, 400);

    const [highPriorityRes, churnRes, oppRes] = await Promise.all([
      pool.query(`SELECT c.ucc, c.name, a.lead_score, a.churn_risk_score, u.name as rm_name
        FROM clients c LEFT JOIN ai_scores a ON c.ucc = a.ucc
        LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
        LEFT JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        WHERE a.lead_score >= 50 ORDER BY a.lead_score DESC LIMIT 5`),
      pool.query(`SELECT c.ucc, c.name, a.lead_score, a.churn_risk_score, u.name as rm_name
        FROM clients c LEFT JOIN ai_scores a ON c.ucc = a.ucc
        LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
        LEFT JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        WHERE a.churn_risk_score >= 6 ORDER BY a.churn_risk_score DESC LIMIT 5`),
      // Real, company-wide cross-sell opportunity counts (no hardcoding)
      pool.query(`
        WITH dt AS (SELECT ucc, SUM(options_premium_turnover) AS opt, SUM(eq_cash_turnover) AS eqc FROM daily_trades GROUP BY ucc),
             h  AS (SELECT ucc, SUM(total_holding_value) AS hv FROM holdings_summary GROUP BY ucc),
             l  AS (SELECT ucc, AVG(opening_balance) AS bal FROM daily_ledger GROUP BY ucc)
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(h.hv,0) > 0 AND COALESCE(l.bal,0) < COALESCE(h.hv,0)*0.2)::int AS mtf_candidates,
          COUNT(*) FILTER (WHERE COALESCE(dt.eqc,0) > 0 AND COALESCE(dt.opt,0) = 0)::int             AS options_candidates,
          COUNT(*) FILTER (WHERE COALESCE(dt.eqc,0) > 0 AND COALESCE(dt.opt,0) = 0 AND COALESCE(h.hv,0) > 0)::int AS equity_holders
        FROM clients c
        LEFT JOIN dt ON dt.ucc = c.ucc
        LEFT JOIN h  ON h.ucc  = c.ucc
        LEFT JOIN l  ON l.ucc  = c.ucc
      `)
    ]);
    const opp = oppRes.rows[0] || {};

    res.json({
      narrative: insightText,
      insights:  insightText,
      stats: {
        total_clients:  parseInt(clientStats.total),
        avg_lead_score: parseFloat(clientStats.avg_score || 0).toFixed(1),
        high_priority:  parseInt(clientStats.high_priority),
        churn_risk:     parseInt(clientStats.churn_risk),
        total_leads:    parseInt(leadStats.total),
        unassigned:     parseInt(leadStats.unassigned),
        active_rms:     parseInt(rmCount)
      },
      high_priority_clients: highPriorityRes.rows,
      churn_risk_clients:    churnRes.rows,
      opportunities: [
        { title: 'MTF Activation', count: Number(opp.mtf_candidates || 0),
          description: `${Number(opp.mtf_candidates || 0).toLocaleString('en-IN')} clients hold stock (DP) but keep low cash balance — candidates to leverage MTF.` },
        { title: 'Options Introduction', count: Number(opp.options_candidates || 0),
          description: `${Number(opp.options_candidates || 0).toLocaleString('en-IN')} active equity-cash clients have no options exposure — F&O onboarding candidates.` },
        { title: 'Holdings Deployment', count: Number(opp.equity_holders || 0),
          description: `${Number(opp.equity_holders || 0).toLocaleString('en-IN')} equity-only clients hold DP stock but don't trade derivatives — capital to activate.` }
      ]
    });
  } catch (err) {
    console.error('AI insights error:', err.message);
    res.status(500).json({ message: 'Failed to generate insights', error: err.message });
  }
});

// GET /api/ai/cross-sell/:ucc
router.get('/cross-sell/:ucc', auth, async (req, res) => {
  try {
    const { ucc } = req.params;
    const clientRes = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, c.plan,
             COALESCE(AVG(dl.opening_balance), 0) AS avg_balance,
             COALESCE((SELECT SUM(options_premium_turnover) FROM daily_trades WHERE ucc = c.ucc), 0) AS options,
             COALESCE((SELECT SUM(eq_cash_turnover) FROM daily_trades WHERE ucc = c.ucc), 0) AS eq_cash,
             a.lead_score, a.churn_risk_score
      FROM clients c
      LEFT JOIN daily_ledger dl ON c.ucc = dl.ucc
      LEFT JOIN ai_scores a ON c.ucc = a.ucc
      WHERE c.ucc = $1
      GROUP BY c.ucc, c.name, c.client_type, c.plan, a.lead_score, a.churn_risk_score
    `, [ucc]);

    if (!clientRes.rows.length) return res.status(404).json({ message: 'Client not found' });
    const client = clientRes.rows[0];

    const dataContext = `
Client: ${client.name} (${client.client_type}, ${client.plan} plan)
Equity cash turnover: ₹${parseFloat(client.eq_cash).toLocaleString('en-IN')}
Options turnover: ₹${parseFloat(client.options).toLocaleString('en-IN')}
Average ledger balance: ₹${parseFloat(client.avg_balance).toLocaleString('en-IN')}
Lead score: ${client.lead_score || 0}`.trim();

    const recommendations = await callGroq(
      `You are a financial advisor AI for Navia Markets India. Generate specific cross-sell recommendations. Keep under 150 words.`,
      `Based on this client profile, suggest 2-3 cross-sell opportunities:\n${dataContext}\nFormat as bullet points.`,
      300
    );

    res.json({ ucc, client_name: client.name, recommendations });
  } catch (err) {
    console.error('Cross-sell error:', err.message);
    res.status(500).json({ message: 'Failed to generate recommendations', error: err.message });
  }
});

// GET /api/ai/cross-sell
router.get('/cross-sell', auth, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const rmRes   = await pool.query('SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1)', [userRes.rows[0]?.name]);
    const rmId    = rmRes.rows[0]?.id;
    if (!rmId) return res.json([]);

    const clientsRes = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, c.plan,
        COALESCE((SELECT SUM(opening_balance) FROM daily_ledger WHERE ucc = c.ucc), 0) as avg_balance,
        COALESCE((SELECT SUM(total_holding_value) FROM holdings_summary WHERE ucc = c.ucc), 0) as holdings,
        COALESCE((SELECT SUM(options_premium_turnover) FROM daily_trades WHERE ucc = c.ucc), 0) as options_to,
        COALESCE((SELECT SUM(eq_cash_turnover) FROM daily_trades WHERE ucc = c.ucc), 0) as eq_cash
      FROM clients c WHERE c.assigned_rm_id = $1 AND c.is_active = true
    `, [rmId]);

    const opps = [];
    for (const c of clientsRes.rows) {
      const balance   = parseFloat(c.avg_balance) || 0;
      const holdings  = parseFloat(c.holdings)    || 0;
      const optionsTo = parseFloat(c.options_to)  || 0;
      const eqCash    = parseFloat(c.eq_cash)     || 0;

      if (holdings > 10000 && balance < holdings * 0.2) {
        opps.push({ ucc: c.ucc, name: c.name, client_type: c.client_type, plan: c.plan, opportunity: 'MTF Activation', reason: `Holdings of ₹${(holdings/1000).toFixed(1)}K can be used as MTF collateral. Balance is low — MTF can enhance trading power.`, potential_value: holdings * 0.5 });
      } else if (eqCash > 50000 && optionsTo === 0) {
        opps.push({ ucc: c.ucc, name: c.name, client_type: c.client_type, plan: c.plan, opportunity: 'Options Trading', reason: `Active equity trader with ₹${(eqCash/1000).toFixed(1)}K turnover but no options activity. Good candidate for options introduction.`, potential_value: eqCash * 0.1 });
      } else if (c.plan === 'zero-brokerage' && (eqCash + optionsTo) > 50000) {
        opps.push({ ucc: c.ucc, name: c.name, client_type: c.client_type, plan: c.plan, opportunity: 'Plan Upgrade', reason: `High trading volume on zero-brokerage plan. A flat-fee plan may offer better value.`, potential_value: (eqCash + optionsTo) * 0.002 });
      } else if (c.client_type === 'NRI') {
        opps.push({ ucc: c.ucc, name: c.name, client_type: c.client_type, plan: c.plan, opportunity: 'NRI Services', reason: 'NRI client — discuss PINS account, repatriation benefits, and NRI-specific investment products.', potential_value: balance });
      } else {
        opps.push({ ucc: c.ucc, name: c.name, client_type: c.client_type, plan: c.plan, opportunity: 'Equity Investment', reason: `Low overall activity. Introduce systematic equity investment plans and SIP options to increase engagement.`, potential_value: balance * 0.3 });
      }
    }
    res.json(opps);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/talking-points/:ucc', auth, async (req, res) => {
  try {
    const { ucc } = req.params;

    // Fetch client data for context
    const [clientRes, tradesRes, ledgerRes, scoreRes, interactionsRes] = await Promise.all([
      pool.query('SELECT * FROM clients WHERE ucc = $1 LIMIT 1', [ucc]),
      pool.query(`
        SELECT TO_CHAR(trade_date, 'DD Mon') as date,
          eq_cash_turnover, eq_fo_turnover, options_premium_turnover,
          commodity_fo_turnover, brokerage_earned
        FROM daily_trades WHERE ucc = $1
        ORDER BY trade_date DESC LIMIT 10
      `, [ucc]),
      pool.query(`
        SELECT opening_balance FROM daily_ledger
        WHERE ucc = $1 ORDER BY ledger_date DESC LIMIT 1
      `, [ucc]),
      pool.query(`
        SELECT lead_score, churn_risk_score, ai_notes
        FROM ai_scores WHERE ucc = $1
        ORDER BY score_date DESC LIMIT 1
      `, [ucc]),
      pool.query(`
        SELECT interaction_type, outcome, notes, created_at
        FROM interactions WHERE ucc = $1
        ORDER BY created_at DESC LIMIT 3
      `, [ucc])
    ]);

    const client       = clientRes.rows[0];
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const score        = scoreRes.rows[0];
    const balance      = parseFloat(ledgerRes.rows[0]?.opening_balance) || 0;
    const recentTrades = tradesRes.rows;
    const interactions = interactionsRes.rows;

    const totalOptionsTO = recentTrades.reduce((s, t) => s + parseFloat(t.options_premium_turnover || 0), 0);
    const totalEqCash    = recentTrades.reduce((s, t) => s + parseFloat(t.eq_cash_turnover || 0), 0);
    const lastTrade      = client.last_trade_date
      ? Math.floor((Date.now() - new Date(client.last_trade_date)) / 86400000)
      : null;

    const prompt = `You are a senior relationship manager coach at Navia Markets, a stock broker.
    
Prepare a concise call briefing for an RM who is about to call this client. Be specific, practical and conversational.

CLIENT PROFILE:
- Name: ${client.name}
- Type: ${client.client_type}
- Plan: ${client.plan || 'Unknown'}
- Account opened: ${client.account_open_date ? new Date(client.account_open_date).toLocaleDateString('en-IN') : 'Unknown'}
- Last trade: ${lastTrade !== null ? lastTrade + ' days ago' : 'Never traded'}
- Current ledger balance: ₹${balance.toLocaleString('en-IN')}
- Lead score: ${score?.lead_score || 'N/A'}
- Churn risk score: ${score?.churn_risk_score || 'N/A'}
- AI notes: ${score?.ai_notes || 'None'}

RECENT TRADING (last 10 days):
- Options turnover: ₹${totalOptionsTO.toLocaleString('en-IN')}
- Equity cash turnover: ₹${totalEqCash.toLocaleString('en-IN')}
- Trading days: ${recentTrades.length}

LAST INTERACTIONS:
${interactions.length === 0 ? 'No previous interactions logged.' : interactions.map(i => `- ${i.interaction_type} on ${new Date(i.created_at).toLocaleDateString('en-IN')}: ${i.outcome} — ${i.notes || 'No notes'}`).join('\n')}

Provide a call briefing with these 4 sections:
1. OPENING LINE: One natural sentence the RM can use to open the call
2. KEY TALKING POINTS: 3 specific things to discuss based on this client's actual data
3. OPPORTUNITY: One specific product or action to pitch (MTF, options activation, plan upgrade, reactivation etc.)
4. WATCH OUT: One thing to be careful about on this call

Keep it brief, practical and specific to this client's numbers. No generic advice.`;

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens:  400,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = completion.choices[0]?.message?.content || '';

    res.json({
      ucc,
      client_name: client.name,
      client_type: client.client_type,
      lead_score:  score?.lead_score,
      churn_risk:  score?.churn_risk_score,
      balance,
      last_trade_days: lastTrade,
      talking_points: text
    });

  } catch (err) {
    console.error('Talking points error:', err.message);
    res.status(500).json({ message: 'Failed to generate talking points', error: err.message });
  }
});

router.get('/company-insights', auth, async (req, res) => {
  try {
    const [clientsRes, leadsRes, rmRes, revenueRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, AVG(a.lead_score) as avg_score,
        COUNT(CASE WHEN a.lead_score >= 50 THEN 1 END) as high_priority,
        COUNT(CASE WHEN a.churn_risk_score >= 6 THEN 1 END) as churn_risk,
        COUNT(CASE WHEN c.is_mapped = true THEN 1 END) as mapped
        FROM clients c LEFT JOIN ai_scores a ON c.ucc = a.ucc WHERE c.status = 'Active'`),
      pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status='opted_in' THEN 1 END) as pending FROM lead_pool`),
      pool.query(`SELECT COUNT(*) as total FROM users WHERE role IN ('rm','team_leader') AND is_active=true`),
      pool.query(`SELECT COALESCE(SUM(brokerage_earned),0) as mtd_brokerage,
        COALESCE(SUM(options_premium_turnover),0) as mtd_options
        FROM daily_trades WHERE trade_date >= date_trunc('month', CURRENT_DATE)`)
    ]);
    const cs = clientsRes.rows[0];
    const ls = leadsRes.rows[0];
    const rs = revenueRes.rows[0];
    res.json({
      narrative: `${cs.total} active clients, ${cs.high_priority} high-priority. ${ls.pending} leads pending approval.`,
      stats: {
        total_clients: parseInt(cs.total), mapped_clients: parseInt(cs.mapped),
        avg_lead_score: parseFloat(cs.avg_score||0).toFixed(1),
        high_priority: parseInt(cs.high_priority), churn_risk: parseInt(cs.churn_risk),
        total_leads: parseInt(ls.total), pending_approval: parseInt(ls.pending),
        active_rms: parseInt(rmRes.rows[0]?.total||0),
        mtd_brokerage: parseFloat(rs.mtd_brokerage||0),
        mtd_options_to: parseFloat(rs.mtd_options||0)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load company insights', error: err.message });
  }
});

module.exports = router;