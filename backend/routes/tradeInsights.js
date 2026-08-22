const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// ── Shared data processing — ALL metrics read from the 90-day summary table ──
// Per management spec (points 30/31), Trade Insights sources exclusively from
// `daily_trades` (one summarized row per client per trade date, rebuilt on
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
  // Money values are kept EXACT to the paise (2 decimals) — never rounded to whole rupees.
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
           SUM(x."to")::float AS turnover,
           SUM(x.lots)::float AS lots,
           SUM(COALESCE(x.qty, x.lots))::float AS qty   -- total traded quantity (units); falls back to lots if a pre-rebuild row lacks qty
    FROM daily_trades t
    CROSS JOIN LATERAL jsonb_to_recordset(t.symbols)
      AS x(s text, ot text, pt text, ex text, bv float, sv float, bq float, sq float, "to" float, n int, lots float, qty float)
    WHERE t.ucc = $1 AND t.turnover > 0 AND t.trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
    GROUP BY x.s
  `, [ucc, D]);

  // Total traded QUANTITY (units) per contract = Σ (lots × lot_size), read LIVE from the raw
  // `trades` table so it works immediately after a restart (no daily_trades rebuild needed).
  // Keyed by trading_symbol, the same display key used everywhere else.
  const qtyRes = await pool.query(`
    SELECT trading_symbol AS s, SUM(lots * COALESCE(lot_size,1))::float AS qty
    FROM trades WHERE ucc = $1 AND trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
    GROUP BY trading_symbol
  `, [ucc, D]);
  const qtyBySym = {}; qtyRes.rows.forEach(r => { qtyBySym[r.s] = Number(r.qty) || 0; });

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
    FROM daily_trades
    -- turnover > 0 excludes the daily zero-turnover holdings-snapshot rows (one per holder per day)
    -- so they don't inflate trade_days / streaks — Hozefa showed 7 instead of his 4 real days.
    WHERE ucc = $1 AND turnover > 0 AND trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
  `, [ucc, D]);
  const A = aggRes.rows[0] || {};
  const tradeDays = Number(A.trade_days || 0);
  if (tradeDays === 0) return { trade_days: 0, client_name: client.name, ucc };

  // Per-day realized P&L (pre-stored in the summary) for calendar / best-worst days / trends
  // Per-day realized P&L via cross-day average-cost matching (delivery/positional aware).
  // The stored per-day realized_pnl only captures SAME-DAY round-trips, so for a delivery
  // client it is 0 on every day. Instead we pull each symbol's daily buy/sell aggregates
  // from the summary's `symbols` JSONB, in date order, and book realized P&L below.
  const dayRes = await pool.query(`
    SELECT t.trade_date::text AS d,
           EXTRACT(DOW FROM t.trade_date)::int AS dow,
           x.s AS sym, x.ot AS ot, x.bv AS bv, x.sv AS sv, x.bq AS bq, x.sq AS sq, x.n AS n, x.lots AS lots
    FROM daily_trades t
    CROSS JOIN LATERAL jsonb_to_recordset(t.symbols)
      AS x(s text, ot text, pt text, ex text, bv float, sv float, bq float, sq float, "to" float, n int, lots float)
    WHERE t.ucc = $1 AND t.turnover > 0 AND t.trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
    ORDER BY t.trade_date ASC
  `, [ucc, D]);

  // Per-symbol realized P&L is now built AFTER the per-day loop below, from SAME-DAY matched
  // legs only (symPnl / symWL). Delivery (positions carried across days) does not book P&L —
  // per spec, only intraday (MIS) round-trips are scored. `totalLots` (independent of P&L) is
  // computed here from the window aggregation.
  const totalLots = symRes.rows.reduce((s, r) => s + (Number(r.lots) || 0), 0);

  // ── Per-day series ──
  // Fold the per-symbol daily rows into per-day realized P&L using a running avg-cost book.
  // Same-day (MIS) matching only — no position book is carried across days (delivery is not scored).
  const dayAgg  = {};                 // date -> { dow, trades, pnl, isExpiry }
  const symWL   = {};                 // sym -> { wins, losses } across closed days (for per-instrument win rate)
  const dowWL   = {};                 // dow -> { wins, losses } at the ROUND-TRIP level (for day-of-week win rate)
  const symPnl  = {};                 // sym -> summed per-day realized P&L (same basis as win rate, so the two agree)
  const cpMonth = {};                 // month -> { month, calls, puts }  realized P&L split (CE/PE only)
  const moLbl   = (ds) => { const dt = new Date(ds); return dt.toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
  dayRes.rows.forEach(r => {
    const date = r.d, sym = r.sym;
    const ot   = String(r.ot || '').toUpperCase();
    const bq = Number(r.bq) || 0, sq = Number(r.sq) || 0;
    const bv = Number(r.bv) || 0, sv = Number(r.sv) || 0;
    const n  = Number(r.n)  || 0;
    if (!dayAgg[date]) dayAgg[date] = { dow: Number(r.dow), trades: 0, pnl: 0, lots: 0, optTrades: 0, optPnl: 0, optLots: 0, isExpiry: false };
    dayAgg[date].trades += n;
    dayAgg[date].lots += Number(r.lots) || 0;      // total derivative lots this day (for lot-sizing behaviour)
    const isOpt = (ot === 'CE' || ot === 'PE');
    if (isOpt) { dayAgg[date].optTrades += n; dayAgg[date].optLots += Number(r.lots) || 0; }
    // Approximate expiry-day flag: the contract expiry is embedded in the symbol name
    // (e.g. "GOLDPETAL FUT 2026-06-30"); a day counts as an expiry day if a contract
    // traded that day expires on that date.
    const symExp = (sym.match(/(\d{4}-\d{2}-\d{2})\s*$/) || [])[1] || null;
    if (symExp && symExp === date) dayAgg[date].isExpiry = true;
    // SAME-DAY (MIS) realized P&L ONLY — match this day's buys against this day's sells; nothing
    // carries to the next day. A position bought one day and sold another (delivery/CNC) books
    // NO realized P&L here. matched = min(day buy qty, day sell qty); the leftover is delivery.
    const matched = Math.min(bq, sq);
    if (matched > 0) {
      const avgBuy   = bv / bq;
      const avgSell  = sv / sq;
      const realized = (avgSell - avgBuy) * matched;
      dayAgg[date].pnl += realized;
      if (isOpt) dayAgg[date].optPnl += realized;
      if (!symWL[sym]) symWL[sym] = { wins: 0, losses: 0 };   // this same-day round-trip is a win/loss for the symbol
      if (realized > 0) symWL[sym].wins++; else if (realized < 0) symWL[sym].losses++;
      // Same round-trip also counts toward that weekday's TRADE-level win rate (#11): a profitable
      // matched leg = 1 win, a losing one = 1 loss — independent of whether the whole day was net-positive.
      const dw = Number(r.dow);
      if (!dowWL[dw]) dowWL[dw] = { wins: 0, losses: 0 };
      if (realized > 0) dowWL[dw].wins++; else if (realized < 0) dowWL[dw].losses++;
      symPnl[sym] = (symPnl[sym] || 0) + realized;            // per-instrument same-day realized P&L
      if (ot === 'CE' || ot === 'PE') {                        // call/put realized P&L by month (options only)
        const mo = moLbl(date);
        if (!cpMonth[mo]) cpMonth[mo] = { month: mo, calls: 0, puts: 0 };
        if (ot === 'CE') cpMonth[mo].calls += realized; else cpMonth[mo].puts += realized;
      }
    }
  });
  // Per-instrument win rate = % of the instrument's closed days that were net-positive.
  // Null when the instrument never closed a position in the window (only buys) → renders "—".
  const symWinRate = (sym) => {
    const w = symWL[sym]; if (!w) return null;
    const tot = w.wins + w.losses;
    return tot > 0 ? Math.round((w.wins / tot) * 100) : null;
  };
  // ── Per-symbol realized P&L (SAME-DAY / MIS only) ──
  // pnl comes from symPnl (same-day matched legs summed per symbol); a symbol is "closed" only
  // if it had at least one same-day round-trip (symWL exists). Delivery-only symbols (bought and
  // sold on different days) carry pnl 0 and are not scored as wins/losses.
  const instruments = symRes.rows.map(r => {
    const sym = r.trading_symbol || '—';
    const w   = symWL[sym];
    return {
      instrument: sym,
      option_type: (r.option_type || '').toUpperCase(),
      trades: Number(r.trades) || 0,
      turnover: Number(r.turnover) || 0,
      lots: Number(r.lots) || 0,     // number of lots traded (Σ TradQty ÷ lot size)
      qty:  Number(r.qty)  || 0,     // total traded QUANTITY / units (Σ TradQty = Σ lots × lot size)
      pnl: r2(symPnl[sym] || 0),
      closed: !!w && (w.wins + w.losses) > 0,
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

  // Call vs Put realized P&L by month (options only) — most recent 6 months.
  const callputMonthly = Object.values(cpMonth).slice(-6).map(m => ({ month: m.month, calls: r2(m.calls), puts: r2(m.puts) }));
  const dayRows = Object.keys(dayAgg).sort().map(date => ({
    date, dow: dayAgg[date].dow, trades: dayAgg[date].trades, pnl: r2(dayAgg[date].pnl),
    optTrades: dayAgg[date].optTrades, optPnl: r2(dayAgg[date].optPnl),
    optLots: dayAgg[date].optLots, lots: dayAgg[date].lots,
    isExpiry: dayAgg[date].isExpiry,
  }));

  // ── Lot-sizing behaviour (day-level, real) ──
  // Position-level "after each trade" needs execution-time ordering (not stored for most
  // trades), so this measures the day AFTER a winning day vs AFTER a losing day, using the
  // real per-day lots restored from NewBrdLotQty. Null when there is no such prior day.
  const lsAfterWin = [], lsAfterLoss = [];
  for (let i = 1; i < dayRows.length; i++) {
    (dayRows[i - 1].pnl > 0 ? lsAfterWin : lsAfterLoss).push(dayRows[i]);
  }
  const _avgLots = (arr) => arr.length ? Number((arr.reduce((s, d) => s + d.lots, 0) / arr.length).toFixed(1)) : null;
  const _dayWr   = (arr) => { const c = arr.filter(d => d.pnl !== 0); return c.length ? Math.round(c.filter(d => d.pnl > 0).length / c.length * 100) : null; };
  const lotsAfterWin  = _avgLots(lsAfterWin);
  const lotsAfterLoss = _avgLots(lsAfterLoss);
  const wrAfterWin    = _dayWr(lsAfterWin);
  const wrAfterLoss   = _dayWr(lsAfterLoss);
  const lotSizing = [
    { label: 'After a win day',  lots: lotsAfterWin  != null ? lotsAfterWin  : 0 },
    { label: 'After a loss day', lots: lotsAfterLoss != null ? lotsAfterLoss : 0 },
  ];

  // Headline realized P&L = sum of the per-day running-book P&L, so the header Net P&L
  // reconciles with the cumulative-trend chart, calendar and expiry-week widgets (which
  // all use these same day-level figures). Previously the header summed per-instrument
  // window-aggregate P&L, giving a different total from the chart it sits above.
  const dailyNet = dayRows.reduce((s, d) => s + d.pnl, 0);
  // Longest run of consecutive winning trading days (was hardcoded null → shown as 0).
  let maxWinStreak = 0, _winRun = 0;
  dayRows.forEach(d => { if (d.pnl > 0) { _winRun++; if (_winRun > maxWinStreak) maxWinStreak = _winRun; } else _winRun = 0; });

  // Expiry day vs non-expiry (approximate — expiry inferred from the contract in the symbol name).
  const expDays  = dayRows.filter(d => d.isExpiry);
  const normDays = dayRows.filter(d => !d.isExpiry);
  // Options-only, since this panel lives on the Options-Insights tab: win rate and
  // trades/day are computed from each day's options P&L / options trade count only.
  const dayWr = (arr) => { const c = arr.filter(d => d.optPnl !== 0); return c.length ? Math.round(c.filter(d => d.optPnl > 0).length / c.length * 100) : null; };
  const avgTr = (arr) => arr.length ? Math.round(arr.reduce((s, d) => s + d.optTrades, 0) / arr.length) : null;
  // Average options lots/day (restored from NewBrdLotQty). null when no lot data on those days → "—".
  const avgLots = (arr) => { const c = arr.filter(d => d.optLots > 0); return c.length ? Math.round(c.reduce((s, d) => s + d.optLots, 0) / c.length) : null; };
  const expiryStats = {
    expiry_wr: dayWr(expDays),   normal_wr: dayWr(normDays),
    expiry_trades: avgTr(expDays), normal_trades: avgTr(normDays),
    expiry_lots: avgLots(expDays), normal_lots: avgLots(normDays),
  };
  let cum = 0;
  const pnlTrend = dayRows.map((d, i) => { cum += d.pnl; return { day: i + 1, pnl: r2(cum) }; });

  const weekMap = {};
  dayRows.forEach(d => { const dt = new Date(d.date); const w = `Wk${Math.ceil(dt.getUTCDate() / 7)} ${dt.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}`; weekMap[w] = (weekMap[w] || 0) + d.pnl; });
  const weeklyPnl = Object.entries(weekMap).slice(-8).map(([week, p]) => ({ week, pnl: r2(p) }));

  const moMap = {};
  dayRows.forEach(d => { const dt = new Date(d.date); const mo = dt.toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }); if (!moMap[mo]) moMap[mo] = { month: mo, gross_profit: 0, gross_loss: 0 }; if (d.pnl > 0) moMap[mo].gross_profit += d.pnl; else moMap[mo].gross_loss += d.pnl; });
  const monthlyPnl = Object.values(moMap).slice(-5).map(m => ({ month: m.month, gross_profit: r2(m.gross_profit), gross_loss: r2(m.gross_loss) }));

  const sortedDays = [...dayRows].sort((a, b) => b.pnl - a.pnl);
  const bestDays   = sortedDays.filter(d => d.pnl > 0).slice(0, 5).map(d => ({ date: d.date, pnl: d.pnl, trades: d.trades }));   // best days = profit days only
  const worstDays  = sortedDays.filter(d => d.pnl < 0).slice(-5).reverse().map(d => ({ date: d.date, pnl: d.pnl, trades: d.trades, note: 'Loss day' }));   // worst days = loss days only

  // ── Turnover / segment mix ──
  const optionsTO = Number(A.options_to) || 0;
  const eqCashTO  = Number(A.eq_cash_to) || 0;
  const eqFutTO   = Number(A.eq_fut_to)  || 0;
  const commTO    = Number(A.comm_to)    || 0;
  const totalTO   = Number(A.total_turnover) || 0;
  const seg = (name, v) => ({ name, value: totalTO > 0 ? Math.round((v / totalTO) * 100) : 0 });
  const segmentMix = [seg('Options', optionsTO), seg('Eq Cash', eqCashTO), seg('Eq F&O', eqFutTO), seg('Comm F&O', commTO)].filter(s => s.value > 0);
  // Segment awareness: the page is options-centric, so flag whether this client
  // actually traded options. When they didn't, options-only panels/labels/AI text
  // must NOT be shown (else they fabricate "100% Puts / bearish" from empty data).
  const hasOptions   = optionsTO > 0;
  const segments     = segmentMix.map(s => s.name);
  const segmentLabel = segments.join(', ') || 'No activity';

  // ── Call / Put ──
  const callTO = Number(A.call_to) || 0, putTO = Number(A.put_to) || 0;
  const callPct = (callTO + putTO) > 0 ? Math.round((callTO / (callTO + putTO)) * 100) : 0;

  // ── Instruments ranked by realized P&L / turnover ──
  const byPnl   = [...instruments].sort((a, b) => b.pnl - a.pnl);
  const top5    = byPnl.slice(0, 5);
  const worst5  = byPnl.filter(i => i.pnl < 0).slice(-5).reverse();
  const byTO    = [...instruments].sort((a, b) => b.turnover - a.turnover);
  // Options-only instrument set for the Options-Insights tab (win rate, most-traded, top table).
  // Previously these used ALL instruments, so futures/equity (e.g. GOLDPETAL FUT) appeared as "options".
  const optInstr   = instruments.filter(i => i.option_type === 'CE' || i.option_type === 'PE');
  const optClosed  = optInstr.filter(i => i.closed);
  const optWins    = optClosed.filter(i => i.pnl > 0).length;
  const optLosses  = optClosed.filter(i => i.pnl < 0).length;
  const optWinRate = (optWins + optLosses) > 0 ? Math.round(optWins / (optWins + optLosses) * 100) : 0;
  const optByTO    = [...optInstr].sort((a, b) => b.turnover - a.turnover);
  const bestStrike = optByTO[0]?.instrument || '—';
  // "Top instruments — options trading" (per the options-analytics spec): show only PROFITABLE
  // option contracts, ranked by Total P&L DESC, Top 5. Loss-making contracts are not "top
  // instruments" and are excluded (previously it sorted by |P&L|, so the biggest losses topped it).
  const optByPnl   = optInstr.filter(i => i.pnl > 0).sort((a, b) => b.pnl - a.pnl);

  const topInstrumentsOptions = optByPnl.slice(0, 5).map(r => ({
    instrument: r.instrument, trades: r.trades,
    lots: Math.round(qtyBySym[r.instrument] != null ? qtyBySym[r.instrument] : (r.qty || r.lots)) || 0,   // "Lots" column shows total traded QUANTITY (Σ lots × lot_size), live from trades
    win_rate: symWinRate(r.instrument), avg_pnl: r.trades > 0 ? r2(r.pnl / r.trades) : 0,
    total_pnl: r.pnl, bias: r.option_type === 'CE' ? 'Calls' : r.option_type === 'PE' ? 'Puts' : '—',
  }));
  // Best/Worst instrument cards: rank & show P&L on the SAME per-day realized basis as the win rate,
  // so Net P&L and Win Rate always agree (no more "+P&L with 0% wins"). Instruments that never closed
  // a position (only buys) have no realized P&L and are excluded from these cards.
  const realizedRanked = Object.keys(symPnl)
    .map(sym => {
      const inst = instruments.find(i => i.instrument === sym);
      return { instrument: sym, pnl: r2(symPnl[sym]), trades: inst ? inst.trades : 0 };
    })
    .sort((a, b) => b.pnl - a.pnl);
  const top5BW   = realizedRanked.filter(i => i.pnl > 0).slice(0, 5);   // best performers = profitable only
  const worst5BW = realizedRanked.filter(i => i.pnl < 0).slice(-5).reverse();
  const topInstrumentsBW   = top5BW.length ? top5BW.map(r => ({ instrument: r.instrument, pnl: r.pnl, win_rate: symWinRate(r.instrument), trades: r.trades }))
                                           : [{ instrument: 'No profitable instruments', pnl: 0, win_rate: null, trades: 0 }];
  const worstInstrumentsBW = worst5BW.length ? worst5BW.map(r => ({ instrument: r.instrument, pnl: r.pnl, win_rate: symWinRate(r.instrument), trades: r.trades }))
                                             : [{ instrument: 'No closed losing positions', pnl: 0, win_rate: null, trades: 0 }];

  // ── Day-of-week (real) ──
  const dowMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
  // avg_pnl stays per-day; win_rate is now TRADE-level = winning round-trips ÷ closed round-trips
  // on that weekday (#11), so e.g. a Monday with one profit and one loss reads 50%, not 100%.
  const dowStats = {};
  dayRows.forEach(d => { if (!dowMap[d.dow]) return; if (!dowStats[d.dow]) dowStats[d.dow] = { count: 0, pnl: 0 }; dowStats[d.dow].count++; dowStats[d.dow].pnl += d.pnl; });
  const dowData = [1, 2, 3, 4, 5].map(d => {
    const wl = dowWL[d]; const closedRt = wl ? wl.wins + wl.losses : 0;
    return {
      day: dowMap[d],
      win_rate: closedRt > 0 ? Math.round((wl.wins / closedRt) * 100) : 0,
      avg_pnl: dowStats[d] && dowStats[d].count ? r2(dowStats[d].pnl / dowStats[d].count) : 0,
    };
  });

  // ── Time-of-day activity (real execution time from trades.trans_time, "HH:MM:SS") ──
  // Reliable P&L-by-hour isn't derivable (needs cross-day matching), so we surface trade
  // ACTIVITY by market hour, which the execution time fully supports. Rows with no captured
  // time (older imports before the parser stored it) are simply excluded → empty until then.
  const todRes = await pool.query(`
    SELECT EXTRACT(HOUR FROM trans_time::time)::int AS hr,
           COUNT(*)::int AS trades,
           COALESCE(SUM(traded_value),0)::float AS turnover
    FROM trades
    WHERE ucc = $1
      AND trade_date >= CURRENT_DATE - ($2 * INTERVAL '1 day')
      AND trans_time ~ '^[0-9]{2}:[0-9]{2}'
    GROUP BY 1 ORDER BY 1
  `, [ucc, D]);
  const tod = todRes.rows.map(r => ({
    time: `${String(r.hr).padStart(2, '0')}:00`,
    trades: Number(r.trades),
    turnover: Number(r.turnover),
    avg_value: r.trades > 0 ? r2(Number(r.turnover) / Number(r.trades)) : 0,
  }));

  // ── P&L applicability ──
  // Trade Insights P&L (win rate, best/worst, patterns) is only meaningful for INTRADAY (MIS)
  // trading. A client with only CNC (delivery) trades and no MIS trades has no real intraday
  // P&L, so we flag pnl_applicable=false and the UI shows those panels as "Not applicable"
  // (keeping only trade-activity views: the trade calendar and time-of-day).
  const misTrades = Number(A.mis_trades) || 0;
  const pnlApplicable = misTrades > 0;

  // ── Calendar (anchored to the latest trade month so it maps to real trade days,
  //    not the current empty month) ──
  const lastTradeDate = dayRows.length ? new Date(dayRows[dayRows.length - 1].date + 'T00:00:00Z') : new Date();
  const year = lastTradeDate.getUTCFullYear(), month = lastTradeDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMo = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const tradesByDate = {}; dayRows.forEach(d => { tradesByDate[d.date] = d.trades; });
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const pnlByDate = {}; dayRows.forEach(d => { pnlByDate[d.date] = d.pnl; });
  const calDays = [];
  for (let i = 0; i < offset; i++) calDays.push({ date: '', type: 'empty', label: '' });
  for (let d = 1; d <= daysInMo; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const p = pnlByDate[ds];
    const traded = p !== undefined;
    calDays.push({ date: d, type: p === undefined ? 'flat' : p > 0 ? 'profit' : p < 0 ? 'loss' : 'flat',
      traded, trades: tradesByDate[ds] || 0,
      label: traded ? (p > 0 ? '+' : '') + r2(p).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'No trade' });
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
  const inr = (n) => '₹' + r2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', max_tokens: 220, temperature: 0.5,
      messages: [{ role: 'user', content:
        `Analyse this Indian retail trader's realized performance in 3 sentences with specific numbers, then one actionable tip.
Client: ${client.name} | Realized P&L: ${inr(dailyNet)} | Win rate: ${winRate}% (${wins}W/${losses}L closed positions)
Total trades: ${A.total_trades} over ${tradeDays} day(s) | Turnover: ${inr(totalTO)}
Segment mix by turnover: ${segmentLabel}${hasOptions ? ` | Call/Put: ${callPct}% calls` : ''}
Top instruments: ${topNames}.
Rules: Use ONLY the numbers above; do not invent any. This client's activity is ${segmentLabel}. ${hasOptions ? '' : 'Do NOT mention options, calls, puts, strikes, premiums or "put options" — there was zero options activity. Describe it as equity cash / delivery trading.'}` }],
    });
    aiInsights.summary = completion.choices[0]?.message?.content || '';
  } catch (e) {
    aiInsights.summary = `${client.name} traded ${A.total_trades} times across ${tradeDays} day(s), with realized P&L of ${inr(dailyNet)} and a ${winRate}% win rate on ${closed.length} closed position${closed.length === 1 ? '' : 's'}, mainly in ${topNames}. ${dailyNet >= 0 ? 'The book is net positive on closed trades.' : 'Closed trades are net negative — review entries on the losing instruments.'}`;
  }

  return {
    trade_days: tradeDays,
    client_name: client.name,
    ucc,
    has_options: hasOptions,
    segments,
    cnc_mis: {
      cnc: r2(Number(A.cnc) || 0), mis: r2(Number(A.mis) || 0), other: r2(Number(A.other) || 0),
      cnc_trades: Number(A.cnc_trades) || 0, mis_trades: Number(A.mis_trades) || 0,
    },
    period: { days: D, from_date: dayRows[0]?.date || null, to_date: dayRows[dayRows.length - 1]?.date || null, trade_days: tradeDays },
    summary: {
      net_pnl: r2(dailyNet),
      pnl_pct: totalTO > 0 ? parseFloat((dailyNet / totalTO * 100).toFixed(2)) : 0,
      win_rate: winRate, wins, losses,
      premium_to: r2(totalTO),
      lots: Math.round(totalLots),   // real number of lots (was total_qty, which is quantity not lots)
      trades: Number(A.total_trades) || 0,
      avg_win: r2(avgWin), avg_loss: r2(avgLoss),
      profit_factor: parseFloat(Number(profitFactor).toFixed(2)),
      best_day: bestDays[0]?.pnl || 0, worst_day: worstDays[0]?.pnl || 0,
      avg_trades_per_day: tradeDays > 0 ? Math.round((Number(A.total_trades) || 0) / tradeDays) : 0,
      max_win_streak: maxWinStreak,   // longest run of consecutive winning trading days
      pnl_trend: pnlTrend, weekly_pnl: weeklyPnl, segment_mix: segmentMix,
    },
    options_stats: {
      has_options: hasOptions,
      win_rate: hasOptions ? optWinRate : null, wins: hasOptions ? optWins : 0, losses: hasOptions ? optLosses : 0,
      call_pct: hasOptions ? callPct : null,
      best_strike: bestStrike, best_strike_wr: null, avg_hold_hrs: null,
      strike_table: [],          // ITM/ATM/OTM needs an underlying spot price — not in the feed
      callput_monthly: callputMonthly,   // realized call vs put P&L by month
      ...expiryStats,                     // expiry vs non-expiry win rate / trades-per-day (approximate)
      top_instruments: topInstrumentsOptions.length ? topInstrumentsOptions
        : [{ instrument: optInstr.length ? 'No profitable options in this period' : 'No options data', trades: 0, lots: 0, win_rate: null, avg_pnl: 0, total_pnl: 0, bias: '—' }],
    },
    patterns: {
      dow: dowData,
      tod,                       // trade activity by market hour (real execution time)
      lot_sizing: lotSizing,     // real day-level lots: after a winning day vs a losing day
      lots_after_win: lotsAfterWin, lots_after_loss: lotsAfterLoss, wr_after_win: wrAfterWin, wr_after_loss: wrAfterLoss, escalation: null,
      monthly_pnl: monthlyPnl,
    },
    best_worst: {
      top_instruments: topInstrumentsBW.length ? topInstrumentsBW : [{ instrument: '—', pnl: 0, win_rate: null, trades: 0 }],
      worst_instruments: worstInstrumentsBW,
      best_days: bestDays, worst_days: worstDays,
      mom: monthlyPnl.map(m => ({ month: m.month, net_pnl: m.gross_profit + m.gross_loss, win_rate: winRate })),
      scorecard,
    },
    calendar: { days: calDays, month_label: lastTradeDate.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
    pnl_applicable: pnlApplicable,   // false = CNC-only client → P&L panels shown as "Not applicable"
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