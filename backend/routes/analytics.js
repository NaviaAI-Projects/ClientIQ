// routes/analytics.js
// Supervisor analytics endpoints — all values computed from real data.
// Mounted at /api/analytics (see server.js).
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// ── REVENUE & FLOAT ─────────────────────────────────────────────
// Real streams available today: brokerage (daily_trades.brokerage_earned),
// MTF interest (mtf_monthly.interest_earned) and estimated float income
// (latest ledger balance × fd_rate ÷ 365). Turnover-by-segment is also
// returned for the monthly trend chart.
router.get('/revenue-float', auth, async (req, res) => {
  try {
    const fdRow  = await pool.query(
      `SELECT COALESCE(fd_rate, 6.5) AS fd_rate FROM pipeline_settings ORDER BY id LIMIT 1`
    );
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const rng = await resolveRange(req);

    const monthlyTrades = await pool.query(`
      SELECT to_char(trade_date,'YYYY-MM')                AS month,
             COALESCE(SUM(brokerage_earned),0)::float     AS brokerage,
             COALESCE(SUM(eq_cash_turnover),0)::float     AS eq_cash_to,
             COALESCE(SUM(eq_fo_turnover),0)::float       AS eq_fo_to,
             COALESCE(SUM(commodity_fo_turnover),0)::float AS comm_to,
             COALESCE(SUM(options_premium_turnover),0)::float AS opt_prem_to,
             COUNT(DISTINCT trade_date)::int              AS trade_days
      FROM daily_trades
      WHERE trade_date::date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 1
    `, [rng.from, rng.to]);

    const monthlyMtf = await pool.query(`
      SELECT month_year                            AS month,
             COALESCE(SUM(interest_earned),0)::float AS mtf_interest,
             COALESCE(SUM(avg_mtf_balance),0)::float AS mtf_balance,
             COUNT(DISTINCT ucc)::int              AS mtf_clients
      FROM mtf_monthly
      GROUP BY month_year
    `);
    const mtfByMonth = {};
    monthlyMtf.rows.forEach(r => { mtfByMonth[r.month] = r; });

    const floatSnap = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger)
      SELECT (SELECT d FROM latest)                           AS ledger_date,
             COALESCE(SUM(opening_balance),0)::float          AS total_ledger_balance,
             COUNT(*)::int                                    AS ledger_clients,
             COUNT(*) FILTER (WHERE opening_balance > 500000)::int AS clients_above_5l,
             COALESCE(AVG(opening_balance),0)::float          AS avg_balance
      FROM daily_ledger
      WHERE ledger_date = (SELECT d FROM latest)
    `);

    const top10 = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
           ranked AS (
             SELECT opening_balance
             FROM daily_ledger
             WHERE ledger_date = (SELECT d FROM latest)
             ORDER BY opening_balance DESC
             LIMIT 10)
      SELECT COALESCE(SUM(opening_balance),0)::float AS top10_balance FROM ranked
    `);

    const mtfLatest = await pool.query(`
      WITH latest AS (SELECT MAX(month_year) m FROM mtf_monthly)
      SELECT (SELECT m FROM latest)                    AS month,
             COALESCE(SUM(interest_earned),0)::float   AS interest,
             COALESCE(SUM(avg_mtf_balance),0)::float   AS balance,
             COUNT(DISTINCT ucc)::int                  AS clients
      FROM mtf_monthly
      WHERE month_year = (SELECT m FROM latest)
    `);

    const latestTradeDate = await pool.query(`SELECT MAX(trade_date) d FROM daily_trades`);

    // ── Footnote figures (computed from real data) ──
    // Thresholds (>₹2L balance, <5 trade days, ₹5L MTF benchmark) come straight
    // from the prototype's own sentences, so they are criteria, not demo data.
    const idleFloat = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
      bal AS (
        SELECT ucc, opening_balance FROM daily_ledger
        WHERE ledger_date = (SELECT d FROM latest) AND opening_balance > 200000
      ),
      td AS (
        SELECT ucc, COUNT(DISTINCT trade_date) days FROM daily_trades
        WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades))
        GROUP BY ucc
      )
      SELECT COUNT(*)::int AS n
      FROM bal LEFT JOIN td ON td.ucc = bal.ucc
      WHERE COALESCE(td.days, 0) < 5
    `);
    const mtfEligible = await pool.query(`
      WITH fo AS (
        SELECT DISTINCT ucc FROM daily_trades
        WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades))
          AND eq_fo_turnover > 0
      ),
      hold AS (
        SELECT ucc FROM holdings_summary
        WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
          AND total_holding_value > 200000
      ),
      using_mtf AS (
        SELECT DISTINCT ucc FROM mtf_monthly
        WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly)
      )
      SELECT COUNT(*)::int AS n
      FROM fo JOIN hold ON hold.ucc = fo.ucc
      WHERE fo.ucc NOT IN (SELECT ucc FROM using_mtf)
    `);
    const mtfRateRow = await pool.query(`
      SELECT AVG(NULLIF(interest_rate, 0))::float AS rate
      FROM mtf_monthly WHERE interest_rate IS NOT NULL
    `);

    const fb   = floatSnap.rows[0] || {};
    const fbTotal = Number(fb.total_ledger_balance || 0);
    const dailyFloatIncome = fbTotal * (fdRate / 100) / 365;
    const top10Balance = Number(top10.rows[0]?.top10_balance || 0);
    const ledgerMonth = fb.ledger_date ? ymOf(fb.ledger_date) : null;

    const monthly = monthlyTrades.rows.map(r => {
      const mtf = mtfByMonth[r.month];
      const floatIncomeDay = (r.month === ledgerMonth) ? dailyFloatIncome : null;
      return {
        month: r.month,
        brokerage: Number(r.brokerage),
        mtf_interest: mtf ? Number(mtf.mtf_interest) : 0,
        mtf_clients: mtf ? Number(mtf.mtf_clients) : 0,
        float_income_day: floatIncomeDay,
        eq_cash_to: Number(r.eq_cash_to),
        eq_fo_to: Number(r.eq_fo_to),
        comm_to: Number(r.comm_to),
        opt_prem_to: Number(r.opt_prem_to),
        trade_days: Number(r.trade_days),
      };
    });

    const latestMonth = monthly.length ? monthly[monthly.length - 1] : null;
    const mtdRevenue = latestMonth
      ? latestMonth.brokerage + latestMonth.mtf_interest +
        (latestMonth.float_income_day ? latestMonth.float_income_day * latestMonth.trade_days : 0)
      : 0;
    const ytdBrokerage = monthly.reduce((s, m) => s + m.brokerage, 0);
    const ytdMtf       = monthly.reduce((s, m) => s + m.mtf_interest, 0);

    res.json({
      meta: {
        latest_trade_date: latestTradeDate.rows[0]?.d || null,
        latest_ledger_date: fb.ledger_date || null,
        range: rangeMeta(rng),
        latest_mtf_month: mtfLatest.rows[0]?.month || null,
        fd_rate: fdRate,
        brokerage_loaded: ytdBrokerage > 0,
        float_history: false,
      },
      kpis: {
        mtd_revenue: mtdRevenue,
        ytd_revenue: ytdBrokerage + ytdMtf,
        float_book_total: fbTotal,
        float_daily_income: dailyFloatIncome,
        mtf_book_balance: Number(mtfLatest.rows[0]?.balance || 0),
        mtf_clients: Number(mtfLatest.rows[0]?.clients || 0),
        mtf_daily_interest: Number(mtfLatest.rows[0]?.interest || 0) / 30,
      },
      monthly,
      float_book: {
        ledger_date: fb.ledger_date || null,
        total_ledger_balance: fbTotal,
        ledger_clients: Number(fb.ledger_clients || 0),
        clients_above_5l: Number(fb.clients_above_5l || 0),
        avg_balance: Number(fb.avg_balance || 0),
        daily_income: dailyFloatIncome,
        top10_pct: fbTotal > 0 ? (top10Balance / fbTotal) * 100 : 0,
      },
      mtf_book: {
        month: mtfLatest.rows[0]?.month || null,
        balance: Number(mtfLatest.rows[0]?.balance || 0),
        interest: Number(mtfLatest.rows[0]?.interest || 0),
        clients: Number(mtfLatest.rows[0]?.clients || 0),
        avg_per_client: Number(mtfLatest.rows[0]?.clients || 0) > 0
          ? Number(mtfLatest.rows[0]?.balance || 0) / Number(mtfLatest.rows[0]?.clients || 0)
          : 0,
      },
      footnotes: {
        idle_float_clients: Number(idleFloat.rows[0]?.n || 0),
        mtf_eligible_not_using: Number(mtfEligible.rows[0]?.n || 0),
        avg_mtf_rate: mtfRateRow.rows[0]?.rate != null ? Number(mtfRateRow.rows[0].rate) : null,
      },
    });
  } catch (err) {
    console.error('REVENUE-FLOAT ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CONCENTRATION RISK ──────────────────────────────────────────
// Concentration of turnover (options premium), float (ledger balance) and
// MTF (interest) across the client base. Revenue concentration is measured on
// options-premium turnover because brokerage revenue is not yet loaded.
router.get('/concentration', auth, async (req, res) => {
  try {
    const pct = (a, b) => (Number(b) > 0 ? (Number(a) / Number(b)) * 100 : 0);

    const periodRow = await pool.query(`SELECT to_char(MAX(trade_date),'YYYY-MM') m, MAX(trade_date) d FROM daily_trades`);
    const fdRow = await pool.query(`SELECT COALESCE(fd_rate,6.5) AS fd_rate FROM pipeline_settings ORDER BY id LIMIT 1`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const rng = await resolveRange(req);

    // Per-client turnover + brokerage over the selected range, ranked; top 20 detail
    const perClient = await pool.query(`
      WITH mtd AS (
        SELECT ucc,
               SUM(options_premium_turnover) AS opt_to,
               SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover + options_premium_turnover) AS total_to,
               SUM(brokerage_earned) AS brokerage
        FROM daily_trades
        WHERE trade_date::date BETWEEN $1 AND $2
        GROUP BY ucc
      ),
      ranked AS (
        SELECT ucc, opt_to, total_to, brokerage,
               ROW_NUMBER() OVER (ORDER BY opt_to DESC) AS rn,
               SUM(opt_to) OVER () AS grand
        FROM mtd
      )
      SELECT r.rn, r.ucc, r.opt_to::float, r.total_to::float, r.brokerage::float, r.grand::float,
             (SUM(r.opt_to) OVER (ORDER BY r.rn) / NULLIF(r.grand,0) * 100)::float AS cum_pct,
             c.name, c.client_type, rm.rm_name, c.assigned_rm_id
      FROM ranked r
      LEFT JOIN clients c ON c.ucc = r.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE r.rn <= 20
      ORDER BY r.rn
    `, [rng.from, rng.to]);

    // Turnover concentration buckets (cumulative %)
    const turnoverBuckets = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(options_premium_turnover) AS opt_to
        FROM daily_trades
        WHERE trade_date::date BETWEEN $1 AND $2
        GROUP BY ucc
      ),
      ranked AS (SELECT opt_to, ROW_NUMBER() OVER (ORDER BY opt_to DESC) rn, SUM(opt_to) OVER () grand FROM mtd)
      SELECT MAX(grand)::float AS total, COUNT(*)::int AS client_count,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=10),0)::float  AS t10,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=25),0)::float  AS t25,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=50),0)::float  AS t50,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=100),0)::float AS t100,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=200),0)::float AS t200,
             COALESCE(SUM(opt_to) FILTER (WHERE rn<=500),0)::float AS t500
      FROM ranked
    `, [rng.from, rng.to]);
    const tb = turnoverBuckets.rows[0] || {};

    // Monthly concentration trend (top10 / top50 % of that month's options TO)
    const monthlyTrend = await pool.query(`
      WITH mm AS (
        SELECT to_char(trade_date,'YYYY-MM') AS mon, ucc, SUM(options_premium_turnover) AS opt_to
        FROM daily_trades GROUP BY 1,2
      ),
      rr AS (
        SELECT mon, opt_to, ROW_NUMBER() OVER (PARTITION BY mon ORDER BY opt_to DESC) rn,
               SUM(opt_to) OVER (PARTITION BY mon) grand
        FROM mm
      )
      SELECT mon,
             (COALESCE(SUM(opt_to) FILTER (WHERE rn<=10),0)/NULLIF(MAX(grand),0)*100)::float AS top10_pct,
             (COALESCE(SUM(opt_to) FILTER (WHERE rn<=50),0)/NULLIF(MAX(grand),0)*100)::float AS top50_pct
      FROM rr GROUP BY mon ORDER BY mon
    `);

    // Revenue-stream mix (doughnut) — real streams (options clearing unavailable → 0)
    const revMix = await pool.query(`
      WITH latestT AS (SELECT MAX(trade_date) d FROM daily_trades),
      brok AS (
        SELECT COALESCE(SUM(brokerage_earned),0)::float AS v, COUNT(DISTINCT trade_date)::int AS days
        FROM daily_trades WHERE trade_date >= date_trunc('month',(SELECT d FROM latestT))
      ),
      fl AS (
        SELECT COALESCE(SUM(opening_balance),0)::float AS bal FROM daily_ledger
        WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)
      ),
      mtf AS (
        SELECT COALESCE(SUM(interest_earned),0)::float AS v FROM mtf_monthly
        WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly)
      )
      SELECT (SELECT v FROM brok) AS brokerage, (SELECT days FROM brok) AS days,
             (SELECT bal FROM fl) AS ledger_bal, (SELECT v FROM mtf) AS mtf_interest
    `);
    const rm = revMix.rows[0] || {};
    const floatMonthIncome = Number(rm.ledger_bal || 0) * (fdRate / 100) / 365 * Number(rm.days || 0);

    // Float concentration — top 20 + buckets + trading-activity flag
    const floatTop = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
      traded AS (
        SELECT DISTINCT ucc FROM daily_trades
        WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades))
      ),
      base AS (
        SELECT ucc, opening_balance,
               ROW_NUMBER() OVER (ORDER BY opening_balance DESC) rn,
               SUM(opening_balance) OVER () grand
        FROM daily_ledger WHERE ledger_date = (SELECT d FROM latest)
      )
      SELECT b.rn, b.ucc, b.opening_balance::float, b.grand::float,
             (SUM(b.opening_balance) OVER (ORDER BY b.rn)/NULLIF(b.grand,0)*100)::float AS cum_pct,
             c.name, c.client_type,
             (t.ucc IS NOT NULL) AS traded_this_month
      FROM base b
      LEFT JOIN clients c ON c.ucc = b.ucc
      LEFT JOIN traded t ON t.ucc = b.ucc
      WHERE b.rn <= 20 ORDER BY b.rn
    `);
    const floatBuckets = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
      base AS (
        SELECT opening_balance, ROW_NUMBER() OVER (ORDER BY opening_balance DESC) rn,
               SUM(opening_balance) OVER () grand
        FROM daily_ledger WHERE ledger_date = (SELECT d FROM latest)
      )
      SELECT MAX(grand)::float AS total,
             COALESCE(SUM(opening_balance) FILTER (WHERE rn<=10),0)::float  AS t10,
             COALESCE(SUM(opening_balance) FILTER (WHERE rn<=25),0)::float  AS t25,
             COALESCE(SUM(opening_balance) FILTER (WHERE rn<=50),0)::float  AS t50,
             COALESCE(SUM(opening_balance) FILTER (WHERE rn<=100),0)::float AS t100,
             COALESCE(SUM(opening_balance) FILTER (WHERE rn<=200),0)::float AS t200
      FROM base
    `);
    const fbk = floatBuckets.rows[0] || {};

    // MTF concentration — top 10 + top5 share + book total
    const mtfTop = await pool.query(`
      WITH latest AS (SELECT MAX(month_year) m FROM mtf_monthly),
      base AS (
        SELECT ucc, SUM(interest_earned) AS interest, SUM(avg_mtf_balance) AS bal
        FROM mtf_monthly WHERE month_year = (SELECT m FROM latest) GROUP BY ucc
      ),
      ranked AS (
        SELECT ucc, interest, bal, ROW_NUMBER() OVER (ORDER BY interest DESC) rn,
               SUM(interest) OVER () grand
        FROM base
      )
      SELECT r.rn, r.ucc, r.interest::float, r.bal::float, r.grand::float, c.name
      FROM ranked r LEFT JOIN clients c ON c.ucc = r.ucc
      WHERE r.rn <= 10 ORDER BY r.rn
    `);
    const mtfAgg = await pool.query(`
      WITH latest AS (SELECT MAX(month_year) m FROM mtf_monthly),
      base AS (
        SELECT SUM(interest_earned) AS interest,
               ROW_NUMBER() OVER (ORDER BY SUM(interest_earned) DESC) rn,
               SUM(SUM(interest_earned)) OVER () grand
        FROM mtf_monthly WHERE month_year = (SELECT m FROM latest) GROUP BY ucc
      )
      SELECT MAX(grand)::float AS total,
             COALESCE(SUM(interest) FILTER (WHERE rn<=5),0)::float AS top5
      FROM base
    `);
    const ma = mtfAgg.rows[0] || {};
    const turnoverTotal = Number(tb.total || 0);
    const floatTotal = Number(fbk.total || 0);
    const mtfTotal = Number(ma.total || 0);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => { const [y, mo] = m.split('-'); return `${MON[+mo - 1]} '${y.slice(2)}`; };

    res.json({
      meta: { period_month: periodRow.rows[0]?.m || null, basis: 'options_premium_turnover', brokerage_loaded: false, as_of: fmtFullDate(periodRow.rows[0]?.d), range: rangeMeta(rng) },
      kpis: {
        top10_turnover_pct: pct(tb.t10, turnoverTotal),
        top50_turnover_pct: pct(tb.t50, turnoverTotal),
        top10_float_pct:    pct(fbk.t10, floatTotal),
        top5_mtf_pct:       pct(ma.top5, mtfTotal),
        client_count:       Number(tb.client_count || 0),
      },
      totals: {
        turnover_total: turnoverTotal,
        top10_turnover_amt: Number(tb.t10 || 0),
        top50_turnover_amt: Number(tb.t50 || 0),
        float_total: floatTotal,
        top10_float_amt: Number(fbk.t10 || 0),
        mtf_total: mtfTotal,
        top5_mtf_amt: Number(ma.top5 || 0),
      },
      rev_buckets: [
        { label: 'Top 10',  cum_pct: pct(tb.t10, turnoverTotal) },
        { label: 'Top 25',  cum_pct: pct(tb.t25, turnoverTotal) },
        { label: 'Top 50',  cum_pct: pct(tb.t50, turnoverTotal) },
        { label: 'Top 100', cum_pct: pct(tb.t100, turnoverTotal) },
        { label: 'Top 200', cum_pct: pct(tb.t200, turnoverTotal) },
        { label: 'Top 500', cum_pct: pct(tb.t500, turnoverTotal) },
        { label: 'Rest',    cum_pct: turnoverTotal > 0 ? 100 : 0 },
      ],
      float_buckets: [
        { label: 'Top 10',  cum_pct: pct(fbk.t10, floatTotal) },
        { label: 'Top 25',  cum_pct: pct(fbk.t25, floatTotal) },
        { label: 'Top 50',  cum_pct: pct(fbk.t50, floatTotal) },
        { label: 'Top 100', cum_pct: pct(fbk.t100, floatTotal) },
        { label: 'Top 200', cum_pct: pct(fbk.t200, floatTotal) },
        { label: 'Rest',    cum_pct: floatTotal > 0 ? 100 : 0 },
      ],
      monthly_trend: monthlyTrend.rows.map(r => ({
        month: mLabel(r.mon),
        top10_pct: Number(r.top10_pct) || 0,
        top50_pct: Number(r.top50_pct) || 0,
      })),
      segment_mix: [
        { name: 'Eq Options clearing', value: 0 },
        { name: 'Equity brokerage',    value: Number(rm.brokerage || 0) },
        { name: 'Float income',        value: floatMonthIncome },
        { name: 'MTF interest',        value: Number(rm.mtf_interest || 0) },
      ],
      top_clients: perClient.rows.map(r => ({
        rank: Number(r.rn), ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type || 'RI',
        opt_to: Number(r.opt_to), total_to: Number(r.total_to), brokerage: Number(r.brokerage),
        pct_of_total: pct(r.opt_to, turnoverTotal), cum_pct: Number(r.cum_pct),
        rm_name: r.rm_name || '—', unmapped: !r.assigned_rm_id,
      })),
      float_top: floatTop.rows.map(r => ({
        rank: Number(r.rn), ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type || 'RI',
        balance: Number(r.opening_balance), pct_of_total: pct(r.opening_balance, floatTotal),
        cum_pct: Number(r.cum_pct), traded_this_month: !!r.traded_this_month,
      })),
      mtf_top: mtfTop.rows.map(r => ({
        rank: Number(r.rn), ucc: r.ucc, name: r.name || r.ucc,
        interest: Number(r.interest), balance: Number(r.bal), pct_of_book: pct(r.interest, mtfTotal),
      })),
    });
  } catch (err) {
    console.error('CONCENTRATION ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── OPTIONS ANALYTICS ───────────────────────────────────────────
// Built from the raw `trades` table (option_type/strike/expiry detail).
// Eq options = NFO/BFO OPTIDX/OPTSTK; Comm options = MCX/NCDEX OPTFUT/OPTIDX/OPTSTK.
// Expiry day = a trade day on which options expiring that same day traded.
router.get('/options', auth, async (req, res) => {
  try {
    const EQ   = `exchange IN ('NFO','BFO') AND instrument_name IN ('OPTIDX','OPTSTK')`;
    const COMM = `exchange IN ('MCX','NCDEX') AND instrument_name IN ('OPTFUT','OPTIDX','OPTSTK')`;

    const rng = await resolveRange(req, 'trades');

    const eqDaily = await pool.query(`
      SELECT trade_date AS d,
             SUM(traded_value)::float          AS eq_opt_to,
             COUNT(DISTINCT ucc)::int          AS clients,
             BOOL_OR(expiry_date = trade_date) AS is_expiry,
             SUM(trade_qty)::float             AS qty
      FROM trades WHERE ${EQ} AND trade_date::date BETWEEN $1 AND $2
      GROUP BY trade_date ORDER BY trade_date
    `, [rng.from, rng.to]);
    const commDaily = await pool.query(`
      SELECT trade_date AS d,
             SUM(traded_value)::float AS comm_opt_to,
             COUNT(DISTINCT ucc)::int AS clients
      FROM trades WHERE ${COMM} AND trade_date::date BETWEEN $1 AND $2
      GROUP BY trade_date ORDER BY trade_date
    `, [rng.from, rng.to]);
    const topClients = await pool.query(`
      WITH eqopt AS (
        SELECT ucc, traded_value, trade_qty FROM trades
        WHERE ${EQ} AND trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM trades))
      )
      SELECT e.ucc, SUM(e.traded_value)::float AS eq_opt_to, SUM(e.trade_qty)::float AS lots,
             c.name, c.client_type, rm.rm_name
      FROM eqopt e
      LEFT JOIN clients c ON c.ucc = e.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      GROUP BY e.ucc, c.name, c.client_type, rm.rm_name
      ORDER BY eq_opt_to DESC LIMIT 10
    `);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const ym = ymOf;
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;
    const dLabel = (d) => { const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`; };

    const eqRows = eqDaily.rows.map(r => ({
      d: r.d, to: Number(r.eq_opt_to), clients: Number(r.clients), is_expiry: !!r.is_expiry, qty: Number(r.qty),
    }));
    const commByDate = {};
    commDaily.rows.forEach(r => { commByDate[String(r.d)] = { to: Number(r.comm_opt_to), clients: Number(r.clients) }; });

    // Overall averages (for expiry premium + vs-MTD comparisons)
    const nDays   = eqRows.length || 1;
    const avgTo   = eqRows.reduce((s, r) => s + r.to, 0) / nDays;
    const avgCli  = eqRows.reduce((s, r) => s + r.clients, 0) / nDays;
    const expDays = eqRows.filter(r => r.is_expiry);
    const nonExp  = eqRows.filter(r => !r.is_expiry);
    const mean    = (arr, f) => arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0;
    const expiryPremiumPct = nonExp.length && mean(nonExp, r => r.to) > 0
      ? (mean(expDays, r => r.to) - mean(nonExp, r => r.to)) / mean(nonExp, r => r.to) * 100 : 0;

    // Monthly aggregation
    const months = {};
    eqRows.forEach(r => {
      const k = ym(r.d);
      (months[k] = months[k] || { eq_to: 0, eq_days: 0, eq_cli: 0, comm_to: 0, comm_days: 0, comm_cli: 0 });
      months[k].eq_to += r.to; months[k].eq_days += 1; months[k].eq_cli += r.clients;
    });
    commDaily.rows.forEach(r => {
      const k = ym(r.d);
      (months[k] = months[k] || { eq_to: 0, eq_days: 0, eq_cli: 0, comm_to: 0, comm_days: 0, comm_cli: 0 });
      months[k].comm_to += Number(r.comm_opt_to); months[k].comm_days += 1; months[k].comm_cli += Number(r.clients);
    });
    const monthKeys = Object.keys(months).sort();
    const monthly = monthKeys.map((k, i) => {
      const m = months[k];
      const eqPerDay = m.eq_days ? m.eq_to / m.eq_days : 0;
      const prev = i > 0 ? months[monthKeys[i - 1]] : null;
      const prevPerDay = prev && prev.eq_days ? prev.eq_to / prev.eq_days : null;
      return {
        month: mLabel(k),
        eq_opt_to_cr: +(eqPerDay / 1e7).toFixed(2),
        eq_opt_clients: m.eq_days ? Math.round(m.eq_cli / m.eq_days) : 0,
        comm_opt_to_cr: +((m.comm_days ? m.comm_to / m.comm_days : 0) / 1e7).toFixed(2),
        comm_opt_clients: m.comm_days ? Math.round(m.comm_cli / m.comm_days) : 0,
        mom_pct: prevPerDay ? +(((eqPerDay - prevPerDay) / prevPerDay) * 100).toFixed(1) : null,
      };
    });

    // KPIs — latest vs prior month
    const lm = monthKeys[monthKeys.length - 1];
    const pm = monthKeys[monthKeys.length - 2];
    const perDayEq   = (k) => k && months[k].eq_days ? months[k].eq_to / months[k].eq_days / 1e7 : 0;
    const perDayComm = (k) => k && months[k].comm_days ? months[k].comm_to / months[k].comm_days / 1e7 : 0;
    const cliEq      = (k) => k && months[k].eq_days ? Math.round(months[k].eq_cli / months[k].eq_days) : 0;
    const momPct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);

    // Expiry-day analysis — monthly expiry = last expiry date in its month
    const expByMonth = {};
    expDays.forEach(r => { const k = ym(r.d); if (!expByMonth[k] || r.d > expByMonth[k]) expByMonth[k] = r.d; });
    const expiry_analysis = expDays.map(r => ({
      date: dLabel(r.d),
      type: String(r.d) === String(expByMonth[ym(r.d)]) ? 'Monthly' : 'Weekly',
      eq_opt_to_cr: +(r.to / 1e7).toFixed(1),
      vs_mtd_pct: avgTo > 0 ? +(((r.to - avgTo) / avgTo) * 100).toFixed(0) : 0,
      clients: r.clients,
      clients_vs_mtd_pct: avgCli > 0 ? +(((r.clients - avgCli) / avgCli) * 100).toFixed(0) : 0,
    }));

    res.json({
      meta: {
        trade_days: eqRows.length,
        expiry_days: expDays.length,
        latest_month: lm ? mLabel(lm) : null,
        prior_month: pm ? mLabel(pm) : null,
        as_of: fmtFullDate(eqRows.length ? eqRows[eqRows.length - 1].d : null),
        range: rangeMeta(rng, eqRows.length),
      },
      kpis: {
        eq_opt_avg_daily_cr: +perDayEq(lm).toFixed(1),
        eq_opt_mom_pct: momPct(perDayEq(lm), perDayEq(pm)),
        eq_opt_prev_cr: +perDayEq(pm).toFixed(1),
        eq_opt_clients_avg: cliEq(lm),
        eq_opt_clients_prev: cliEq(pm),
        eq_opt_clients_mom_pct: momPct(cliEq(lm), cliEq(pm)),
        expiry_premium_pct: +expiryPremiumPct.toFixed(0),
        comm_opt_avg_daily_cr: +perDayComm(lm).toFixed(1),
        comm_opt_prev_cr: +perDayComm(pm).toFixed(1),
        comm_opt_mom_pct: momPct(perDayComm(lm), perDayComm(pm)),
      },
      daily: eqRows.map(r => ({
        date: dLabel(r.d),
        eq_opt_to_cr: +(r.to / 1e7).toFixed(2),
        clients: r.clients,
        is_expiry: r.is_expiry,
        mtd_avg_cr: +(avgTo / 1e7).toFixed(2),
      })),
      monthly,
      expiry_analysis,
      top_clients: topClients.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type || 'RI',
        eq_opt_to: Number(r.eq_opt_to), lots: Number(r.lots), rm_name: r.rm_name || '—',
      })),
    });
  } catch (err) {
    console.error('OPTIONS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── NEW BUSINESS ────────────────────────────────────────────────
// Acquisition (new accounts, trading, ledger) from clients.account_open_date.
// Segment breakdown (5-way) from the raw `trades` table.
router.get('/new-business', auth, async (req, res) => {
  try {
    const rng = await resolveRange(req, 'clients', 'account_open_date');
    const acq = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
      led AS (SELECT ucc, opening_balance FROM daily_ledger WHERE ledger_date = (SELECT d FROM latest)),
      traded AS (SELECT DISTINCT ucc FROM daily_trades)
      SELECT to_char(c.account_open_date,'YYYY-MM')       AS mon,
             COUNT(*)::int                                AS new_accounts,
             COUNT(*) FILTER (WHERE t.ucc IS NOT NULL)::int AS trading,
             COALESCE(SUM(led.opening_balance),0)::float   AS ledger_bal
      FROM clients c
      LEFT JOIN traded t ON t.ucc = c.ucc
      LEFT JOIN led     ON led.ucc = c.ucc
      WHERE c.account_open_date IS NOT NULL AND c.account_open_date::date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 1 DESC LIMIT 15
    `, [rng.from, rng.to]);
    const maxOpenRow = await pool.query(`SELECT MAX(account_open_date) d FROM clients`);
    const SEGCASE = `CASE
      WHEN exchange IN ('NFO','BFO') AND instrument_name IN ('OPTIDX','OPTSTK') THEN 'Equity Options'
      WHEN exchange IN ('NFO','BFO') AND instrument_name IN ('FUTIDX','FUTSTK') THEN 'Equity Futures'
      WHEN exchange IN ('MCX','NCDEX') AND instrument_name IN ('OPTFUT','OPTIDX','OPTSTK') THEN 'Commodity Options'
      WHEN exchange IN ('MCX','NCDEX') THEN 'Commodity Futures'
      WHEN exchange IN ('NSE','BSE') THEN 'Equity Cash'
      ELSE 'Other' END`;
    const seg = await pool.query(`
      WITH s AS (
        SELECT to_char(trade_date,'YYYY-MM') AS mon, ucc, trade_date, traded_value, ${SEGCASE} AS segment
        FROM trades
      )
      SELECT mon, segment, COUNT(DISTINCT ucc)::int AS clients,
             COUNT(DISTINCT trade_date)::int AS days, SUM(traded_value)::float AS turnover
      FROM s WHERE segment <> 'Other'
      GROUP BY mon, segment ORDER BY mon, segment
    `);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;

    const rowsAsc = acq.rows.slice().reverse().map(r => ({
      key: r.mon, label: mLabel(r.mon),
      new_accounts: Number(r.new_accounts), trading: Number(r.trading), ledger_bal: Number(r.ledger_bal),
    }));

    // Featured = latest complete month (if the newest month is mid-month, use the prior one)
    const maxOpen = maxOpenRow.rows[0]?.d ? new Date(maxOpenRow.rows[0].d) : null;
    const newestKey = rowsAsc.length ? rowsAsc[rowsAsc.length - 1].key : null;
    const partial = maxOpen && newestKey === ymOf(maxOpenRow.rows[0].d) && maxOpen.getUTCDate() < 28;
    const featIdx = partial ? rowsAsc.length - 2 : rowsAsc.length - 1;
    const featured = rowsAsc[featIdx] || null;
    const prior = rowsAsc[featIdx - 1] || null;

    const segMonths = [...new Set(seg.rows.map(r => r.mon))].sort();

    // New-client segment distribution for the featured opening month
    let newClientSeg = [];
    if (featured) {
      const nq = await pool.query(`
        WITH newc AS (SELECT ucc FROM clients WHERE to_char(account_open_date,'YYYY-MM') = $1),
        s AS (
          SELECT t.ucc, t.trade_date, t.traded_value, ${SEGCASE} AS segment
          FROM trades t JOIN newc n ON n.ucc = t.ucc
        )
        SELECT segment, COUNT(DISTINCT ucc)::int AS clients,
               COUNT(DISTINCT trade_date)::int AS days, SUM(traded_value)::float AS turnover
        FROM s WHERE segment <> 'Other' GROUP BY segment
      `, [featured.key]);
      newClientSeg = nq.rows.map(r => ({
        segment: r.segment, clients: Number(r.clients),
        vol_cr_day: Number(r.days) ? +(Number(r.turnover) / Number(r.days) / 1e7).toFixed(2) : 0,
      }));
    }

    res.json({
      new_client_segments: newClientSeg,
      meta: {
        featured_month: featured ? featured.label : null,
        prior_month: prior ? prior.label : null,
        featured_partial: !!partial,
        as_of: fmtFullDate(maxOpenRow.rows[0]?.d),
        range: rangeMeta(rng),
        seg_months: segMonths.map(mLabel),
        seg_months_keys: segMonths,
        segment_coverage_days: [...new Set(seg.rows.map(r => r.mon))].length,
      },
      featured: featured ? {
        new_accounts: featured.new_accounts,
        prior_new_accounts: prior ? prior.new_accounts : null,
        trading: featured.trading,
        trading_pct: featured.new_accounts ? (featured.trading / featured.new_accounts) * 100 : 0,
        ledger_bal: featured.ledger_bal,
      } : null,
      acquisition: rowsAsc,
      segments: seg.rows.map(r => ({
        mon: mLabel(r.mon), key: r.mon, segment: r.segment,
        clients: Number(r.clients), days: Number(r.days), turnover: Number(r.turnover),
        vol_cr_day: Number(r.days) ? +(Number(r.turnover) / Number(r.days) / 1e7).toFixed(2) : 0,
      })),
    });
  } catch (err) {
    console.error('NEW-BUSINESS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── INACTIVE ACCOUNTS & DP HOLDINGS ─────────────────────────────
// Inactive = no trade in last 30 days (or never traded). DP holdings from the
// latest holdings_summary snapshot. Per-security stock counts are not stored.
router.get('/inactive', auth, async (req, res) => {
  try {
    const HOLD = `SELECT ucc, total_holding_value FROM holdings_summary
                  WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
                    AND total_holding_value > 0`;

    const summary = await pool.query(`
      WITH h AS (${HOLD})
      SELECT
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30)::int AS inactive_total,
        COUNT(*) FILTER (WHERE (c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30) AND h.ucc IS NOT NULL)::int AS inactive_with_dp,
        COALESCE(SUM(h.total_holding_value) FILTER (WHERE (c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30) AND h.ucc IS NOT NULL),0)::float AS inactive_dp_value,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL)::int AS never_traded,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL AND h.ucc IS NOT NULL)::int AS never_with_dp,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL AND c.account_open_date > CURRENT_DATE - 90)::int AS never_recent
      FROM clients c LEFT JOIN h ON h.ucc = c.ucc
    `);

    const bands = await pool.query(`
      WITH h AS (${HOLD}),
      b AS (
        SELECT
          CASE WHEN c.last_trade_date IS NULL                        THEN 'Never traded'
               WHEN c.last_trade_date >= CURRENT_DATE - 90           THEN '30–90 days'
               WHEN c.last_trade_date >= CURRENT_DATE - 180          THEN '90–180 days'
               WHEN c.last_trade_date >= CURRENT_DATE - 365          THEN '180–365 days'
               ELSE '365+ days' END AS band,
          (h.ucc IS NOT NULL) AS has_dp
        FROM clients c LEFT JOIN h ON h.ucc = c.ucc
        WHERE c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30
      )
      SELECT band, COUNT(*) FILTER (WHERE has_dp)::int AS with_dp,
             COUNT(*) FILTER (WHERE NOT has_dp)::int AS no_dp
      FROM b GROUP BY band
    `);

    const byType = await pool.query(`
      WITH h AS (${HOLD})
      SELECT COALESCE(c.client_type,'RI') AS client_type, COUNT(*)::int AS n
      FROM clients c JOIN h ON h.ucc = c.ucc
      WHERE c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30
      GROUP BY 1 ORDER BY n DESC
    `);

    const valueDist = await pool.query(`
      WITH h AS (${HOLD}),
      inact AS (
        SELECT h.total_holding_value AS v
        FROM clients c JOIN h ON h.ucc = c.ucc
        WHERE c.last_trade_date IS NULL OR c.last_trade_date < CURRENT_DATE - 30
      )
      SELECT
        COUNT(*) FILTER (WHERE v < 50000)::int                      AS b1,
        COUNT(*) FILTER (WHERE v >= 50000 AND v < 200000)::int      AS b2,
        COUNT(*) FILTER (WHERE v >= 200000 AND v < 500000)::int     AS b3,
        COUNT(*) FILTER (WHERE v >= 500000 AND v < 1000000)::int    AS b4,
        COUNT(*) FILTER (WHERE v >= 1000000 AND v < 2500000)::int   AS b5,
        COUNT(*) FILTER (WHERE v >= 2500000)::int                   AS b6
      FROM inact
    `);

    const priority = await pool.query(`
      WITH h AS (${HOLD})
      SELECT c.ucc, c.name, COALESCE(c.client_type,'RI') AS client_type,
             c.last_trade_date, h.total_holding_value::float AS holding_value,
             c.account_open_date, rm.rm_name,
             (CURRENT_DATE - c.last_trade_date) AS days_inactive
      FROM clients c
      JOIN h ON h.ucc = c.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.last_trade_date IS NOT NULL AND c.last_trade_date < CURRENT_DATE - 30
      ORDER BY h.total_holding_value DESC
      LIMIT 100
    `);

    const s = summary.rows[0] || {};
    const bandOrder = ['30–90 days', '90–180 days', '180–365 days', '365+ days', 'Never traded'];
    const bandMap = {}; bands.rows.forEach(r => { bandMap[r.band] = r; });
    const vd = valueDist.rows[0] || {};

    const asOfIn = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM daily_trades`);
    res.json({
      meta: { basis: 'no trade in last 30 days', as_of: asOfIn.rows[0]?.a || null },
      summary: {
        inactive_total: Number(s.inactive_total || 0),
        inactive_with_dp: Number(s.inactive_with_dp || 0),
        inactive_dp_value: Number(s.inactive_dp_value || 0),
        inactive_dp_avg: Number(s.inactive_with_dp || 0) > 0 ? Number(s.inactive_dp_value || 0) / Number(s.inactive_with_dp) : 0,
        never_traded: Number(s.never_traded || 0),
        never_with_dp: Number(s.never_with_dp || 0),
        never_recent: Number(s.never_recent || 0),
      },
      bands: bandOrder.map(b => ({ band: b, with_dp: Number(bandMap[b]?.with_dp || 0), no_dp: Number(bandMap[b]?.no_dp || 0) })),
      by_type: byType.rows.map(r => ({ client_type: r.client_type, count: Number(r.n) })),
      value_dist: [
        { bucket: '<₹50K', count: Number(vd.b1 || 0) },
        { bucket: '₹50K–₹2L', count: Number(vd.b2 || 0) },
        { bucket: '₹2L–₹5L', count: Number(vd.b3 || 0) },
        { bucket: '₹5L–₹10L', count: Number(vd.b4 || 0) },
        { bucket: '₹10L–₹25L', count: Number(vd.b5 || 0) },
        { bucket: '>₹25L', count: Number(vd.b6 || 0) },
      ],
      priority: priority.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type,
        last_trade: r.last_trade_date, days_inactive: r.days_inactive != null ? Number(r.days_inactive) : null,
        holding_value: Number(r.holding_value), account_open_date: r.account_open_date,
        rm_name: r.rm_name || '—',
      })),
    });
  } catch (err) {
    console.error('INACTIVE ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── UNMAPPED CLIENT POOL ────────────────────────────────────────
router.get('/unmapped-pool', auth, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const term   = search ? '%' + search + '%' : null;   // UCC / name search across the whole pool
    const cards = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned' AND lead_score > 80)::int                         AS score_gt80,
        (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned' AND lead_score >= 60 AND lead_score <= 80)::int    AS score_60_80,
        (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned' AND lead_score >= 60)::int                         AS score_gt60,
        (SELECT COUNT(*) FROM lead_pool WHERE status IN ('assigned','pending','opted_in'))::int                      AS in_pipeline,
        (SELECT COALESCE(SUM(capacity),0) FROM rm_master)::int
          - (SELECT COUNT(*) FROM clients WHERE assigned_rm_id IS NOT NULL)::int                                     AS capacity_available,
        COALESCE((SELECT rm_capacity_limit FROM pipeline_settings ORDER BY id LIMIT 1), 100)::int                    AS capacity_limit,
        (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned')::int                                              AS pool_total
    `);

    const rows = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover + options_premium_turnover) AS to_mtd
        FROM daily_trades WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades))
        GROUP BY ucc
      ),
      hold AS (
        SELECT ucc, total_holding_value FROM holdings_summary
        WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
      )
      SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name,
             COALESCE(c.client_type,'RI') AS client_type, COALESCE(c.plan,'zero-brokerage') AS plan,
             lp.lead_score::float AS lead_score, lp.churn_risk_score::float AS churn, lp.lead_type, lp.priority,
             COALESCE(mtd.to_mtd,0)::float AS mtd_to, COALESCE(hold.total_holding_value,0)::float AS holdings,
             c.last_trade_date
      FROM lead_pool lp
      LEFT JOIN clients c ON c.ucc = lp.ucc
      LEFT JOIN mtd ON mtd.ucc = lp.ucc
      LEFT JOIN hold ON hold.ucc = lp.ucc
      WHERE lp.status = 'unassigned'
        AND ($1::text IS NULL OR lp.ucc ILIKE $1 OR COALESCE(lp.client_name, c.name) ILIKE $1)
      ORDER BY lp.lead_score DESC NULLS LAST
      LIMIT 50
    `, [term]);

    const signalsOf = (r) => {
      const s = [];
      if (r.lead_type) s.push(r.lead_type);
      if (Number(r.holdings) > 1000000) s.push('High holdings');
      if (Number(r.mtd_to) > 5000000) s.push('High TO');
      if (Number(r.churn) >= 60) s.push('Dormancy risk');
      if (r.priority && r.priority.toLowerCase() === 'high') s.push('High priority');
      return s.slice(0, 3).join(', ') || '—';
    };

    res.json({
      cards: cards.rows[0],
      clients: rows.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, plan: r.plan,
        lead_score: r.lead_score != null ? Math.round(r.lead_score) : null,
        signals: signalsOf(r), mtd_to: Number(r.mtd_to), holdings: Number(r.holdings),
        last_trade: r.last_trade_date,
      })),
    });
  } catch (err) {
    console.error('UNMAPPED-POOL ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── UNMAP REQUESTS ──────────────────────────────────────────────
router.get('/unmap-requests', auth, async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT ur.id, ur.ucc, ur.type, ur.reason, ur.mapped_since, ur.status, ur.requested_by,
             COALESCE(c.name, ur.ucc) AS name, rm.rm_name, u.name AS requested_by_name
      FROM unmap_requests ur
      LEFT JOIN clients c ON c.ucc = ur.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      LEFT JOIN users u ON u.id = ur.requested_by
      WHERE ur.status = 'pending' OR ur.status IS NULL
      ORDER BY ur.created_at DESC
    `);
    const map = (r) => ({
      id: r.id, ucc: r.ucc, name: r.name || r.ucc,
      rm_name: r.rm_name || r.requested_by_name || '—',
      reason: r.reason || '—', mapped_since: r.mapped_since, type: r.type,
    });
    res.json({
      rm_requested: rows.rows.filter(r => (r.type || '').toLowerCase() !== 'ai').map(map),
      ai_suggested: rows.rows.filter(r => (r.type || '').toLowerCase() === 'ai').map(map),
    });
  } catch (err) {
    console.error('UNMAP-REQUESTS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve / reject an unmap request (approve also unmaps the client)
router.post('/unmap-requests/action', auth, async (req, res) => {
  const { id, action } = req.body || {};
  if (!id || !['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Bad request' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE unmap_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING ucc`,
      [action === 'approve' ? 'approved' : 'rejected', id]
    );
    if (action === 'approve' && r.rows[0]?.ucc) {
      await client.query(`UPDATE clients SET assigned_rm_id = NULL, is_mapped = false, updated_at = NOW() WHERE ucc = $1`, [r.rows[0].ucc]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('UNMAP-ACTION ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ── COMPANY DASHBOARD ───────────────────────────────────────────
router.get('/company-dashboard', auth, async (req, res) => {
  try {
    const fdRow = await pool.query(`SELECT COALESCE(fd_rate,6.5) AS fd_rate FROM pipeline_settings ORDER BY id LIMIT 1`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);

    // ── Date range (#13/#35 date-range filter) ──────────────────
    const rng = await resolveRange(req);
    const fromD = rng.from, toD = rng.to;

    const totals = await pool.query(`
      SELECT COUNT(*)::int AS total_clients,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NOT NULL)::int AS mapped,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NULL)::int AS unmapped
      FROM clients
    `);
    const rev = await pool.query(`
      WITH rng AS (
        SELECT ucc, SUM(brokerage_earned) AS brok FROM daily_trades
        WHERE trade_date::date BETWEEN $1 AND $2 GROUP BY ucc
      )
      SELECT COALESCE(SUM(brok),0)::float AS total_rev,
             COALESCE(SUM(brok) FILTER (WHERE c.assigned_rm_id IS NOT NULL),0)::float AS mapped_rev,
             COALESCE(SUM(brok) FILTER (WHERE c.assigned_rm_id IS NULL),0)::float AS unmapped_rev,
             (SELECT COUNT(DISTINCT trade_date) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2)::int AS trading_days
      FROM rng LEFT JOIN clients c ON c.ucc = rng.ucc
    `, [fromD, toD]);
    const pipeline = await pool.query(`
      SELECT (SELECT COUNT(*) FROM lead_pool WHERE status IN ('assigned','pending','opted_in'))::int AS active_leads,
             (SELECT COUNT(*) FROM lead_pool WHERE status IN ('pending','opted_in'))::int AS pending_approvals
    `);
    const churn = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT COUNT(*) FILTER (WHERE sc.churn_risk_score >= 60)::int AS churn_high,
             COUNT(DISTINCT c.assigned_rm_id) FILTER (WHERE sc.churn_risk_score >= 60)::int AS rms_affected
      FROM clients c JOIN sc ON sc.ucc = c.ucc WHERE c.assigned_rm_id IS NOT NULL
    `);
    const rmTable = await pool.query(`
      WITH rng AS (
        SELECT ucc, SUM(brokerage_earned) AS brok,
               SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover + options_premium_turnover) AS turnover
        FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 GROUP BY ucc
      )
      SELECT rm.id, rm.rm_name, rm.capacity,
             COUNT(c.ucc)::int AS clients,
             COALESCE(SUM(rng.brok),0)::float AS revenue,
             COALESCE(SUM(rng.turnover),0)::float AS turnover,
             (SELECT COUNT(*) FROM lead_pool lp WHERE lp.assigned_rm_id = rm.id AND lp.status IN ('assigned','pending','opted_in'))::int AS leads
      FROM rm_master rm
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN rng ON rng.ucc = c.ucc
      GROUP BY rm.id, rm.rm_name, rm.capacity
      ORDER BY revenue DESC, clients DESC
    `, [fromD, toD]);
    // Total company turnover over the range (all clients, mapped + unmapped) — denominator for #14
    const totalTurnover = await pool.query(`
      SELECT COALESCE(SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover + options_premium_turnover),0)::float AS total
      FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2
    `, [fromD, toD]);
    const pendingTop = await pool.query(`
      SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name, rm.rm_name, lp.lead_score::float AS lead_score, lp.status
      FROM lead_pool lp LEFT JOIN clients c ON c.ucc = lp.ucc LEFT JOIN rm_master rm ON lp.assigned_rm_id = rm.id
      WHERE lp.status IN ('pending','opted_in') ORDER BY lp.lead_score DESC NULLS LAST LIMIT 3
    `);
    const trend = await pool.query(`
      SELECT to_char(trade_date,'YYYY-MM') AS mon, COALESCE(SUM(brokerage_earned),0)::float AS brok
      FROM daily_trades GROUP BY 1 ORDER BY 1
    `);
    const mtfTrend = await pool.query(`
      SELECT month_year AS mon, COALESCE(SUM(interest_earned),0)::float AS mtf FROM mtf_monthly GROUP BY 1
    `);
    const ledgerSnap = await pool.query(`
      SELECT (SELECT MAX(ledger_date) FROM daily_ledger) AS d, COALESCE(SUM(opening_balance),0)::float AS bal
      FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)
    `);
    const latestTrade = await pool.query(`SELECT MAX(trade_date) d FROM daily_trades`);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;
    const fmtFull = (d) => { if (!d) return null; const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
    const mtfByMon = {}; mtfTrend.rows.forEach(r => { mtfByMon[r.mon] = Number(r.mtf); });
    const ledgerMonth = ledgerSnap.rows[0]?.d ? ymOf(ledgerSnap.rows[0].d) : null;
    const dailyFloat = Number(ledgerSnap.rows[0]?.bal || 0) * (fdRate / 100) / 365;

    const trendData = trend.rows.map(r => ({
      month: mLabel(r.mon),
      Brokerage: Number(r.brok),
      Commission: 0,
      MTF: mtfByMon[r.mon] || 0,
      Other: r.mon === ledgerMonth ? dailyFloat * 30 : 0,
    }));

    const latestMonthKey = latestTrade.rows[0]?.d ? ymOf(latestTrade.rows[0].d) : null;

    res.json({
      meta: {
        latest_month: latestMonthKey ? mLabel(latestMonthKey) : null,
        data_as_of: fmtFull(latestTrade.rows[0]?.d),
        range: rangeMeta(rng, rev.rows[0].trading_days),
      },
      totals: totals.rows[0],
      revenue: { ...rev.rows[0], avg_rev_per_day: (rev.rows[0].trading_days ? rev.rows[0].total_rev / rev.rows[0].trading_days : 0) },
      company_turnover: Number(totalTurnover.rows[0]?.total || 0),
      pipeline: pipeline.rows[0],
      churn: churn.rows[0],
      rm_table: rmTable.rows.map(r => ({
        rm_name: r.rm_name, clients: Number(r.clients), revenue: Number(r.revenue),
        turnover: Number(r.turnover), capacity: Number(r.capacity || 0), leads: Number(r.leads),
        utilization: Number(r.capacity) > 0 ? (Number(r.clients) / Number(r.capacity)) * 100 : 0,
      })),
      pending_top: pendingTop.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, rm_name: r.rm_name || '—',
        lead_score: r.lead_score != null ? Math.round(r.lead_score) : null,
        opt_in: r.status === 'opted_in' ? 'Clicked' : 'Pending',
      })),
      trend: trendData,
    });
  } catch (err) {
    console.error('COMPANY-DASHBOARD ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── ALL CLIENTS ─────────────────────────────────────────────────
router.get('/all-clients', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const { type = '', plan = '', status = '', activity = '', search = '' } = req.query;

    const cond = [];
    const params = [];
    if (type) { params.push(type); cond.push(`c.client_type = $${params.length}`); }
    if (plan) { params.push(`%${plan}%`); cond.push(`LOWER(c.plan) LIKE LOWER($${params.length})`); }
    if (status === 'mapped')   cond.push(`c.assigned_rm_id IS NOT NULL`);
    if (status === 'unmapped') cond.push(`c.assigned_rm_id IS NULL`);
    if (status === 'lead')     cond.push(`EXISTS (SELECT 1 FROM lead_pool lp WHERE lp.ucc = c.ucc AND lp.status IN ('assigned','pending','opted_in'))`);
    if (activity === 'active')  cond.push(`c.last_trade_date >= CURRENT_DATE - 30`);
    if (activity === 'dormant') cond.push(`c.last_trade_date IS NOT NULL AND c.last_trade_date < CURRENT_DATE - 90`);
    if (activity === 'never')   cond.push(`c.last_trade_date IS NULL`);
    if (search) { params.push(`%${search}%`); cond.push(`(c.name ILIKE $${params.length} OR c.ucc ILIKE $${params.length})`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM clients c ${where}`, params);

    const rows = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, lead_score FROM ai_scores ORDER BY ucc, score_date DESC),
      mtd AS (
        SELECT ucc, SUM(brokerage_earned) AS rev,
               SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover + options_premium_turnover) AS to_mtd
        FROM daily_trades WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades)) GROUP BY ucc
      )
      SELECT c.ucc, c.name, COALESCE(c.client_type,'RI') AS client_type, COALESCE(c.plan,'zero-brokerage') AS plan,
             c.is_active, c.assigned_rm_id, c.last_trade_date, rm.rm_name,
             sc.lead_score::float AS lead_score, COALESCE(mtd.to_mtd,0)::float AS mtd_to, COALESCE(mtd.rev,0)::float AS mtd_rev,
             EXISTS (SELECT 1 FROM lead_pool lp WHERE lp.ucc = c.ucc AND lp.status IN ('assigned','pending','opted_in')) AS is_lead
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      LEFT JOIN sc ON sc.ucc = c.ucc
      LEFT JOIN mtd ON mtd.ucc = c.ucc
      ${where}
      ORDER BY c.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    const cards = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NOT NULL)::int AS mapped,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NULL)::int AS unmapped,
             (SELECT COUNT(*) FROM lead_pool WHERE status IN ('assigned','pending','opted_in'))::int AS in_pipeline
      FROM clients
    `);

    const statusOf = (r) => {
      if (r.is_lead) return 'Lead';
      if (r.last_trade_date && new Date(r.last_trade_date) >= new Date(Date.now() - 30 * 864e5)) return 'Active';
      return 'Dormant';
    };

    res.json({
      cards: cards.rows[0],
      total: countRes.rows[0].n, page, limit,
      clients: rows.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, plan: r.plan,
        status: statusOf(r), last_trade: r.last_trade_date, mtd_to: Number(r.mtd_to), mtd_rev: Number(r.mtd_rev),
        lead_score: r.lead_score != null ? Math.round(r.lead_score) : null, rm_name: r.rm_name || '—',
      })),
    });
  } catch (err) {
    console.error('ALL-CLIENTS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── LEAD PIPELINE ───────────────────────────────────────────────
router.get('/lead-pipeline', auth, async (req, res) => {
  try {
    const cards = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('assigned','pending','opted_in','interested','contacted'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'opted_in' OR optin_code IS NOT NULL)::int AS interested,
        COUNT(*) FILTER (WHERE status IN ('pending','opted_in'))::int AS pending_approval,
        COUNT(*) FILTER (WHERE assignment_expires_at IS NOT NULL
                           AND assignment_expires_at <= NOW() + INTERVAL '7 days'
                           AND assignment_expires_at >= NOW())::int AS expiring
      FROM lead_pool WHERE status <> 'unassigned'
    `);
    const rms = await pool.query(`SELECT id, rm_name FROM rm_master ORDER BY rm_name`);
    const leads = await pool.query(`
      SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name, COALESCE(c.client_type,'RI') AS client_type,
             rm.rm_name, lp.lead_score::float AS lead_score, lp.status, lp.optin_code,
             lp.assigned_at, lp.assignment_expires_at
      FROM lead_pool lp
      LEFT JOIN clients c ON c.ucc = lp.ucc
      LEFT JOIN rm_master rm ON COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id
      WHERE lp.status <> 'unassigned'
      ORDER BY lp.lead_score DESC NULLS LAST
      LIMIT 100
    `);
    const optinLabel = (r) => (r.status === 'opted_in' ? 'Clicked' : r.optin_code ? 'Sent' : 'Not sent');
    res.json({
      cards: cards.rows[0],
      rms: rms.rows.map(r => r.rm_name),
      leads: leads.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, rm_name: r.rm_name || '—',
        lead_score: r.lead_score != null ? Math.round(r.lead_score) : null,
        state: r.status, optin: optinLabel(r),
        assigned_at: r.assigned_at, expires_at: r.assignment_expires_at, reassigns: 0,
      })),
    });
  } catch (err) {
    console.error('LEAD-PIPELINE ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── MAPPING APPROVALS ───────────────────────────────────────────
router.get('/mapping-approvals', auth, async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT lp.id, lp.ucc, COALESCE(lp.client_name, c.name) AS name, COALESCE(c.client_type,'RI') AS client_type,
             rm.rm_name, lp.lead_score::float AS lead_score, lp.status, lp.optin_code, lp.updated_at,
             (SELECT COUNT(*) FROM interactions i WHERE i.ucc = lp.ucc)::int AS interactions,
             (SELECT i.notes FROM interactions i WHERE i.ucc = lp.ucc ORDER BY i.interaction_date DESC NULLS LAST LIMIT 1) AS rm_notes
      FROM lead_pool lp
      LEFT JOIN clients c ON c.ucc = lp.ucc
      LEFT JOIN rm_master rm ON COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id
      WHERE lp.status IN ('pending','opted_in') AND lp.lead_score >= 50
      ORDER BY lp.lead_score DESC NULLS LAST
    `);
    res.json({
      rows: rows.rows.map(r => ({
        id: r.id, ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, rm_name: r.rm_name || '—',
        lead_score: r.lead_score != null ? Math.round(r.lead_score) : null,
        optin: r.status === 'opted_in' ? 'Clicked' : 'Not yet clicked',
        interactions: Number(r.interactions), rm_notes: r.rm_notes || '—',
      })),
    });
  } catch (err) {
    console.error('MAPPING-APPROVALS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/mapping-approvals/action', auth, async (req, res) => {
  const { id, action } = req.body || {};
  if (!id || !['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Bad request' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE lead_pool SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING ucc, COALESCE(assigned_rm_id, assigned_to_rm) AS rm_id`,
      [action === 'approve' ? 'mapped' : 'rejected', id]
    );
    if (action === 'approve' && r.rows[0]?.ucc) {
      await client.query(
        `UPDATE clients SET assigned_rm_id = $1, is_mapped = true, updated_at = NOW() WHERE ucc = $2`,
        [r.rows[0].rm_id, r.rows[0].ucc]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('MAPPING-ACTION ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ── AI INSIGHTS ─────────────────────────────────────────────────
router.get('/ai-insights', auth, async (req, res) => {
  try {
    const meta = await pool.query(`
      SELECT (SELECT COUNT(*) FROM clients)::int AS total_clients,
             (SELECT COUNT(*) FROM rm_master)::int AS rms,
             (SELECT MAX(score_date) FROM ai_scores) AS last_run
    `);
    const agg = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE assigned_rm_id IS NOT NULL)::int AS mapped,
             (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned')::int AS pool,
             (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned' AND lead_score >= 60)::int AS pool_gt60
      FROM clients
    `);
    const churn = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT c.ucc, c.name, rm.rm_name, sc.churn_risk_score::float AS churn, c.last_trade_date
      FROM clients c JOIN sc ON sc.ucc = c.ucc LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 5
      ORDER BY sc.churn_risk_score DESC LIMIT 5
    `);
    const churnCount = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT COUNT(*)::int AS n FROM clients c JOIN sc ON sc.ucc = c.ucc
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 6
    `);
    const topLeads = await pool.query(`
      SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name, lp.lead_score::float AS lead_score, lp.lead_type,
             c.last_trade_date, COALESCE(h.total_holding_value,0)::float AS holdings
      FROM lead_pool lp
      LEFT JOIN clients c ON c.ucc = lp.ucc
      LEFT JOIN holdings_summary h ON h.ucc = lp.ucc AND h.holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
      WHERE lp.status = 'unassigned'
      ORDER BY lp.lead_score DESC NULLS LAST LIMIT 5
    `);
    const unmap = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT c.ucc, c.name, rm.rm_name, c.last_trade_date, sc.churn_risk_score::float AS churn
      FROM clients c JOIN sc ON sc.ucc = c.ucc LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 7
      ORDER BY sc.churn_risk_score DESC LIMIT 5
    `);

    const monthsSince = (d) => { if (!d) return null; return Math.floor((Date.now() - new Date(d).getTime()) / (30 * 864e5)); };
    const churnSignal = (d) => { const m = monthsSince(d); return m == null ? 'No recent trade' : `No trade ${m} month${m === 1 ? '' : 's'}`; };
    const leadSignal = (r) => {
      const s = [];
      if (Number(r.holdings) > 1000000) s.push(`₹${(r.holdings / 1e5).toFixed(0)}L holdings`);
      if (r.lead_type) s.push(r.lead_type);
      const m = monthsSince(r.last_trade_date);
      if (m != null && m >= 3) s.push('dormancy risk');
      return s.slice(0, 2).join(', ') || 'High AI score';
    };

    const m = meta.rows[0]; const a = agg.rows[0];
    const paceText = `Across ${Number(m.total_clients).toLocaleString('en-IN')} clients and ${m.rms} RMs, ${a.mapped} are mapped. ${churnCount.rows[0].n} mapped clients are flagged at churn risk (score ≥6/10). The unmapped pool holds ${Number(a.pool).toLocaleString('en-IN')} clients, ${a.pool_gt60} scoring above 60 and ready for round-robin assignment.`;
    const unmapText = unmap.rows.length
      ? `${unmap.rows.length} mapped clients show high churn risk with limited recent activity — freeing these slots opens capacity for higher-potential leads.`
      : `No mapped clients currently meet the high-churn unmap threshold.`;

    res.json({
      meta: { total_clients: Number(m.total_clients), rms: m.rms, last_run: m.last_run },
      pace_text: paceText,
      churn_alerts: churn.rows.map(r => ({ ucc: r.ucc, name: r.name || r.ucc, rm_name: r.rm_name || '—', signal: churnSignal(r.last_trade_date), score: Math.round(Number(r.churn)) })),
      top_leads: topLeads.rows.map(r => ({ ucc: r.ucc, name: r.name || r.ucc, score: r.lead_score != null ? Math.round(r.lead_score) : null, signal: leadSignal(r) })),
      unmap_text: unmapText,
      unmap_suggestions: unmap.rows.map(r => ({ ucc: r.ucc, name: r.name || r.ucc, rm_name: r.rm_name || '—', mapped_since: null, signal: churnSignal(r.last_trade_date) })),
    });
  } catch (err) {
    console.error('AI-INSIGHTS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── RM PERFORMANCE ──────────────────────────────────────────────
router.get('/rm-performance', auth, async (req, res) => {
  try {
    const FY = `make_date(CASE WHEN EXTRACT(MONTH FROM (SELECT MAX(trade_date) FROM daily_trades))::int >= 4
                    THEN EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int
                    ELSE EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int - 1 END, 4, 1)`;

    const rows = await pool.query(`
      WITH mtd AS (
        SELECT c.assigned_rm_id AS rm_id,
               SUM(dt.brokerage_earned) AS rev,
               SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover + dt.options_premium_turnover) AS turnover
        FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc
        WHERE dt.trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades)) AND c.assigned_rm_id IS NOT NULL
        GROUP BY c.assigned_rm_id
      ),
      ytd AS (
        SELECT c.assigned_rm_id AS rm_id, SUM(dt.brokerage_earned) AS rev
        FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc
        WHERE dt.trade_date >= ${FY} AND c.assigned_rm_id IS NOT NULL
        GROUP BY c.assigned_rm_id
      ),
      sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT rm.id, rm.rm_name,
             COUNT(c.ucc)::int AS clients,
             COALESCE(MAX(mtd.rev),0)::float AS mtd_rev,
             COALESCE(MAX(mtd.turnover),0)::float AS mtd_turnover,
             COALESCE(MAX(ytd.rev),0)::float AS ytd_rev,
             (SELECT COUNT(*) FROM lead_pool lp WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id)::int AS leads,
             (SELECT COUNT(*) FROM lead_pool lp WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id AND lp.status='mapped')::int AS converted,
             (SELECT COUNT(*) FROM interactions i WHERE i.rm_id = rm.id AND i.interaction_date >= date_trunc('month', CURRENT_DATE))::int AS interactions,
             COUNT(c.ucc) FILTER (WHERE sc.churn_risk_score >= 60)::int AS churn_alerts
      FROM rm_master rm
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN sc ON sc.ucc = c.ucc
      LEFT JOIN mtd ON mtd.rm_id = rm.id
      LEFT JOIN ytd ON ytd.rm_id = rm.id
      GROUP BY rm.id, rm.rm_name
      ORDER BY mtd_turnover DESC, clients DESC
    `);

    const monthly = await pool.query(`
      SELECT to_char(dt.trade_date,'YYYY-MM') AS mon, rm.rm_name,
             SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover + dt.options_premium_turnover)::float AS turnover
      FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc JOIN rm_master rm ON c.assigned_rm_id = rm.id
      GROUP BY 1, 2 ORDER BY 1
    `);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;

    const rmRows = rows.rows.map(r => ({
      rm_name: r.rm_name, clients: Number(r.clients), mtd_rev: Number(r.mtd_rev), mtd_turnover: Number(r.mtd_turnover),
      ytd_rev: Number(r.ytd_rev), leads: Number(r.leads), converted: Number(r.converted),
      conv_pct: Number(r.leads) > 0 ? (Number(r.converted) / Number(r.leads)) * 100 : 0,
      interactions: Number(r.interactions), churn_alerts: Number(r.churn_alerts),
    }));

    // Monthly chart pivot: {month, [rmName]: turnoverCr}
    const rmNames = [...new Set(monthly.rows.map(r => r.rm_name))];
    const byMonth = {};
    monthly.rows.forEach(r => {
      const k = mLabel(r.mon);
      (byMonth[k] = byMonth[k] || { month: k });
      byMonth[k][r.rm_name] = +(Number(r.turnover) / 1e7).toFixed(2);
    });
    const chart = Object.values(byMonth);

    const teamRev = rmRows.reduce((s, r) => s + r.mtd_rev, 0);
    const teamConverted = rmRows.reduce((s, r) => s + r.converted, 0);
    const best = rmRows[0] || null;
    const worst = rmRows.length > 1 ? rmRows[rmRows.length - 1] : null;

    res.json({
      cards: {
        best_rm: best ? best.rm_name : '—', best_turnover: best ? best.mtd_turnover : 0,
        worst_rm: worst ? worst.rm_name : '—', worst_turnover: worst ? worst.mtd_turnover : 0,
        team_rev: teamRev, team_converted: teamConverted,
      },
      rm_names: rmNames,
      chart,
      rows: rmRows,
    });
  } catch (err) {
    console.error('RM-PERFORMANCE ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── RM IMPACT (pre vs post mapping) ─────────────────────────────
// Requires a stored mapping date per client plus ~3 months of trade history
// before AND after each mapping. With the current 2-month trade window and few
// mapped clients this can't be computed; the page reports that honestly and
// fills the per-RM client counts that ARE real.
router.get('/rm-impact', auth, async (req, res) => {
  try {
    const span = await pool.query(`
      SELECT MIN(trade_date) AS min_d, MAX(trade_date) AS max_d,
             ((MAX(trade_date) - MIN(trade_date)) / 30.0) AS months
      FROM daily_trades
    `);
    const monthsSpan = Number(span.rows[0]?.months || 0);
    const perRm = await pool.query(`
      SELECT rm.rm_name, COUNT(c.ucc)::int AS clients
      FROM rm_master rm LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      GROUP BY rm.rm_name ORDER BY clients DESC
    `);
    // "measured" = mapped clients with at least 3 months of trade history on each side — none yet
    const insufficient = monthsSpan < 6;

    res.json({
      meta: {
        insufficient_history: insufficient,
        trade_months: Math.round(monthsSpan * 10) / 10,
        reason: 'Pre/post-mapping comparison needs a stored mapping date and ~3 months of trade history before and after each mapping. The current trade window is too short and mapped-client history is not yet available.',
      },
      cards: { rev_increase_pct: null, to_increase_pct: null, float_increase_pct: null, no_improve_pct: null },
      per_rm: perRm.rows.map(r => ({
        rm_name: r.rm_name, clients_measured: 0, total_clients: Number(r.clients),
        rev_pre: null, rev_post: null, to_pre: null, to_post: null, float_change: null, unmap_candidates: 0,
      })),
      no_improvement: [],
    });
  } catch (err) {
    console.error('RM-IMPACT ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CLIENT ANALYTICS ────────────────────────────────────────────
router.get('/client-analytics', auth, async (req, res) => {
  try {
    const rng = await resolveRange(req);
    const dFrom0 = rng.from ? new Date(rng.from) : null;
    const spanD = (rng.from && rng.to) ? Math.max(0, Math.round((new Date(rng.to) - dFrom0) / 864e5)) : 0;
    const priorTo = dFrom0 ? isoOf(new Date(dFrom0.getTime() - 864e5)) : null;
    const priorFrom = dFrom0 ? isoOf(new Date(dFrom0.getTime() - (spanD + 1) * 864e5)) : null;

    const avgTraded = await pool.query(`
      WITH d AS (
        SELECT trade_date, COUNT(DISTINCT ucc) AS c
        FROM daily_trades WHERE trade_date::date BETWEEN $3 AND $2 GROUP BY trade_date
      )
      SELECT ROUND(AVG(c) FILTER (WHERE trade_date::date BETWEEN $1 AND $2))::int AS this_m,
             ROUND(AVG(c) FILTER (WHERE trade_date::date BETWEEN $3 AND $4))::int AS prev_m
      FROM d
    `, [rng.from, rng.to, priorFrom, priorTo]);

    const nri = await pool.query(`SELECT COUNT(*)::int AS n FROM clients WHERE client_type ILIKE 'NR%'`);

    const dailyFO = await pool.query(`
      SELECT dt.trade_date AS d,
             COUNT(DISTINCT dt.ucc)::int AS clients,
             COUNT(DISTINCT dt.ucc) FILTER (WHERE c.client_type ILIKE 'NR%')::int AS nri
      FROM daily_trades dt LEFT JOIN clients c ON c.ucc = dt.ucc
      WHERE (dt.eq_fo_turnover > 0 OR dt.options_premium_turnover > 0) AND dt.trade_date::date BETWEEN $1 AND $2
      GROUP BY dt.trade_date ORDER BY dt.trade_date
    `, [rng.from, rng.to]);

    const breakdown = await pool.query(`
      WITH mtd AS (
        SELECT dt.ucc, dt.options_premium_turnover, dt.eq_cash_turnover, dt.commodity_fo_turnover, dt.brokerage_earned,
               COALESCE(c.client_type,'RI') AS ctype
        FROM daily_trades dt LEFT JOIN clients c ON c.ucc = dt.ucc
        WHERE dt.trade_date::date BETWEEN $1 AND $2
      )
      SELECT ctype AS client_type,
             COUNT(DISTINCT ucc)::int AS active,
             COUNT(DISTINCT ucc) FILTER (WHERE options_premium_turnover > 0)::int AS eq_options,
             COUNT(DISTINCT ucc) FILTER (WHERE eq_cash_turnover > 0)::int AS eq_cash,
             COUNT(DISTINCT ucc) FILTER (WHERE commodity_fo_turnover > 0)::int AS commodity,
             COALESCE(SUM(options_premium_turnover),0)::float AS opt_to,
             COALESCE(SUM(brokerage_earned),0)::float AS brokerage
      FROM mtd GROUP BY ctype ORDER BY active DESC
    `, [rng.from, rng.to]);
    const mtfUsers = await pool.query(`
      SELECT COALESCE(c.client_type,'RI') AS ctype, COUNT(DISTINCT m.ucc)::int AS n
      FROM mtf_monthly m LEFT JOIN clients c ON c.ucc = m.ucc
      WHERE m.month_year = (SELECT MAX(month_year) FROM mtf_monthly) GROUP BY ctype
    `);
    const mtfByType = {}; mtfUsers.rows.forEach(r => { mtfByType[r.client_type] = Number(r.n); });

    const hv = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(options_premium_turnover) AS opt_to, SUM(brokerage_earned) AS brok
        FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 GROUP BY ucc
      ),
      led AS (SELECT ucc, opening_balance FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)),
      mtf AS (SELECT ucc, SUM(interest_earned) AS interest FROM mtf_monthly WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly) GROUP BY ucc)
      SELECT m.ucc, c.name, COALESCE(c.client_type,'RI') AS client_type, m.opt_to::float, COALESCE(m.brok,0)::float AS brok,
             COALESCE(led.opening_balance,0)::float AS float_bal, COALESCE(mtf.interest,0)::float AS mtf, rm.rm_name,
             c.last_trade_date
      FROM mtd m
      LEFT JOIN clients c ON c.ucc = m.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      LEFT JOIN led ON led.ucc = m.ucc
      LEFT JOIN mtf ON mtf.ucc = m.ucc
      ORDER BY m.opt_to DESC LIMIT 10
    `, [rng.from, rng.to]);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dLabel = (d) => { const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`; };
    const b = breakdown.rows[0] || {};
    const at = avgTraded.rows[0] || {};
    const statusOf = (d) => (d && new Date(d) >= new Date(Date.now() - 30 * 864e5) ? 'Active' : 'Dormant');

    const asOfCa = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM daily_trades`);
    res.json({
      meta: { as_of: asOfCa.rows[0]?.a || null, range: rangeMeta(rng) },
      cards: {
        total_traded: Number(at.this_m || 0), total_traded_prev: Number(at.prev_m || 0),
        nri: dailyFO.rows.length ? Math.round(dailyFO.rows.reduce((s, r) => s + Number(r.nri), 0) / dailyFO.rows.length) : 0,
        nri_total: Number(nri.rows[0].n),
        profitable: null, loss: null, // realised_pnl not populated
      },
      daily_fo: dailyFO.rows.map(r => ({ date: dLabel(r.d), Resident: Number(r.clients) - Number(r.nri), NRI: Number(r.nri) })),
      pnl_available: false,
      breakdown: breakdown.rows.map(r => ({
        client_type: r.client_type, active: Number(r.active),
        eq_options: Number(r.eq_options), eq_cash: Number(r.eq_cash), commodity: Number(r.commodity),
        mtf_users: mtfByType[r.client_type] || 0,
        avg_opt_to: Number(r.eq_options) > 0 ? Number(r.opt_to) / Number(r.eq_options) : 0,
        avg_brok: Number(r.active) > 0 ? Number(r.brokerage) / Number(r.active) : 0,
      })),
      hv_watch: hv.rows.map(r => ({
        ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, opt_to: Number(r.opt_to),
        brokerage: Number(r.brok), float: Number(r.float_bal), mtf: Number(r.mtf),
        rm_name: r.rm_name || '—', status: statusOf(r.last_trade_date),
      })),
    });
  } catch (err) {
    console.error('CLIENT-ANALYTICS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CORPORATE DAILY MIS ─────────────────────────────────────────
router.get('/daily-mis', auth, async (req, res) => {
  try {
    const fdRow = await pool.query(`SELECT COALESCE(fd_rate,6.5) AS fd_rate FROM pipeline_settings ORDER BY id LIMIT 1`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);

    // 5-way segment split + client segments per day, from raw trades
    const perDay = await pool.query(`
      SELECT t.trade_date::text AS d,
             COALESCE(SUM(t.traded_value) FILTER (WHERE t.exchange IN ('NFO','BFO') AND t.instrument_name IN ('OPTIDX','OPTSTK')),0)::float AS eq_opt,
             COALESCE(SUM(t.traded_value) FILTER (WHERE t.exchange IN ('MCX','NCDEX') AND t.instrument_name IN ('OPTFUT','OPTIDX','OPTSTK')),0)::float AS comm_opt,
             COALESCE(SUM(t.traded_value) FILTER (WHERE t.exchange IN ('NFO','BFO') AND t.instrument_name IN ('FUTIDX','FUTSTK')),0)::float AS eq_fut,
             COALESCE(SUM(t.traded_value) FILTER (WHERE t.exchange IN ('MCX','NCDEX') AND t.instrument_name = 'FUTCOM'),0)::float AS comm_fut,
             COALESCE(SUM(t.traded_value) FILTER (WHERE t.exchange IN ('NSE','BSE')),0)::float AS eq_cash,
             COUNT(DISTINCT t.ucc)::int AS total_clients,
             COUNT(DISTINCT t.ucc) FILTER (WHERE t.exchange IN ('NFO','BFO') AND t.instrument_name IN ('OPTIDX','OPTSTK','FUTIDX','FUTSTK'))::int AS fo_eq_clients,
             COUNT(DISTINCT t.ucc) FILTER (WHERE t.exchange IN ('MCX','NCDEX'))::int AS fo_comm_clients,
             COUNT(DISTINCT t.ucc) FILTER (WHERE t.exchange IN ('NSE','BSE'))::int AS cash_clients,
             COUNT(DISTINCT t.ucc) FILTER (WHERE c.client_type ILIKE 'NR%')::int AS nri_clients,
             BOOL_OR(t.expiry_date = t.trade_date) AS is_expiry
      FROM trades t LEFT JOIN clients c ON c.ucc = t.ucc
      GROUP BY t.trade_date ORDER BY t.trade_date
    `);
    const brok = await pool.query(`SELECT trade_date::text AS d, SUM(brokerage_earned)::float AS brok FROM daily_trades GROUP BY 1`);
    const brokBy = {}; brok.rows.forEach(r => { brokBy[r.d] = Number(r.brok); });
    const mtf = await pool.query(`
      SELECT COALESCE(SUM(interest_earned),0)::float AS interest, COALESCE(SUM(avg_mtf_balance),0)::float AS bal,
             COUNT(DISTINCT ucc)::int AS clients
      FROM mtf_monthly WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly)
    `);
    const ledger = await pool.query(`SELECT COALESCE(SUM(opening_balance),0)::float AS bal FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)`);

    const rows = perDay.rows.map(r => ({
      d: String(r.d), eq_opt: Number(r.eq_opt), comm_opt: Number(r.comm_opt), eq_fut: Number(r.eq_fut),
      comm_fut: Number(r.comm_fut), eq_cash: Number(r.eq_cash), total_clients: Number(r.total_clients),
      fo_eq_clients: Number(r.fo_eq_clients), fo_comm_clients: Number(r.fo_comm_clients), cash_clients: Number(r.cash_clients),
      nri_clients: Number(r.nri_clients), resident_clients: Number(r.total_clients) - Number(r.nri_clients),
      is_expiry: !!r.is_expiry, brok: brokBy[String(r.d)] || 0,
    }));
    const n = rows.length;
    const today = rows[n - 1], yday = rows[n - 2], dbef = rows[n - 3];
    const curMonth = today ? ymOf(today.d) : null;
    const mtdRows = rows.filter(r => ymOf(r.d) === curMonth);
    const priorRows = rows.filter(r => ymOf(r.d) !== curMonth);
    const expRows = rows.filter(r => r.is_expiry), nonExp = rows.filter(r => !r.is_expiry);
    const avg = (arr, f) => arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0;
    const cr = (v) => +(v / 1e7).toFixed(1);
    const vsPct = (cur, base) => base ? +(((cur - base) / base) * 100).toFixed(1) : null;
    const dailyFloat = Number(ledger.rows[0]?.bal || 0) * (fdRate / 100) / 365;
    const mtfDay = Number(mtf.rows[0]?.interest || 0) / 30;

    const volSeg = (label, f, expiry) => ({
      segment: label,
      today: today ? cr(f(today)) : 0, yesterday: yday ? cr(f(yday)) : 0,
      mtd_avg: cr(avg(mtdRows, f)), prior3m_avg: cr(avg(priorRows, f)),
      vs: vsPct(today ? f(today) : 0, avg(priorRows, f)),
      expiry_premium: expiry && nonExp.length && avg(nonExp, f) > 0
        ? +(((avg(expRows, f) - avg(nonExp, f)) / avg(nonExp, f)) * 100).toFixed(0) : null,
    });
    const totVol = (r) => r.eq_opt + r.comm_opt + r.eq_fut + r.comm_fut + r.eq_cash;
    const actSeg = (label, f) => ({
      category: label, today: today ? f(today) : 0, yesterday: yday ? f(yday) : 0,
      mtd_avg: Math.round(avg(mtdRows, f)), prior3m_avg: Math.round(avg(priorRows, f)),
      vs: vsPct(today ? f(today) : 0, avg(priorRows, f)),
    });

    // Income lines (₹): clearing unavailable; brokerage/MTF/float real
    const incLine = (line, tf, note) => {
      const t = today ? tf(today) : 0, y = yday ? tf(yday) : 0, db = dbef ? tf(dbef) : 0;
      const mtd = avg(mtdRows, tf), p3 = avg(priorRows, tf);
      return { line, today: note ? null : Math.round(t), yesterday: note ? null : Math.round(y),
        day_before: note ? null : Math.round(db), mtd_avg: note ? null : Math.round(mtd),
        prior3m_avg: note ? null : Math.round(p3), vs: note ? null : vsPct(t, p3), note: note || null };
    };
    const income = [
      incLine('Eq Options clearing', () => 0, 'no clearing feed'),
      incLine('Comm Options clearing', () => 0, 'no clearing feed'),
      incLine('Equity brokerage', r => r.brok, null),
      incLine('MTF interest (daily)', () => mtfDay, null),
      incLine('Float income (est.)', () => dailyFloat, null),
    ];
    const realLines = income.filter(l => !l.note);
    const totalToday = realLines.reduce((s, l) => s + (l.today || 0), 0);
    const totalMtd = realLines.reduce((s, l) => s + (l.mtd_avg || 0), 0);
    const totalPrior = realLines.reduce((s, l) => s + (l.prior3m_avg || 0), 0);
    income.push({ line: 'Total revenue', today: Math.round(totalToday), yesterday: Math.round(realLines.reduce((s, l) => s + (l.yesterday || 0), 0)),
      day_before: Math.round(realLines.reduce((s, l) => s + (l.day_before || 0), 0)), mtd_avg: Math.round(totalMtd),
      prior3m_avg: Math.round(totalPrior), vs: vsPct(totalToday, totalPrior), note: null, total: true });
    income.forEach(l => { l.share = (l.note || l.total) ? null : (totalToday > 0 ? Math.round((l.today || 0) / totalToday * 100) : 0); });

    const revenueMix = realLines.map(l => ({ label: l.line.replace(' (daily)', '').replace(' (est.)', ''), pct: totalToday > 0 ? Math.round((l.today || 0) / totalToday * 100) : 0 }));

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dLabel = (d) => { const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`; };
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    res.json({
      meta: { today: fmtDate(today?.d), is_expiry: today ? today.is_expiry : false, brokerage_loaded: rows.reduce((s, r) => s + r.brok, 0) > 0 },
      income,
      volume: [
        volSeg('Eq Options (premium TO)', r => r.eq_opt, true),
        volSeg('Comm Options', r => r.comm_opt, false),
        volSeg('Eq Futures', r => r.eq_fut, false),
        volSeg('Comm Futures', r => r.comm_fut, false),
        volSeg('Equity Cash', r => r.eq_cash, false),
        { ...volSeg('Total (all segments)', totVol, false), total: true },
      ],
      activity: [
        actSeg('Total clients traded', r => r.total_clients),
        actSeg('F&O clients (Eq)', r => r.fo_eq_clients),
        actSeg('F&O clients (Comm)', r => r.fo_comm_clients),
        actSeg('Equity cash clients', r => r.cash_clients),
        { category: 'MTF clients', today: Number(mtf.rows[0]?.clients || 0), yesterday: Number(mtf.rows[0]?.clients || 0), mtd_avg: Number(mtf.rows[0]?.clients || 0), prior3m_avg: null, vs: null },
        actSeg('Resident clients', r => r.resident_clients),
        actSeg('NRI clients', r => r.nri_clients),
      ],
      mtf: {
        funding: Number(mtf.rows[0]?.bal || 0), interest: Number(mtf.rows[0]?.interest || 0),
        clients: Number(mtf.rows[0]?.clients || 0), daily_interest: Math.round(mtfDay),
        avg_per_client: Number(mtf.rows[0]?.clients || 0) > 0 ? Number(mtf.rows[0]?.bal || 0) / Number(mtf.rows[0]?.clients || 0) : 0,
      },
      revenue_mix: revenueMix,
      trend: rows.slice(-17).map(r => ({
        date: dLabel(r.d), options_cr: cr(r.eq_opt + r.comm_opt), clients: r.total_clients,
        revenue_l: +((r.brok + mtfDay + dailyFloat) / 1e5).toFixed(2), is_expiry: r.is_expiry,
      })),
    });
  } catch (err) {
    console.error('DAILY-MIS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

const MON_A = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monLbl = (m) => `${MON_A[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;
// Robust "YYYY-MM" extractor. Postgres returns DATE columns as JS Date objects,
// so String(date).slice(0,7) yields "Wed Jul" (weekday+month) instead of "2026-07".
// Works for Date objects, ISO strings, and full date strings alike.
const ymOf = (d) => { if (!d) return null; const t = new Date(d); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
// Full "8 Jul 2026" style date for "As of" indicators (#12 / #34).
const fmtFullDate = (d) => { if (!d) return null; const t = new Date(d); return `${t.getUTCDate()} ${MON_A[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
const isoOf = (d) => { if (!d) return null; const t = new Date(d); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; };

// Shared date-range resolver for the #13/#35 filter. Reads ?range=month|30d|3m|fy|all
// (relative to the latest date in the given table) or explicit ?from&?to.
// table/dateCol are code-controlled identifiers (never user input).
async function resolveRange(req, table = 'daily_trades', dateCol = 'trade_date') {
  // Bounds come back as pure 'YYYY-MM-DD' text (::date::text) so there is no
  // Date-object / timezone drift; preset math parses them as explicit UTC.
  const b = (await pool.query(`SELECT MIN(${dateCol})::date::text mn, MAX(${dateCol})::date::text mx FROM ${table}`)).rows[0] || {};
  const key = String(req.query.range || 'month');
  let from, to;
  if (req.query.from && req.query.to) {
    from = String(req.query.from); to = String(req.query.to);
  } else if (b.mx) {
    const mx = new Date(b.mx + 'T00:00:00Z'); to = b.mx;
    if (key === 'all') from = b.mn;
    else if (key === '30d') from = isoOf(new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate() - 29)));
    else if (key === '3m') from = isoOf(new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth() - 2, 1)));
    else if (key === 'fy') { const y = mx.getUTCMonth() >= 3 ? mx.getUTCFullYear() : mx.getUTCFullYear() - 1; from = `${y}-04-01`; }
    else from = isoOf(new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), 1)));
  } else { from = null; to = null; }
  return { key, from, to, data_min: b.mn || null, data_max: b.mx || null };
}
// Build the `range` meta object returned to the client (dates formatted for display).
const rangeMeta = (rng, tradingDays) => ({
  key: rng.key, from: fmtFullDate(rng.from), to: fmtFullDate(rng.to),
  from_iso: rng.from, to_iso: rng.to, data_min: rng.data_min, data_max: rng.data_max,
  trading_days: tradingDays != null ? tradingDays : undefined,
});

// ── RETENTION & COHORTS ─────────────────────────────────────────
router.get('/retention', auth, async (req, res) => {
  try {
    const active = await pool.query(`
      SELECT to_char(trade_date,'YYYY-MM') AS mon, COUNT(DISTINCT ucc)::int AS active
      FROM daily_trades GROUP BY 1 ORDER BY 1
    `);
    const cohorts = await pool.query(`
      SELECT to_char(account_open_date,'YYYY-MM') AS mon, COUNT(*)::int AS opened
      FROM clients WHERE account_open_date IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 8
    `);
    const seg = await pool.query(`
      WITH m AS (SELECT DISTINCT to_char(trade_date,'YYYY-MM') AS mon, ucc FROM daily_trades),
      s AS (
        SELECT to_char(trade_date,'YYYY-MM') AS mon,
               COUNT(DISTINCT ucc)::int AS total,
               COUNT(DISTINCT ucc) FILTER (WHERE options_premium_turnover > 0)::int AS eq_options,
               COUNT(DISTINCT ucc) FILTER (WHERE eq_cash_turnover > 0)::int AS eq_cash,
               COUNT(DISTINCT ucc) FILTER (WHERE commodity_fo_turnover > 0)::int AS comm_fo,
               COUNT(DISTINCT ucc) FILTER (WHERE eq_fo_turnover > 0)::int AS eq_fut
        FROM daily_trades GROUP BY 1
      )
      SELECT s.*,
        (SELECT COUNT(*) FROM m cur WHERE cur.mon = s.mon
           AND NOT EXISTS (SELECT 1 FROM m p WHERE p.ucc = cur.ucc
             AND p.mon = to_char(to_date(s.mon||'-01','YYYY-MM-DD') - INTERVAL '1 month','YYYY-MM')))::int AS new_act,
        (SELECT COUNT(*) FROM m prev WHERE prev.mon = to_char(to_date(s.mon||'-01','YYYY-MM-DD') - INTERVAL '1 month','YYYY-MM')
           AND NOT EXISTS (SELECT 1 FROM m c WHERE c.ucc = prev.ucc AND c.mon = s.mon))::int AS churned
      FROM s ORDER BY s.mon
    `);
    const a = active.rows.map(r => ({ month: monLbl(r.mon), active: Number(r.active) }));
    const segRows = seg.rows.map((r, i, arr) => {
      const prev = i > 0 ? arr[i - 1] : null;
      const mom = prev && Number(prev.total) ? ((Number(r.total) - Number(prev.total)) / Number(prev.total) * 100) : null;
      return {
        month: monLbl(r.mon), eq_options: Number(r.eq_options), eq_cash: Number(r.eq_cash),
        comm_fo: Number(r.comm_fo), eq_fut: Number(r.eq_fut), total: Number(r.total),
        mom: mom == null ? null : +mom.toFixed(1), new_act: Number(r.new_act), churned: Number(r.churned),
      };
    }).reverse();
    const latest = seg.rows.length ? seg.rows[seg.rows.length - 1] : null;
    const asOfRet = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM daily_trades`);
    res.json({
      meta: { insufficient_history: true, active_months: active.rows.length, as_of: asOfRet.rows[0]?.a || null },
      cards: {
        monthly_active: a.length ? a[a.length - 1].active : 0,
        monthly_active_prev: a.length > 1 ? a[a.length - 2].active : 0,
        retention_30: null, retention_90: null,
        churn: latest ? Number(latest.churned) : null,
      },
      monthly_active: a,
      cohorts: cohorts.rows.slice().reverse().map(r => ({ cohort: monLbl(r.mon), opened: Number(r.opened) })),
      segment_trend: segRows,
    });
  } catch (err) { console.error('RETENTION ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ── CLIENT REVENUE RAMP ─────────────────────────────────────────
router.get('/revenue-ramp', auth, async (req, res) => {
  try {
    const cohorts = await pool.query(`
      SELECT to_char(account_open_date,'YYYY-MM') AS mon, COUNT(*)::int AS clients
      FROM clients WHERE account_open_date IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 6
    `);
    const asOfRamp = await pool.query(`SELECT to_char(MAX(account_open_date),'FMDD Mon YYYY') a FROM clients`);
    res.json({
      meta: { insufficient_history: true, reason: 'Per-cohort revenue at M1/M3/M6 needs revenue (brokerage) and multi-month post-opening history, neither available yet.', as_of: asOfRamp.rows[0]?.a || null },
      cards: { m1: null, m3: null, m6: null, opt_activation: null },
      cohorts: cohorts.rows.slice().reverse().map(r => ({ cohort: monLbl(r.mon), clients: Number(r.clients) })),
    });
  } catch (err) { console.error('REVENUE-RAMP ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ── MARKET SHARE ────────────────────────────────────────────────
router.get('/market-share', auth, async (req, res) => {
  try {
    const rng = await resolveRange(req, 'trades');
    const navia = await pool.query(`
      WITH t AS (
        SELECT to_char(trade_date,'YYYY-MM') AS mon, trade_date, traded_value,
          CASE WHEN exchange IN ('NFO','BFO') AND instrument_name IN ('OPTIDX','OPTSTK') THEN 'eqopt'
               WHEN exchange IN ('MCX','NCDEX') AND instrument_name IN ('OPTFUT','OPTIDX','OPTSTK') THEN 'commopt'
               WHEN exchange IN ('NFO','BFO') AND instrument_name IN ('FUTIDX','FUTSTK') THEN 'eqfut'
               ELSE 'other' END AS seg
        FROM trades WHERE trade_date::date BETWEEN $1 AND $2
      )
      SELECT mon,
             COALESCE(SUM(traded_value) FILTER (WHERE seg='eqopt'),0)::float   AS eqopt,
             COALESCE(SUM(traded_value) FILTER (WHERE seg='commopt'),0)::float  AS commopt,
             COALESCE(SUM(traded_value) FILTER (WHERE seg='eqfut'),0)::float    AS eqfut,
             COUNT(DISTINCT trade_date)::int AS days
      FROM t GROUP BY mon ORDER BY mon
    `, [rng.from, rng.to]);
    const perDay = (v, d) => (d ? +(Number(v) / d / 1e7).toFixed(2) : 0);
    const rows = navia.rows.map(r => ({
      month: monLbl(r.mon),
      navia_eqopt: perDay(r.eqopt, r.days),
      navia_commopt: perDay(r.commopt, r.days),
      navia_eqfut: perDay(r.eqfut, r.days),
      exchange_eqopt: null, eqopt_share: null,
      exchange_comm: null, comm_share: null, eqfut_share: null,
    }));
    const asOfMkt = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM trades`);
    res.json({
      meta: { feed_available: false, reason: 'Market share needs external exchange total-volume figures — no exchange feed is ingested yet.', as_of: asOfMkt.rows[0]?.a || null, range: rangeMeta(rng) },
      cards: {
        navia_avg: rows.length ? rows[rows.length - 1].navia_eqopt : 0,
        exchange_avg: null, mkt_share: null, peak_share: null,
      },
      rows,
    });
  } catch (err) { console.error('MARKET-SHARE ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;