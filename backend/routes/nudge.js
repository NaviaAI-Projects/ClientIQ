const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const jwt     = require('jsonwebtoken');

function fmtAmt(v) {
  const n = parseFloat(v) || 0;
  if (n >= 10000000) return 'Rs.' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return 'Rs.' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)     return 'Rs.' + (n/1000).toFixed(1) + 'K';
  return 'Rs.' + n.toFixed(0);
}

router.get('/', async (req, res) => {
  const { ucc } = req.query;
  if (!ucc) return res.status(400).json({ nudges: [], reason: 'UCC required' });
  try {
    const settingsRes = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'nudge_%'");
    const s = {};
    settingsRes.rows.forEach(r => { s[r.key] = r.value; });

    const clientRes = await pool.query('SELECT name, last_trade_date FROM clients WHERE ucc = $1', [ucc]);
    const client = clientRes.rows[0];
    if (!client) return res.json({ nudges: [], trade_days: 0 });

    const tradesRes = await pool.query('SELECT trade_date, eq_cash_turnover, eq_fo_turnover, commodity_fo_turnover, options_premium_turnover, brokerage_earned FROM daily_trades WHERE ucc = $1 ORDER BY trade_date DESC LIMIT 90', [ucc]);
    const trades = tradesRes.rows;
    const totalDays = trades.length;

    const ledgerRes = await pool.query('SELECT opening_balance FROM daily_ledger WHERE ucc = $1 ORDER BY ledger_date DESC LIMIT 30', [ucc]);
    const avgBalance = ledgerRes.rows.length > 0 ? ledgerRes.rows.reduce((s, r) => s + parseFloat(r.opening_balance || 0), 0) / ledgerRes.rows.length : 0;

    const holdingsRes = await pool.query('SELECT total_holding_value FROM holdings_summary WHERE ucc = $1 ORDER BY holding_date DESC LIMIT 1', [ucc]);
    const holdingsVal = parseFloat(holdingsRes.rows[0] && holdingsRes.rows[0].total_holding_value || 0);

    const nudges = [];

    if (totalDays === 0) {
      nudges.push({ type: 'info', icon: 'INFO', title: 'No Trade History', message: 'No trading data found for this client in the last 90 days.' });
      return res.json({ nudges: nudges, trade_days: 0 });
    }

    const totalTO = trades.reduce(function(sum, t) { return sum + parseFloat(t.eq_cash_turnover||0) + parseFloat(t.eq_fo_turnover||0) + parseFloat(t.options_premium_turnover||0) + parseFloat(t.commodity_fo_turnover||0); }, 0);
    const totalOptions = trades.reduce(function(sum, t) { return sum + parseFloat(t.options_premium_turnover||0); }, 0);
    const totalBrokerage = trades.reduce(function(sum, t) { return sum + parseFloat(t.brokerage_earned||0); }, 0);
    const avgDayTO = totalTO / totalDays;

    const lastTrade = client.last_trade_date ? new Date(client.last_trade_date) : null;
    const daysSinceLast = lastTrade ? Math.floor((Date.now() - lastTrade.getTime()) / 86400000) : 999;

    if (daysSinceLast > 14) {
      nudges.push({ type: 'warning', icon: 'WARN', title: 'Inactive Client', message: client.name.trim() + ' has not traded in ' + daysSinceLast + ' days. Last trade: ' + (lastTrade ? lastTrade.toLocaleDateString('en-IN') : 'Unknown') + '. Consider reaching out.' });
    }

    if (avgBalance > 200000) {
      nudges.push({ type: 'warning', icon: 'WARN', title: 'High Idle Balance', message: 'Average ledger balance of ' + fmtAmt(avgBalance) + ' is sitting idle. Consider discussing MTF or investment opportunities.' });
    }

    if (totalOptions > 0 && totalTO > 0) {
      const pct = Math.round((totalOptions / totalTO) * 100);
      nudges.push({ type: pct > 70 ? 'warning' : 'info', icon: 'INFO', title: 'Options Activity', message: pct + '% of turnover is in options (' + fmtAmt(totalOptions) + ' across ' + totalDays + ' days). ' + (pct > 70 ? 'High concentration - review risk.' : 'Balanced profile.') });
    }

    if (totalBrokerage < 100 && totalDays > 5) {
      nudges.push({ type: 'info', icon: 'INFO', title: 'Low Revenue Client', message: 'Total brokerage: ' + fmtAmt(totalBrokerage) + ' across ' + totalDays + ' days. Consider discussing plan upgrade.' });
    }

    if (holdingsVal > 0 && avgBalance < holdingsVal * 0.1) {
      nudges.push({ type: 'info', icon: 'INFO', title: 'Holdings vs Balance', message: 'Client holds ' + fmtAmt(holdingsVal) + ' in portfolio but avg balance is only ' + fmtAmt(avgBalance) + '. Good time to discuss MTF.' });
    }

    if (nudges.length === 0) {
      nudges.push({ type: 'success', icon: 'OK', title: 'Healthy Profile', message: client.name.trim() + ' shows normal trading activity. ' + totalDays + ' trading days, avg daily turnover ' + fmtAmt(avgDayTO) + '.' });
    }

    res.json({ nudges: nudges, trade_days: totalDays, total_turnover: totalTO, avg_balance: avgBalance });
  } catch (err) {
    res.status(500).json({ nudges: [], error: err.message });
  }
});

