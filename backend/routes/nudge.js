const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

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

module.exports = router;