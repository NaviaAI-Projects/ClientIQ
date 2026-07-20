const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// ── Shared data processing — ALL metrics read from the 90-day summary table ──
// Per management spec (points 30/31), Trade Insights sources exclusively from
// `trade_summary_90d` (one summarized row per client per trade date, rebuilt on
// every import and rolled off at 90 days). Realized P&L is pre-stored per day;
// the per-symbol breakdown lives in the `symbols` JSONB. Nothing here touches the
// raw `trades` table. Anything not computable from the available columns
// (ITM/ATM/OTM needs a spot price; intraday curve / lot-sizing need reliable time
// sequencing) is returned empty rather than invented.
async function buildInsightsData(ucc, days = 90) {
  const clientRes = await pool.query(
    `SELECT name, last_trade_date, client_type FROM clients WHERE ucc = $1`, [ucc]
  );
  const client = clientRes.rows[0];
  if (!client) throw new Error('Client not found');

  const D = parseInt(days) || 90;

  // Per-symbol window aggregation (from the summary JSONB) → realized P&L on matched qty
  const symRes = await pool.query(`
    SELECT x.s AS trading_symbol,
           MAX(x.ot) AS option_type,
           MAX(x.pt) AS product_type,
           MAX(x.ex) AS exchange,
           MIN(t.trade_date) AS trade_date,
           SUM(x.sv)::float AS sell_val,
           SUM(x.bv)::float AS buy_val,
           SUM(x.sq)::float AS sell_qty,
           SUM(x.bq)::float AS buy_qty,
           SUM(x.n)::int    AS trades,
           SUM(x."to")::float AS turnover
    FROM trade_summary_90d t
    CROSS JOIN LATERAL jsonb_to_recordset(t.symbols)
      AS x(s text, ot text, pt text, ex text, bv float, sv float, bq float, sq float, "to" float, n int)
    WHERE t.ucc = $1 AND t.trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
    GROUP BY x.s
  `, [ucc, D]);

  // Book-level aggregates (sum of the summary's daily scalar columns)
  const aggRes = await pool.query(`
    SELECT
      COALESCE(SUM(total_trades),0)::int AS total_trades,
      COUNT(*)::int                      AS trade_days,
      COALESCE(SUM(total_qty),0)::float  AS total_qty,
      COALESCE(SUM(turnover),0)::float   AS total_turnover,
      COALESCE(SUM(options_to),0)::float AS options_to,
      COALESCE(SUM(call_to),0)::float    AS call_to,
      COALESCE(SUM(put_to),0)::float     AS put_to,
      COALESCE(SUM(eq_cash_to),0)::float AS eq_cash_to,
      COALESCE(SUM(eq_fut_to),0)::float  AS eq_fut_to,
      COALESCE(SUM(comm_to),0)::float    AS comm_to,
      COALESCE(SUM(cnc_to),0)::float     AS cnc,
      COALESCE(SUM(mis_to),0)::float     AS mis,
      COALESCE(SUM(other_to),0)::float   AS other,
      COALESCE(SUM(cnc_trades),0)::int   AS cnc_trades,
      COALESCE(SUM(mis_trades),0)::int   AS mis_trades
    FROM trade_summary_90d
    WHERE ucc = $1 AND trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
  `, [ucc, D]);
  const A = aggRes.rows[0] || {};
  const tradeDays = Number(A.trade_days || 0);
  if (tradeDays === 0) return { trade_days: 0, client_name: client.name, ucc };

  // Per-day realized P&L (pre-stored in the summary) for calendar / best-worst days / trends
  const dayRes = await pool.query(`
    SELECT trade_date::text AS d,
           EXTRACT(DOW FROM trade_date)::int AS dow,
           COALESCE(total_trades,0)::int  AS trades,
           COALESCE(realized_pnl,0)::float AS realized_pnl
    FROM trade_summary_90d
    WHERE ucc = $1 AND trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
    ORDER BY trade_date ASC
  `, [ucc, D]);

  // ── Per-symbol realized P&L ──
  const instruments = symRes.rows.map(r => {
    const buyQty = Number(r.buy_qty) || 0, sellQty = Number(r.sell_qty) || 0;
    const buyVal = Number(r.buy_val) || 0, sellVal = Number(r.sell_val) || 0;
    const matched = Math.min(buyQty, sellQty);
    const avgBuy  = buyQty  > 0 ? buyVal  / buyQty  : 0;
    const avgSell = sellQty > 0 ? sellVal / sellQty : 0;
    const realized = matched > 0 ? (avgSell - avgBuy) * matched : 0;
    return {
      instrument: r.trading_symbol || '—',
      option_type: (r.option_type || '').toUpperCase(),
      trades: Number(r.trades) || 0,
      turnover: Number(r.turnover) || 0,
      pnl: Math.round(realized),
      closed: matched > 0,
    };
  });

  const closed      = instruments.filter(i => i.closed);
  const wins        = closed.filter(i => i.pnl > 0).length;
  const losses      = closed.filter(i => i.pnl < 0).length;
  const winRate     = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const netPnl      = instruments.reduce((s, i) => s + i.pnl, 0);
  const grossProfit = instruments.filter(i => i.pnl > 0).reduce((s, i) => s + i.pnl, 0);
  const grossLoss   = instruments.filter(i => i.pnl < 0).reduce((s, i) => s + i.pnl, 0);
  const avgWin      = wins   > 0 ? grossProfit / wins   : 0;
  const avgLoss     = losses > 0 ? grossLoss   / losses : 0;
  const profitFactor = grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : (grossProfit > 0 ? Number(grossProfit.toFixed(2)) : 0);

  // ── Per-day series ──
  const dayRows = dayRes.rows.map(r => ({ date: r.d, dow: Number(r.dow), trades: Number(r.trades), pnl: Math.round(Number(r.realized_pnl) || 0) }));
  let cum = 0;
  const pnlTrend = dayRows.map((d, i) => { cum += d.pnl; return { day: i + 1, pnl: Math.round(cum) }; });

  const weekMap = {};
  dayRows.forEach(d => { const dt = new Date(d.date); const w = `Wk${Math.ceil(dt.getUTCDate() / 7)} ${dt.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`; weekMap[w] = (weekMap[w] || 0) + d.pnl; });
  const weeklyPnl = Object.entries(weekMap).slice(-8).map(([week, p]) => ({ week, pnl: Math.round(p) }));

  const moMap = {};
  dayRows.forEach(d => { const dt = new Date(d.date); const mo = dt.toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }); if (!moMap[mo]) moMap[mo] = { month: mo, gross_profit: 0, gross_loss: 0 }; if (d.pnl > 0) moMap[mo].gross_profit += d.pnl; else moMap[mo].gross_loss += d.pnl; });
  const monthlyPnl = Object.values(moMap).slice(-5).map(m => ({ month: m.month, gross_profit: Math.round(m.gross_profit), gross_loss: Math.round(m.gross_loss) }));

  const sortedDays = [...dayRows].sort((a, b) => b.pnl - a.pnl);
  const bestDays   = sortedDays.slice(0, 5).map(d => ({ date: d.date, pnl: d.pnl, trades: d.trades }));
  const worstDays  = sortedDays.slice(-5).reverse().map(d => ({ date: d.date, pnl: d.pnl, trades: d.trades, note: d.pnl < 0 ? 'Loss day' : 'Low return' }));

  // ── Turnover / segment mix ──
  const optionsTO = Number(A.options_to) || 0;
  const eqCashTO  = Number(A.eq_cash_to) || 0;
  const eqFutTO   = Number(A.eq_fut_to)  || 0;
  const commTO    = Number(A.comm_to)    || 0;
  const totalTO   = Number(A.total_turnover) || 0;
  const seg = (name, v) => ({ name, value: totalTO > 0 ? Math.round((v / totalTO) * 100) : 0 });
  const segmentMix = [seg('Options', optionsTO), seg('Eq Cash', eqCashTO), seg('Eq F&O', eqFutTO), seg('Comm F&O', commTO)].filter(s => s.value > 0);

  // ── Call / Put ──
  const callTO = Number(A.call_to) || 0, putTO = Number(A.put_to) || 0;
  const callPct = (callTO + putTO) > 0 ? Math.round((callTO / (callTO + putTO)) * 100) : 0;

  // ── Instruments ranked by realized P&L / turnover ──
  const byPnl   = [...instruments].sort((a, b) => b.pnl - a.pnl);
  const top5    = byPnl.slice(0, 5);
  const worst5  = byPnl.filter(i => i.pnl < 0).slice(-5).reverse();
  const byTO    = [...instruments].sort((a, b) => b.turnover - a.turnover);
  const bestStrike = byTO[0]?.instrument || '—';

  const topInstrumentsOptions = byTO.slice(0, 5).map(r => ({
    instrument: r.instrument, trades: r.trades, lots: 0,
    win_rate: null, avg_pnl: r.trades > 0 ? Math.round(r.pnl / r.trades) : 0,
    total_pnl: r.pnl, bias: r.option_type === 'CE' ? 'Calls' : r.option_type === 'PE' ? 'Puts' : '—',
  }));
  const topInstrumentsBW   = top5.map(r => ({ instrument: r.instrument, pnl: r.pnl, win_rate: null, trades: r.trades }));
  const worstInstrumentsBW = worst5.length ? worst5.map(r => ({ instrument: r.instrument, pnl: r.pnl, win_rate: null, trades: r.trades }))
                                           : [{ instrument: 'No closed losing positions', pnl: 0, win_rate: null, trades: 0 }];

  // ── Day-of-week (real) ──
  const dowMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
  const dowStats = {};
  dayRows.forEach(d => { if (!dowMap[d.dow]) return; if (!dowStats[d.dow]) dowStats[d.dow] = { wins: 0, count: 0, pnl: 0 }; dowStats[d.dow].count++; dowStats[d.dow].pnl += d.pnl; if (d.pnl > 0) dowStats[d.dow].wins++; });
  const dowData = [1, 2, 3, 4, 5].map(d => ({ day: dowMap[d], win_rate: dowStats[d] ? Math.round((dowStats[d].wins / dowStats[d].count) * 100) : 0, avg_pnl: dowStats[d] && dowStats[d].count ? Math.round(dowStats[d].pnl / dowStats[d].count) : 0 }));

  // ── Calendar (real realized P&L per date) ──
  const now = new Date();
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMo = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const pnlByDate = {}; dayRows.forEach(d => { pnlByDate[d.date] = d.pnl; });
  const calDays = [];
  for (let i = 0; i < offset; i++) calDays.push({ date: '', type: 'empty', label: '' });
  for (let d = 1; d <= daysInMo; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = pnlByDate[ds];
    calDays.push({ date: d, type: p === undefined ? 'flat' : p > 0 ? 'profit' : p < 0 ? 'loss' : 'flat',
      label: p !== undefined ? (p > 0 ? '+' : '') + Math.round(p).toLocaleString('en-IN') : 'No trade' });
  }

  // ── Scorecard — derived from real win rate / profit factor ──
  const scorecard = [
    { label: 'Consistency',   score: Math.min(95, Math.max(5, Math.round((wins / Math.max(closed.length, 1)) * 100))) },
    { label: 'Win rate',      score: Math.min(95, Math.max(5, winRate)) },
    { label: 'Risk / Reward', score: Math.min(95, Math.max(5, profitFactor >= 1.5 ? 75 : profitFactor >= 1.0 ? 55 : 35)) },
    { label: 'Profit Factor', score: Math.min(95, Math.max(5, Math.round(Math.min(profitFactor, 2.5) * 35))) },
  ];

  // ── AI insight from REAL numbers ──
  let aiInsights = {};
  const topNames = byTO.slice(0, 3).map(r => r.instrument).join(', ') || 'various instruments';
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', max_tokens: 220, temperature: 0.5,
      messages: [{ role: 'user', content:
        `Analyse this Indian retail trader's realized performance in 3 sentences with specific numbers, then one actionable tip.
Client: ${client.name} | Realized P&L: ${inr(netPnl)} | Win rate: ${winRate}% (${wins}W/${losses}L closed positions)
Total trades: ${A.total_trades} over ${tradeDays} day(s) | Turnover: ${inr(totalTO)} | Call/Put: ${callPct}% calls
Top instruments: ${topNames}. Do not invent numbers beyond these.` }],
    });
    aiInsights.summary = completion.choices[0]?.message?.content || '';
  } catch (e) {
    aiInsights.summary = `${client.name} traded ${A.total_trades} times across ${tradeDays} day(s), with realized P&L of ${inr(netPnl)} and a ${winRate}% win rate on ${closed.length} closed position${closed.length === 1 ? '' : 's'}, mainly in ${topNames}. ${netPnl >= 0 ? 'The book is net positive on closed trades.' : 'Closed trades are net negative — review entries on the losing instruments.'}`;
  }

  return {
    trade_days: tradeDays,
    client_name: client.name,
    ucc,
    cnc_mis: {
      cnc: Math.round(Number(A.cnc) || 0), mis: Math.round(Number(A.mis) || 0), other: Math.round(Number(A.other) || 0),
      cnc_trades: Number(A.cnc_trades) || 0, mis_trades: Number(A.mis_trades) || 0,
    },
    period: { days: D, from_date: dayRows[0]?.date || null, to_date: dayRows[dayRows.length - 1]?.date || null, trade_days: tradeDays },
    summary: {
      net_pnl: Math.round(netPnl),
      pnl_pct: totalTO > 0 ? parseFloat((netPnl / totalTO * 100).toFixed(2)) : 0,
      win_rate: winRate, wins, losses,
      premium_to: Math.round(totalTO),
      lots: Math.round(Number(A.total_qty) || 0),
      trades: Number(A.total_trades) || 0,
      avg_win: Math.round(avgWin), avg_loss: Math.round(avgLoss),
      profit_factor: parseFloat(Number(profitFactor).toFixed(2)),
      best_day: bestDays[0]?.pnl || 0, worst_day: worstDays[0]?.pnl || 0,
      avg_trades_per_day: tradeDays > 0 ? Math.round((Number(A.total_trades) || 0) / tradeDays) : 0,
      max_win_streak: null,   // needs intra-day sequencing not available
      pnl_trend: pnlTrend, weekly_pnl: weeklyPnl, segment_mix: segmentMix,
    },
    options_stats: {
      win_rate: winRate, wins, losses, call_pct: callPct,
      best_strike: bestStrike, best_strike_wr: null, avg_hold_hrs: null,
      strike_table: [],          // ITM/ATM/OTM needs an underlying spot price — not in the feed
      callput_monthly: [],       // reliable per-month call/put P&L split not derivable here
      expiry_wr: null, normal_wr: null, expiry_lots: null, normal_lots: null, expiry_trades: null, normal_trades: null,
      top_instruments: topInstrumentsOptions.length ? topInstrumentsOptions : [{ instrument: 'No options data', trades: 0, lots: 0, win_rate: null, avg_pnl: 0, total_pnl: 0, bias: '—' }],
    },
    patterns: {
      dow: dowData,
      tod: [],                   // intraday time-of-day P&L needs reliable trade time-matching — omitted
      lot_sizing: [],            // position-sizing sequence not reliably derivable — omitted
      lots_after_win: null, lots_after_loss: null, wr_after_win: null, wr_after_loss: null, escalation: null,
      monthly_pnl: monthlyPnl,
    },
    best_worst: {
      top_instruments: topInstrumentsBW.length ? topInstrumentsBW : [{ instrument: '—', pnl: 0, win_rate: null, trades: 0 }],
      worst_instruments: worstInstrumentsBW,
      best_days: bestDays, worst_days: worstDays,
      mom: monthlyPnl.map(m => ({ month: m.month, net_pnl: m.gross_profit + m.gross_loss, win_rate: winRate })),
      scorecard,
    },
    calendar: { days: calDays },
    ai_insights: aiInsights,
  };
}