router.post('/test', auth, async (req, res) => {
  try {
    const clientRes = await pool.query("SELECT ucc, name FROM clients WHERE is_active = true ORDER BY (SELECT COALESCE(SUM(options_premium_turnover),0) FROM daily_trades WHERE ucc = clients.ucc) DESC LIMIT 1");
    if (!clientRes.rows.length) return res.status(400).json({ message: 'No clients found' });
    const ucc = clientRes.rows[0].ucc;
    const name = clientRes.rows[0].name;
    const tradesRes = await pool.query('SELECT COUNT(*) as cnt FROM daily_trades WHERE ucc = $1', [ucc]);
    const tradeDays = parseInt(tradesRes.rows[0].cnt) || 0;
    res.json({ success: true, test_ucc: ucc, client: name.trim(), trade_days: tradeDays, api_url: '/api/nudge?ucc=' + ucc, message: 'Nudge API working. Client ' + name.trim() + ' has ' + tradeDays + ' trading days of history.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Validate trading app token ─────────────────────────────────
function validateToken(req, res, next) {
  const token = req.headers['x-api-token'] || req.body?.token || req.query?.token;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.source !== 'trading_app') return res.status(403).json({ message: 'Invalid token source' });
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
}

// ── POST /api/nudge/check ──────────────────────────────────────
// Trading app calls this when client is about to place an order
// Body: { ucc, instrument, option_type, strike_price, lots, token }
router.post('/check', async (req, res) => {
  try {
    const { ucc, instrument, option_type, strike_price, lots, token } = req.body;

    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.source !== 'trading_app') return res.status(403).json({ message: 'Invalid token' });
    } catch (e) {
      return res.status(401).json({ message: 'Token expired — generate new token' });
    }

    if (!ucc) return res.status(400).json({ message: 'UCC required' });

    // 1. Get client ledger balance
    const ledgerRes = await pool.query(`
      SELECT opening_balance FROM daily_ledger
      WHERE ucc = $1 ORDER BY ledger_date DESC LIMIT 1
    `, [ucc]);
    const balance = parseFloat(ledgerRes.rows[0]?.opening_balance || 0);

    // 2. Get client's trade history for this instrument type
    const tradeRes = await pool.query(`
      SELECT
        COUNT(*)                                          AS total_trades,
        SUM(traded_value)                                 AS total_turnover,
        SUM(CASE WHEN option_type = $2 THEN traded_value ELSE 0 END) AS instrument_turnover,
        COUNT(CASE WHEN option_type = $2 THEN 1 END)     AS instrument_trades
      FROM trades
      WHERE ucc = $1
        AND trade_date >= NOW() - INTERVAL '90 days'
    `, [ucc, option_type || 'CE']);

    const stats = tradeRes.rows[0];

    // 3. Get daily win rate
    const winRes = await pool.query(`
      SELECT
        COUNT(CASE WHEN brokerage_earned > 0 THEN 1 END) AS wins,
        COUNT(*) AS total
      FROM daily_trades
      WHERE ucc = $1
        AND trade_date >= NOW() - INTERVAL '90 days'
        AND (options_premium_turnover > 0 OR eq_fo_turnover > 0)
    `, [ucc]);

    const wins  = parseInt(winRes.rows[0]?.wins  || 0);
    const total = parseInt(winRes.rows[0]?.total || 0);
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    // 4. Get AI score
    const scoreRes = await pool.query(`
      SELECT lead_score, churn_risk_score FROM ai_scores
      WHERE ucc = $1 ORDER BY score_date DESC LIMIT 1
    `, [ucc]);
    const churnRisk = parseInt(scoreRes.rows[0]?.churn_risk_score || 0);

    // 5. Get lot sizing behaviour — does client escalate after losses?
    const lotRes = await pool.query(`
      SELECT trade_date, SUM(trade_qty) AS lots
      FROM trades
      WHERE ucc = $1
        AND trade_date >= NOW() - INTERVAL '30 days'
      GROUP BY trade_date
      ORDER BY trade_date DESC
      LIMIT 5
    `, [ucc]);

    // 6. Build nudges based on real data
    const nudges = [];

    // Balance check
    const estimatedCost = (parseFloat(lots || 1)) * (parseFloat(strike_price || 100));
    if (balance < 10000) {
      nudges.push({
        type:     'warning',
        priority: 'high',
        icon:     '⚠️',
        title:    'Low balance',
        message:  `Your ledger balance is ₹${balance.toLocaleString('en-IN')}. Ensure sufficient margin before placing this order.`,
        action:   'Add funds',
      });
    }

    // Win rate nudge
    if (winRate > 0 && winRate >= 55) {
      nudges.push({
        type:     'positive',
        priority: 'medium',
        icon:     '✅',
        title:    'Good track record',
        message:  `You have a ${winRate}% win rate on options over the last 90 days. This aligns with your trading style.`,
        action:   null,
      });
    } else if (winRate > 0 && winRate < 45) {
      nudges.push({
        type:     'caution',
        priority: 'high',
        icon:     '🔴',
        title:    'Review before trading',
        message:  `Your options win rate is ${winRate}% over 90 days. Consider reviewing your setup before placing this order.`,
        action:   'View trade history',
      });
    }

    // Instrument-specific nudge
    const instrTrades = parseInt(stats?.instrument_trades || 0);
    if (instrTrades > 5) {
      nudges.push({
        type:     'info',
        priority: 'low',
        icon:     'ℹ️',
        title:    `${option_type || 'Options'} activity`,
        message:  `You have placed ${instrTrades} ${option_type || 'CE'} trades in the last 90 days on this segment.`,
        action:   null,
      });
    }

    // Churn risk nudge
    if (churnRisk >= 70) {
      nudges.push({
        type:     'caution',
        priority: 'medium',
        icon:     '📞',
        title:    'Your RM wants to connect',
        message:  `Your relationship manager has flagged your account for a strategy review. Consider speaking with your RM before placing large orders.`,
        action:   'Contact RM',
      });
    }

    // Lot escalation warning
    if (lotRes.rows.length >= 2) {
      const recentLots = lotRes.rows.map(r => parseFloat(r.lots));
      const avgLots = recentLots.reduce((a,b) => a+b, 0) / recentLots.length;
      if (parseFloat(lots) > avgLots * 1.5) {
        nudges.push({
          type:     'warning',
          priority: 'high',
          icon:     '⚡',
          title:    'Larger than usual position',
          message:  `You typically trade ${Math.round(avgLots)} lots. This order of ${lots} lots is ${Math.round(parseFloat(lots)/avgLots*100)}% of your usual size.`,
          action:   'Review position size',
        });
      }
    }

    // Default nudge if nothing triggered
    if (nudges.length === 0) {
      nudges.push({
        type:     'info',
        priority: 'low',
        icon:     'ℹ️',
        title:    'Trade insight',
        message:  `${total > 0 ? `You have been active for ${total} trading days in the last 90 days.` : 'No recent trading history found.'} Trade carefully and manage your risk.`,
        action:   null,
      });
    }

    res.json({
      success:   true,
      ucc,
      instrument: instrument || 'Options',
      option_type,
      client_stats: {
        balance,
        win_rate:   winRate,
        total_trades: total,
        churn_risk: churnRisk,
      },
      nudges,
      // Sort by priority: high first
      nudges_sorted: nudges.sort((a,b) =>
        ['high','medium','low'].indexOf(a.priority) - ['high','medium','low'].indexOf(b.priority)
      ),
    });

  } catch (err) {
    console.error('Nudge error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/nudge/token — get daily token ─────────────────────
router.get('/token', async (req, res) => {
  try {
    const { api_key } = req.query;
    if (api_key !== (process.env.TRADING_APP_API_KEY || 'navia-trading-app-2026')) {
      return res.status(401).json({ message: 'Invalid API key' });
    }
    const token = jwt.sign(
      { source: 'trading_app', scope: 'nudge' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ success: true, token, expires_in: '24 hours' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;