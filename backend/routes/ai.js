const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const axios   = require('axios');

const GROQ_API_KEY = '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';
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
router.post('/rescore', auth, async (req, res) => {
  try {
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('options_to_weight','float_weight','equity_weight','mtf_weight','nri_weight','dormancy_weight','lead_score_threshold')`
    );
    const w = {};
    settingsResult.rows.forEach(r => { w[r.key] = parseFloat(r.value) || 0; });
    const threshold = w.lead_score_threshold || 20;

    const clientsResult = await pool.query(`
      SELECT DISTINCT ON (c.ucc)
        c.ucc, c.name, c.client_type, c.status,
        COALESCE(SUM(CASE WHEN dt.segment IN ('EQ_OPT','COMM_OPT') THEN dt.turnover ELSE 0 END) OVER (PARTITION BY c.ucc), 0) AS options_to,
        COALESCE(SUM(CASE WHEN dt.segment = 'EQ_CASH' THEN dt.turnover ELSE 0 END) OVER (PARTITION BY c.ucc), 0) AS eq_cash_to,
        COALESCE(AVG(dl.opening_balance) OVER (PARTITION BY c.ucc), 0) AS avg_float,
        COALESCE(SUM(mm.net_charged) OVER (PARTITION BY c.ucc), 0) AS mtf_interest,
        c.last_trade_date
      FROM clients c
      LEFT JOIN daily_trades dt ON c.ucc = dt.ucc
      LEFT JOIN daily_ledger dl ON c.ucc = dl.ucc
      LEFT JOIN mtf_monthly mm ON c.ucc = mm.ucc
      WHERE c.status != 'Suspended'
      ORDER BY c.ucc
    `);

    const clients = clientsResult.rows;
    let processed = 0;

    for (const client of clients) {
      const optScore   = client.options_to > 0     ? (w.options_to_weight || 35) : 0;
      const floatScore = client.avg_float >= 50000  ? (w.float_weight || 20)     : client.avg_float >= 10000 ? (w.float_weight || 20) / 2 : 0;
      const eqScore    = client.eq_cash_to > 0      ? (w.equity_weight || 20)    : 0;
      const mtfScore   = client.mtf_interest > 0    ? (w.mtf_weight || 10)       : 0;
      const nriScore   = client.client_type === 'NRI' ? (w.nri_weight || 8)      : 0;
      const lastTrade  = client.last_trade_date ? new Date(client.last_trade_date) : null;
      const daysSince  = lastTrade ? Math.floor((Date.now() - lastTrade) / 86400000) : 999;
      const dormScore  = daysSince > 30 ? -(w.dormancy_weight || 7) : 0;
      const leadScore  = Math.min(Math.max(optScore + floatScore + eqScore + mtfScore + nriScore + dormScore, 0), 100);
      const churnRisk  = daysSince > 60 ? 8 : daysSince > 30 ? 5 : 3;
      let aiNotes = '';
      if (leadScore >= 50)      aiNotes = 'High opportunity client. Priority engagement recommended.';
      else if (leadScore >= 30) aiNotes = 'Medium opportunity. Monitor activity and engage.';
      else                      aiNotes = 'Low opportunity client currently. Monitor activity.';

      await pool.query(`
        INSERT INTO ai_scores (ucc, lead_score, churn_risk_score, ai_notes, score_date)
        VALUES ($1, $2, $3, $4, CURRENT_DATE)
        ON CONFLICT (ucc, score_date)
        DO UPDATE SET lead_score = $2, churn_risk_score = $3, ai_notes = $4
      `, [client.ucc, leadScore, churnRisk, aiNotes]);

      if (leadScore >= threshold) {
        await pool.query(`
          INSERT INTO lead_pool (ucc, lead_score, churn_risk_score, status)
          VALUES ($1, $2, $3, 'unassigned')
          ON CONFLICT (ucc) DO UPDATE SET
            lead_score = EXCLUDED.lead_score,
            churn_risk_score = EXCLUDED.churn_risk_score,
            status = CASE
              WHEN lead_pool.status IN ('assigned','converted') THEN lead_pool.status
              ELSE 'unassigned'
            END
        `, [client.ucc, leadScore, churnRisk]);
      }
      processed++;
    }

    res.json({ success: true, processed, message: `${processed} clients rescored successfully` });
  } catch (err) {
    console.error('Rescore error:', err.message);
    res.status(500).json({ message: 'Rescore failed', error: err.message });
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

    const [highPriorityRes, churnRes] = await Promise.all([
      pool.query(`SELECT c.ucc, c.name, a.lead_score, a.churn_risk_score, u.name as rm_name
        FROM clients c LEFT JOIN ai_scores a ON c.ucc = a.ucc
        LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
        LEFT JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        WHERE a.lead_score >= 50 ORDER BY a.lead_score DESC LIMIT 5`),
      pool.query(`SELECT c.ucc, c.name, a.lead_score, a.churn_risk_score, u.name as rm_name
        FROM clients c LEFT JOIN ai_scores a ON c.ucc = a.ucc
        LEFT JOIN rm_master rm ON rm.id = c.assigned_rm_id
        LEFT JOIN users u ON LOWER(u.name) = LOWER(rm.rm_name)
        WHERE a.churn_risk_score >= 6 ORDER BY a.churn_risk_score DESC LIMIT 5`)
    ]);

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
        { title: 'MTF Activation', description: 'Clients with high holdings but low balance can leverage MTF for enhanced returns.' },
        { title: 'Plan Upgrade', description: 'High-volume zero-brokerage clients may benefit from a flat-fee plan.' },
        { title: 'Options Introduction', description: 'Active equity traders with no options exposure are good F&O onboarding candidates.' }
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

module.exports = router;