// ── GET /:ucc — Authenticated (ClientIQ internal) ─────────────
router.get('/:ucc', auth, async (req, res) => {
  try {
    const data = await buildInsightsData(req.params.ucc, parseInt(req.query.days) || 90);
    res.json(data);
  } catch (err) {
    console.error('Trade insights error:', err.message);
    res.status(err.message === 'Client not found' ? 404 : 500).json({ message: err.message });
  }
});

// ── GET /generate-token — Trading app gets daily token ─────────
router.get('/generate-token', async (req, res) => {
  try {
    const { api_key } = req.query;
    const validKey    = process.env.TRADING_APP_API_KEY || 'navia-trading-app-2026';
    if (api_key !== validKey) return res.status(401).json({ message: 'Invalid API key' });

    const jwt   = require('jsonwebtoken');
    const token = jwt.sign(
      { source: 'trading_app', scope: 'trade_insights' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.json({
      success:      true,
      token,
      expires_in:   '24 hours',
      generated_at: new Date().toISOString(),
      usage:        `POST /api/trade-insights/public with body: { ucc, token }`,
      example_url:  `${frontendUrl}/trade-insights?ucc=CLIENT_UCC&token=${token}`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /public — Trading app fetches data with token ─────────
router.post('/public', async (req, res) => {
  try {
    const { ucc, token, days = 90 } = req.body;
    if (!ucc)   return res.status(400).json({ message: 'UCC is required' });
    if (!token) return res.status(401).json({ message: 'Token required' });

    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        message: e.name === 'TokenExpiredError'
          ? 'Token expired. Generate a new token using GET /api/trade-insights/generate-token'
          : 'Invalid token.',
      });
    }

    if (decoded.source !== 'trading_app') {
      return res.status(403).json({ message: 'Invalid token source.' });
    }

    const data = await buildInsightsData(ucc, parseInt(days) || 90);
    res.json(data);
  } catch (err) {
    console.error('Public insights error:', err.message);
    res.status(err.message === 'Client not found' ? 404 : 500).json({ message: err.message });
  }
});

module.exports = router;