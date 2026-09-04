// routes/analytics.js
// Supervisor analytics endpoints — all values computed from real data.
// Mounted at /api/analytics (see server.js).
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const XLSX       = require('xlsx');
const PdfPrinter = require('pdfmake');
const nodemailer = require('nodemailer');

// ── REVENUE & FLOAT ─────────────────────────────────────────────
// Real streams available today: brokerage (daily_trades.brokerage_earned),
// MTF interest (mtf_monthly.interest_earned) and estimated float income
// (latest ledger balance × fd_rate ÷ 365). Turnover-by-segment is also
// returned for the monthly trend chart.
router.get('/revenue-float', auth, async (req, res) => {
  try {
    const fdRow  = await pool.query(
      `SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`
    );
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const rng = await resolveRange(req);

    // Monthly revenue + turnover from the PERMANENT archive (client_monthly_summary), so past
    // months never drop to ₹0 once daily_trades is purged. Same output columns as before.
    const monthlyTrades = await pool.query(`
      SELECT month_year                                  AS month,
             COALESCE(SUM(brokerage),0)::float           AS brokerage,
             COALESCE(SUM(commission_earned),0)::float   AS commission,
             COALESCE(SUM(eq_cash_to),0)::float          AS eq_cash_to,
             COALESCE(SUM(eq_fo_to),0)::float            AS eq_fo_to,
             COALESCE(SUM(comm_to),0)::float             AS comm_to,
             COALESCE(SUM(opt_prem_to),0)::float         AS opt_prem_to,
             MAX(trade_days)::int                        AS trade_days
      FROM client_monthly_summary
      WHERE month_year BETWEEN to_char($1::date,'YYYY-MM') AND to_char($2::date,'YYYY-MM')
      GROUP BY month_year ORDER BY month_year
    `, [rng.from, rng.to]);

    // Per-month float = that month's AVERAGE daily total ledger balance × FD rate ÷ 365.
    // (Previously float was only attributed to the single latest ledger month, so a July
    //  report showed ₹0 when the newest ledger row was in August.)
    const monthlyFloat = await pool.query(`
      SELECT to_char(ledger_date,'YYYY-MM') AS month, AVG(daybal)::float AS avg_bal,
             COUNT(*)::int AS n_days
      FROM ( SELECT ledger_date, SUM(opening_balance) FILTER (WHERE opening_balance > 0) AS daybal FROM daily_ledger GROUP BY ledger_date ) d
      GROUP BY 1
    `);
    const floatByMonth = {}, floatDaysByMonth = {};
    monthlyFloat.rows.forEach(r => {
      floatByMonth[r.month] = Number(r.avg_bal) * (fdRate / 100) / 365;   // ₹/day rate
      floatDaysByMonth[r.month] = Number(r.n_days);                        // calendar days with ledger data
    });

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
             -- Float is earned only on CREDIT (positive) balances; debit clients owe us and
             -- contribute no idle float, so the float book sums positive balances only.
             COALESCE(SUM(opening_balance) FILTER (WHERE opening_balance > 0),0)::float AS total_ledger_balance,
             COUNT(*) FILTER (WHERE opening_balance > 0)::int  AS ledger_clients,
             COUNT(*) FILTER (WHERE opening_balance > 500000)::int AS clients_above_5l,
             COALESCE(AVG(opening_balance) FILTER (WHERE opening_balance > 0),0)::float AS avg_balance
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
      // Per-month float from that month's ledger; fall back to the latest-snapshot estimate
      // only if the month has no ledger rows at all.
      const floatIncomeDay = floatByMonth[r.month] != null ? floatByMonth[r.month]
                            : (r.month === ledgerMonth ? dailyFloatIncome : null);
      return {
        month: r.month,
        brokerage: Number(r.brokerage),
        commission: Number(r.commission),
        mtf_interest: mtf ? Number(mtf.mtf_interest) : 0,
        mtf_clients: mtf ? Number(mtf.mtf_clients) : 0,
        float_income_day: floatIncomeDay,
        // Float is earned every CALENDAR day the balance sits, not just trading days — so the
        // month total = ₹/day × ledger days in the month (matches the Company Dashboard, which
        // sums actual daily float). Using trade_days here understated float ~6× (5 vs 31 days).
        float_days: floatDaysByMonth[r.month] != null ? floatDaysByMonth[r.month] : Number(r.trade_days),
        eq_cash_to: Number(r.eq_cash_to),
        eq_fo_to: Number(r.eq_fo_to),
        comm_to: Number(r.comm_to),
        opt_prem_to: Number(r.opt_prem_to),
        trade_days: Number(r.trade_days),
      };
    });

    const latestMonth = monthly.length ? monthly[monthly.length - 1] : null;
    const mtdRevenue = latestMonth
      ? latestMonth.brokerage + latestMonth.commission + latestMonth.mtf_interest +
        (latestMonth.float_income_day ? latestMonth.float_income_day * latestMonth.float_days : 0)
      : 0;
    const ytdBrokerage  = monthly.reduce((s, m) => s + m.brokerage, 0);
    const ytdCommission = monthly.reduce((s, m) => s + m.commission, 0);
    const ytdMtf        = monthly.reduce((s, m) => s + m.mtf_interest, 0);
    const ytdFloat      = monthly.reduce((s, m) => s + (m.float_income_day ? m.float_income_day * m.float_days : 0), 0);

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
        ytd_revenue: ytdBrokerage + ytdCommission + ytdMtf + ytdFloat,
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

// ── REVENUE & FLOAT drill-downs ─────────────────────────────────
// The client lists behind the two Revenue & Float footnote counts. Each reuses
// the EXACT criteria of the count query above, so the list length matches the
// headline number the supervisor clicked.

// Idle-float leads: latest-ledger opening balance > ₹2L AND < 5 trading days this month.
router.get('/revenue-float/idle-float-leads', auth, async (req, res) => {
  try {
    const q = await pool.query(`
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
      SELECT bal.ucc, c.name, c.client_type,
             bal.opening_balance::float AS balance,
             COALESCE(td.days, 0)::int   AS trade_days,
             rm.rm_name
      FROM bal
      LEFT JOIN td ON td.ucc = bal.ucc
      LEFT JOIN clients c ON c.ucc = bal.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE COALESCE(td.days, 0) < 5
      ORDER BY bal.opening_balance DESC
      LIMIT 500
    `);
    res.json(q.rows);
  } catch (err) { console.error('IDLE-FLOAT LEADS ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// MTF-eligible: active equity F&O this month AND holdings > ₹2L AND not currently using MTF.
router.get('/revenue-float/mtf-eligible', auth, async (req, res) => {
  try {
    const q = await pool.query(`
      WITH fo AS (
        SELECT ucc, SUM(eq_fo_turnover)::float AS fo_to FROM daily_trades
        WHERE trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM daily_trades))
          AND eq_fo_turnover > 0
        GROUP BY ucc
      ),
      hold AS (
        SELECT ucc, total_holding_value::float AS holdings FROM holdings_summary
        WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
          AND total_holding_value > 200000
      ),
      using_mtf AS (
        SELECT DISTINCT ucc FROM mtf_monthly
        WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly)
      )
      SELECT fo.ucc, c.name, c.client_type, hold.holdings, fo.fo_to, rm.rm_name
      FROM fo JOIN hold ON hold.ucc = fo.ucc
      LEFT JOIN clients c ON c.ucc = fo.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE fo.ucc NOT IN (SELECT ucc FROM using_mtf)
      ORDER BY hold.holdings DESC
      LIMIT 500
    `);
    res.json(q.rows);
  } catch (err) { console.error('MTF-ELIGIBLE ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ── CONCENTRATION RISK ──────────────────────────────────────────
// Concentration of turnover (options premium), float (ledger balance) and
// MTF (interest) across the client base. Revenue concentration is measured on
// options-premium turnover because brokerage revenue is not yet loaded.
router.get('/concentration', auth, async (req, res) => {
  try {
    const pct = (a, b) => (Number(b) > 0 ? (Number(a) / Number(b)) * 100 : 0);

    const periodRow = await pool.query(`SELECT to_char(MAX(trade_date),'YYYY-MM') m, MAX(trade_date) d FROM daily_trades`);
    const fdRow = await pool.query(`SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const rng = await resolveRange(req);

    // Hybrid sourcing: whole months in the range from the permanent archive; the partial
    // boundary month from the recent daily_trades tier (kept from double-counting).
    const wholeCond = `(month_year||'-01')::date >= $1::date AND (date_trunc('month',(month_year||'-01')::date) + INTERVAL '1 month - 1 day')::date <= $2::date`;
    const partialCond = `to_char(trade_date,'YYYY-MM') NOT IN (SELECT month_year FROM client_monthly_summary WHERE ${wholeCond})`;

    // Per-client turnover + brokerage over the selected range, ranked; top 20 detail
    const perClient = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(opt_to) AS opt_to, SUM(total_to) AS total_to, SUM(brokerage) AS brokerage FROM (
          SELECT ucc, COALESCE(opt_prem_to,0) AS opt_to, COALESCE(turnover,0) AS total_to, COALESCE(brokerage,0) AS brokerage
          FROM client_monthly_summary cms WHERE ${wholeCond}
          UNION ALL
          SELECT ucc, COALESCE(options_premium_turnover,0), COALESCE(turnover,0), COALESCE(brokerage_earned,0)
          FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}
        ) u GROUP BY ucc
      ),
      ranked AS (
        SELECT ucc, opt_to, total_to, brokerage,
               -- NULLS LAST: clients who traded but have no options turnover sum to NULL;
               -- without this Postgres (DESC = NULLS FIRST) ranks them 1,2,3… on top.
               ROW_NUMBER() OVER (ORDER BY opt_to DESC NULLS LAST) AS rn,
               SUM(opt_to) OVER () AS grand
        FROM mtd
      )
      SELECT r.rn, r.ucc, r.opt_to::float, r.total_to::float, r.brokerage::float, r.grand::float,
             (SUM(r.opt_to) OVER (ORDER BY r.rn) / NULLIF(r.grand,0) * 100)::float AS cum_pct,
             c.name, c.client_type, rm.rm_name, c.assigned_rm_id
      FROM ranked r
      LEFT JOIN clients c ON c.ucc = r.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE r.rn <= 20 AND r.opt_to > 0
      ORDER BY r.rn
    `, [rng.from, rng.to]);

    // Turnover concentration buckets (cumulative %)
    const turnoverBuckets = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(opt_to) AS opt_to FROM (
          SELECT ucc, COALESCE(opt_prem_to,0) AS opt_to FROM client_monthly_summary cms WHERE ${wholeCond}
          UNION ALL
          SELECT ucc, COALESCE(options_premium_turnover,0) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}
        ) u GROUP BY ucc
      ),
      ranked AS (SELECT opt_to, ROW_NUMBER() OVER (ORDER BY opt_to DESC NULLS LAST) rn, SUM(opt_to) OVER () grand FROM mtd)
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
        -- Monthly display → permanent archive. opt_prem_to > 0 drops zero-options months.
        SELECT month_year AS mon, ucc, SUM(opt_prem_to) AS opt_to
        FROM client_monthly_summary WHERE opt_prem_to > 0 GROUP BY 1,2
      ),
      rr AS (
        SELECT mon, opt_to, ROW_NUMBER() OVER (PARTITION BY mon ORDER BY opt_to DESC NULLS LAST) rn,
               SUM(opt_to) OVER (PARTITION BY mon) grand
        FROM mm
      )
      SELECT mon,
             (COALESCE(SUM(opt_to) FILTER (WHERE rn<=10),0)/NULLIF(MAX(grand),0)*100)::float AS top10_pct,
             (COALESCE(SUM(opt_to) FILTER (WHERE rn<=50),0)/NULLIF(MAX(grand),0)*100)::float AS top50_pct
      FROM rr GROUP BY mon ORDER BY mon
    `);

    // Revenue-stream mix (doughnut) for the SELECTED RANGE. Previously this pinned itself to
    // "latest month" via MAX(trade_date); once a zero-turnover Aug-6 snapshot became the max
    // trade_date, the mix collapsed onto an empty August — brokerage/options ≈ 0 — which hid
    // options clearing (the primary revenue) and made MTF look like it dominated. Now every
    // stream is measured over the same [from,to] the rest of the page uses.
    const revMix = await pool.query(`
      WITH brok AS (
        SELECT (COALESCE((SELECT SUM(brokerage) FROM client_monthly_summary WHERE ${wholeCond}),0)
              + COALESCE((SELECT SUM(brokerage_earned) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}),0))::float AS v
      ),
      opt AS (
        SELECT (COALESCE((SELECT SUM(opt_prem_to) FROM client_monthly_summary WHERE ${wholeCond}),0)
              + COALESCE((SELECT SUM(options_premium_turnover) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}),0))::float AS v
      ),
      fl AS (
        SELECT COALESCE(SUM(opening_balance) FILTER (WHERE opening_balance > 0),0)::float AS bal FROM daily_ledger
        WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)
      ),
      mtf AS (
        SELECT COALESCE(SUM(interest_earned),0)::float AS v FROM mtf_monthly
        WHERE month_year BETWEEN to_char($1::date,'YYYY-MM') AND to_char($2::date,'YYYY-MM')
      )
      SELECT (SELECT v FROM brok) AS brokerage, (SELECT bal FROM fl) AS ledger_bal,
             (SELECT v FROM mtf) AS mtf_interest, (SELECT v FROM opt) AS opt_premium
    `, [rng.from, rng.to]);
    const rm = revMix.rows[0] || {};
    // Float income over the range = current ledger balance × FD rate ÷ 365 × calendar days in range.
    const rangeDays = Math.max(1, Math.round((new Date(rng.to) - new Date(rng.from)) / 86400000) + 1);
    const floatMonthIncome = Number(rm.ledger_bal || 0) * (fdRate / 100) / 365 * rangeDays;
    // Options clearing revenue = premium turnover × clearing rate (same 0.0005 basis used in MIS/reports).
    const OPT_CLEARING_RATE = 0.0005;
    const optClearing = Number(rm.opt_premium || 0) * OPT_CLEARING_RATE;

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
    // #16: Top 10 Exposures ranked by MTF BALANCE (the exposure). Columns wired:
    //   MTF Balance = avg_mtf_balance · % of Book = balance ÷ total book balance ·
    //   Interest/Day = monthly interest ÷ 30 · Margin Status = collateral coverage
    //   (latest post-haircut holdings value ÷ MTF balance).
    const mtfTop = await pool.query(`
      WITH latest AS (SELECT MAX(month_year) m FROM mtf_monthly),
      base AS (
        SELECT ucc, SUM(interest_earned) AS interest, SUM(avg_mtf_balance) AS bal
        FROM mtf_monthly WHERE month_year = (SELECT m FROM latest) GROUP BY ucc
      ),
      coll AS (
        SELECT ucc, total_holding_value AS collateral FROM holdings_summary
        WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
      ),
      ranked AS (
        SELECT ucc, interest, bal, ROW_NUMBER() OVER (ORDER BY bal DESC NULLS LAST) rn,
               SUM(interest) OVER () grand_int, SUM(bal) OVER () grand_bal
        FROM base
      )
      SELECT r.rn, r.ucc, r.interest::float, r.bal::float,
             r.grand_int::float, r.grand_bal::float, cl.collateral::float, c.name
      FROM ranked r
      LEFT JOIN clients c ON c.ucc = r.ucc
      LEFT JOIN coll cl ON cl.ucc = r.ucc
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
        { name: 'Eq Options clearing', value: optClearing },
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
      mtf_top: mtfTop.rows.map(r => {
        const bal = Number(r.bal || 0), interest = Number(r.interest || 0);
        const grandBal = Number(r.grand_bal || 0), collateral = Number(r.collateral || 0);
        const coverage = bal > 0 ? collateral / bal : null;
        // Margin status from collateral coverage: ≥1.5× healthy · 1–1.5× adequate · <1× shortfall.
        const margin_status = coverage == null ? 'No exposure'
                            : coverage >= 1.5 ? 'Healthy'
                            : coverage >= 1.0 ? 'Adequate' : 'Shortfall';
        return {
          rank: Number(r.rn), ucc: r.ucc, name: r.name || r.ucc,
          balance: bal, interest,
          pct_of_book: grandBal > 0 ? (bal / grandBal) * 100 : 0,   // % of MTF book by balance
          interest_per_day: interest / 30,
          collateral, coverage: coverage == null ? null : +coverage.toFixed(2),
          margin_status,
        };
      }),
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
    const EQ   = `product_type = 'FO' AND option_type IN ('CE','PE')`;
    const COMM = `product_type = 'CO' AND option_type IN ('CE','PE')`;

    const rng = await resolveRange(req, 'trades');

    const eqDaily = await pool.query(`
      SELECT trade_date::text AS d,
             SUM(traded_value)::float          AS eq_opt_to,
             COUNT(DISTINCT ucc)::int          AS clients,
             -- Weekly index expiries fall on Tuesday (NSE) and Thursday (BSE) only.
             BOOL_OR(expiry_date = trade_date AND EXTRACT(DOW FROM trade_date) IN (2,4)) AS is_expiry,
             SUM(trade_qty)::float             AS qty
      FROM trades WHERE ${EQ} AND trade_date::date BETWEEN $1 AND $2
      GROUP BY trade_date ORDER BY trade_date
    `, [rng.from, rng.to]);
    const commDaily = await pool.query(`
      SELECT trade_date::text AS d,
             SUM(traded_value)::float AS comm_opt_to,
             COUNT(DISTINCT ucc)::int AS clients
      FROM trades WHERE ${COMM} AND trade_date::date BETWEEN $1 AND $2
      GROUP BY trade_date ORDER BY trade_date
    `, [rng.from, rng.to]);
    const topClients = await pool.query(`
      WITH eqopt AS (
        -- lots = number of contracts, stored per trade (trade_qty is now also lots).
        SELECT ucc, traded_value, COALESCE(lots, 0) AS lots FROM trades
        WHERE ${EQ} AND trade_date >= date_trunc('month', (SELECT MAX(trade_date) FROM trades))
      )
      SELECT e.ucc, SUM(e.traded_value)::float AS eq_opt_to, SUM(e.lots)::float AS lots,
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
    const expiryPremiumPct = (nonExp.length && mean(nonExp, r => r.to) > 0 && mean(expDays, r => r.to) > 0)
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

    // Always include the real prior calendar month so the MoM comparison is genuine
    // even when the selected range only covers the current month.
    {
      const keys = Object.keys(months).sort();
      // Fall back to the current month if there's no data AND no usable range (e.g. a freshly
      // reset DB) — otherwise latestKey is null and .split() throws (OPTIONS ERROR).
      const _now = new Date();
      const latestKey = (keys.length ? keys[keys.length - 1] : ym(rng.to))
        || `${_now.getUTCFullYear()}-${String(_now.getUTCMonth() + 1).padStart(2, '0')}`;
      const [ly, lmo] = latestKey.split('-').map(Number);
      const pd = new Date(Date.UTC(ly, lmo - 2, 1));
      const priorKey = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!months[priorKey]) {
        const ps = `${priorKey}-01`;
        const pe = await pool.query(`
          SELECT trade_date::text AS d, SUM(traded_value)::float AS to_, COUNT(DISTINCT ucc)::int AS cli
          FROM trades WHERE ${EQ} AND trade_date >= $1::date AND trade_date < ($1::date + interval '1 month')
          GROUP BY trade_date`, [ps]);
        const pc = await pool.query(`
          SELECT trade_date::text AS d, SUM(traded_value)::float AS to_, COUNT(DISTINCT ucc)::int AS cli
          FROM trades WHERE ${COMM} AND trade_date >= $1::date AND trade_date < ($1::date + interval '1 month')
          GROUP BY trade_date`, [ps]);
        pe.rows.forEach(r => { const k = ym(r.d); (months[k] = months[k] || { eq_to: 0, eq_days: 0, eq_cli: 0, comm_to: 0, comm_days: 0, comm_cli: 0 }); months[k].eq_to += Number(r.to_); months[k].eq_days += 1; months[k].eq_cli += Number(r.cli); });
        pc.rows.forEach(r => { const k = ym(r.d); (months[k] = months[k] || { eq_to: 0, eq_days: 0, eq_cli: 0, comm_to: 0, comm_days: 0, comm_cli: 0 }); months[k].comm_to += Number(r.to_); months[k].comm_days += 1; months[k].comm_cli += Number(r.cli); });
      }
    }

    const monthKeys = Object.keys(months).sort();
    // Options clearing (commission) rates — clearing = options turnover × rate% ÷ 100.
    const optRateRows = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('rate_eq_options','rate_comm_options')`);
    let rEqOpt = 0, rCommOpt = 0;
    optRateRows.rows.forEach(r => {
      if (r.key === 'rate_eq_options')   rEqOpt   = parseFloat(r.value) || 0;
      if (r.key === 'rate_comm_options') rCommOpt = parseFloat(r.value) || 0;
    });

    // Baseline for the OLDEST displayed month's MoM: the eq-options per-day turnover of the
    // calendar month just before it. Not shown as a row — only used so the first month in the
    // table (e.g. July, when August's baseline pulled it in) still gets its own MoM %.
    let oldestPrevPerDay = null;
    if (monthKeys.length) {
      const [oy, omo] = monthKeys[0].split('-').map(Number);
      const bd = new Date(Date.UTC(oy, omo - 2, 1));
      const bs = `${bd.getUTCFullYear()}-${String(bd.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const bq = await pool.query(`
        SELECT COALESCE(SUM(traded_value),0)::float AS to_, COUNT(DISTINCT trade_date)::int AS days
        FROM trades WHERE ${EQ} AND trade_date >= $1::date AND trade_date < ($1::date + interval '1 month')`, [bs]);
      const bto = Number(bq.rows[0]?.to_ || 0), bdays = Number(bq.rows[0]?.days || 0);
      oldestPrevPerDay = bdays ? bto / bdays : null;
    }

    const monthly = monthKeys.map((k, i) => {
      const m = months[k];
      const eqPerDay   = m.eq_days ? m.eq_to / m.eq_days : 0;
      const commPerDay = m.comm_days ? m.comm_to / m.comm_days : 0;
      const prev = i > 0 ? months[monthKeys[i - 1]] : null;
      // i>0 → compare to the previous displayed month; i===0 (oldest) → compare to the fetched
      // baseline month, so the first row shows a real MoM instead of "—".
      const prevPerDay = (i > 0 && prev && prev.eq_days) ? prev.eq_to / prev.eq_days
                        : (i === 0 ? oldestPrevPerDay : null);
      const eqClrDay   = eqPerDay   * rEqOpt   / 100;   // equity-options clearing ₹/day
      const commClrDay = commPerDay * rCommOpt / 100;   // commodity-options clearing ₹/day
      return {
        month: mLabel(k),
        eq_opt_to_cr: +(eqPerDay / 1e7).toFixed(2),
        eq_opt_clients: m.eq_days ? Math.round(m.eq_cli / m.eq_days) : 0,
        comm_opt_to_cr: +(commPerDay / 1e7).toFixed(2),
        comm_opt_clients: m.comm_days ? Math.round(m.comm_cli / m.comm_days) : 0,
        eq_opt_clearing: Math.round(eqClrDay),
        comm_opt_clearing: Math.round(commClrDay),
        total_options_rev: Math.round(eqClrDay + commClrDay),
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

    // Expiry-day analysis. No monthly/weekly split — monthly and weekly expiries
    // fall on the same Tue/Thu days, so every expiry is treated the same.
    const expiry_analysis = expDays.map(r => ({
      date: dLabel(r.d),
      eq_opt_to_cr: +(r.to / 1e7).toFixed(1),
      // Guard: an expiry date with zero options turnover (e.g. a commodity-only
      // expiry, or an expiry with no eq-options trades) would compute -100% here.
      // Show 0 in that case instead of a misleading -100.
      vs_mtd_pct: (avgTo > 0 && r.to > 0) ? +(((r.to - avgTo) / avgTo) * 100).toFixed(0) : 0,
      clients: r.clients,
      clients_vs_mtd_pct: (avgCli > 0 && r.clients > 0) ? +(((r.clients - avgCli) / avgCli) * 100).toFixed(0) : 0,
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
    // Unpivot the permanent archive's segment turnovers into the same 5 segments the raw-trade
    // SEGCASE produced — using the clean commodity split (comm_opt_to). Reused across the queries.
    const SEGVALS = `(VALUES
      ('Equity Cash',       cms.eq_cash_to),
      ('Equity Options',    cms.opt_prem_to - cms.comm_opt_to),
      ('Equity Futures',    cms.eq_fo_to),
      ('Commodity Options', cms.comm_opt_to),
      ('Commodity Futures', cms.comm_to - cms.comm_opt_to)
    ) AS seg(segment, val)`;
    const acq = await pool.query(`
      WITH latest AS (SELECT MAX(ledger_date) d FROM daily_ledger),
      led AS (SELECT ucc, opening_balance FROM daily_ledger WHERE ledger_date = (SELECT d FROM latest)),
      traded AS (SELECT DISTINCT ucc FROM client_monthly_summary)
      SELECT to_char(c.account_open_date,'YYYY-MM')       AS mon,
             COUNT(*)::int                                AS new_accounts,
             COUNT(*) FILTER (WHERE t.ucc IS NOT NULL)::int AS trading,
             COALESCE(SUM(led.opening_balance),0)::float   AS ledger_bal
      FROM clients c
      LEFT JOIN traded t ON t.ucc = c.ucc
      LEFT JOIN led     ON led.ucc = c.ucc
      -- Monthly report: the range selects which MONTHS appear, but each month's count is the
      -- FULL month (not truncated to the range's days). This keeps the acquisition cards on the
      -- same population as the full-month new-client segment distribution below, so the "N new
      -- clients trading" card can never be smaller than a per-segment count in that distribution.
      WHERE c.account_open_date IS NOT NULL
        AND to_char(c.account_open_date,'YYYY-MM') BETWEEN to_char($1::date,'YYYY-MM') AND to_char($2::date,'YYYY-MM')
      GROUP BY 1 ORDER BY 1 DESC
    `, [rng.from, rng.to]);
    const maxOpenRow = await pool.query(`SELECT MAX(account_open_date) d FROM clients`);
    const SEGCASE = `CASE
      WHEN product_type = 'CM' THEN 'Equity Cash'
      WHEN product_type = 'FO' AND option_type IN ('CE','PE') THEN 'Equity Options'
      WHEN product_type = 'FO' THEN 'Equity Futures'
      WHEN product_type = 'CO' AND option_type IN ('CE','PE') THEN 'Commodity Options'
      WHEN product_type = 'CO' THEN 'Commodity Futures'
      ELSE 'Other' END`;
    const seg = await pool.query(`
      SELECT cms.month_year AS mon, seg.segment,
             COUNT(DISTINCT cms.ucc) FILTER (WHERE seg.val > 0)::int AS clients,
             MAX(cms.trade_days)::int AS days,
             COALESCE(SUM(seg.val),0)::float AS turnover
      FROM client_monthly_summary cms
      CROSS JOIN LATERAL ${SEGVALS}
      GROUP BY cms.month_year, seg.segment ORDER BY cms.month_year, seg.segment
    `);

    // Per opening-month turnover by the new-client cohort (all their trades, all segments) — the
    // "traded turnover (₹Cr)" volume figure shown beside new accounts / new clients trading.
    const acqTOq = await pool.query(`
      WITH newc AS (SELECT ucc, to_char(account_open_date,'YYYY-MM') AS omon FROM clients WHERE account_open_date IS NOT NULL)
      SELECT n.omon AS mon, COALESCE(SUM(cms.turnover),0)::float AS turnover
      FROM client_monthly_summary cms JOIN newc n ON n.ucc = cms.ucc GROUP BY 1
    `);
    const acqTO = {}; acqTOq.rows.forEach(r => { acqTO[r.mon] = Number(r.turnover); });
    // Per opening-month: new-client cohort members who TRADED IN THE CURRENT MONTH + their
    // current-month turnover. "Current month" = the month of the selected range's END (rng.to),
    // so it FOLLOWS the date filter (Jun–Aug -> August; All -> the latest data month). This drives
    // the Last-3M cards: accounts opened in the last 3 months that are actively trading in that
    // month — distinct from `trading` above (traded ever).
    // TURNOVER FLOOR: a client counts as "trading" only if their current-month turnover exceeds
    // TRADED_MIN_TURNOVER rupees. This trims the tail of micro-turnover accounts so the count
    // reconciles with the business team's sheet (e.g. Aug Jun–Aug cohort 1,209 -> 1,115; the ~94
    // excluded carry ₹0.0005 Cr combined). Set to 0 to count every client with any turnover.
    const TRADED_MIN_TURNOVER = 104;
    const acqCurQ = await pool.query(`
      WITH cur AS (SELECT date_trunc('month', $1::date)::date AS m0),
      newc AS (SELECT ucc, to_char(account_open_date,'YYYY-MM') AS omon FROM clients WHERE account_open_date IS NOT NULL),
      pc AS (   -- per client: current-month turnover, keep only those above the floor
        SELECT n.omon, d.ucc, SUM(d.turnover) AS turnover
        FROM newc n
        JOIN daily_trades d ON d.ucc = n.ucc
        CROSS JOIN cur
        WHERE d.trade_date >= cur.m0 AND d.trade_date < (cur.m0 + INTERVAL '1 month')
        GROUP BY n.omon, d.ucc
        HAVING SUM(d.turnover) > $2
      )
      SELECT omon AS mon,
             COUNT(*)::int                    AS trading_cur,
             COALESCE(SUM(turnover),0)::float AS turnover_cur
      FROM pc GROUP BY omon
    `, [rng.to, TRADED_MIN_TURNOVER]);
    const acqCur = {};
    acqCurQ.rows.forEach(r => { acqCur[r.mon] = { trading: Number(r.trading_cur), turnover: Number(r.turnover_cur) }; });
    // Per opening-month × segment: new-client trading count + turnover — drives the table-view
    // segment filter (scopes "New clients trading" and "Turnover" to the chosen segment).
    const acqSegQ = await pool.query(`
      WITH newc AS (SELECT ucc, to_char(account_open_date,'YYYY-MM') AS omon FROM clients WHERE account_open_date IS NOT NULL)
      SELECT n.omon AS mon, seg.segment,
             COUNT(DISTINCT cms.ucc) FILTER (WHERE seg.val > 0)::int AS trading,
             COALESCE(SUM(seg.val),0)::float AS turnover
      FROM client_monthly_summary cms JOIN newc n ON n.ucc = cms.ucc
      CROSS JOIN LATERAL ${SEGVALS}
      GROUP BY n.omon, seg.segment
    `);
    const acqSeg = {};
    acqSegQ.rows.forEach(r => { (acqSeg[r.mon] ||= {})[r.segment] = { trading: Number(r.trading), turnover: Number(r.turnover) }; });
    // Total client count — matches the Company Dashboard's total (COUNT(*) clients).
    const totClients = (await pool.query(`SELECT COUNT(*)::int AS n FROM clients`)).rows[0].n;

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;

    const rowsAsc = acq.rows.slice().reverse().map(r => ({
      key: r.mon, label: mLabel(r.mon),
      new_accounts: Number(r.new_accounts), trading: Number(r.trading), ledger_bal: Number(r.ledger_bal),
      turnover: acqTO[r.mon] || 0,
      // current-month activity for this opening cohort (used by the Last-3M cards)
      trading_cur: acqCur[r.mon]?.trading || 0,
      turnover_cur: acqCur[r.mon]?.turnover || 0,
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
        WITH newc AS (SELECT ucc FROM clients WHERE to_char(account_open_date,'YYYY-MM') = $1)
        SELECT seg.segment,
               COUNT(DISTINCT cms.ucc) FILTER (WHERE seg.val > 0)::int AS clients,
               MAX(cms.trade_days)::int AS days,
               COALESCE(SUM(seg.val),0)::float AS turnover
        FROM client_monthly_summary cms JOIN newc n ON n.ucc = cms.ucc
        CROSS JOIN LATERAL ${SEGVALS}
        GROUP BY seg.segment
      `, [featured.key]);
      newClientSeg = nq.rows.map(r => ({
        segment: r.segment, clients: Number(r.clients),
        vol_cr_day: Number(r.days) ? +(Number(r.turnover) / Number(r.days) / 1e7).toFixed(2) : 0,
      }));
    }

    res.json({
      new_client_segments: newClientSeg,
      total_clients: totClients,
      acq_seg: acqSeg,
      meta: {
        featured_month: featured ? featured.label : null,
        prior_month: prior ? prior.label : null,
        featured_partial: !!partial,
        as_of: fmtFullDate(maxOpenRow.rows[0]?.d),
        cur_month: mLabel(ymOf(rng.to)),   // current month = the selected range's end month
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
    // Date-driven: $1 (from) = the activity cutoff — a client is "inactive" if their last trade
    // is before it (i.e. no trade since `from`). $2 (to) = the "as of" anchor — holdings, the
    // day-count and the duration bands are all measured to it. Default range (from the frontend)
    // is the last 30 days ending at the latest data date, so the headline matches the old
    // "no trade in last 30 days" behaviour; the picker lets the user move both ends.
    const rng = await resolveRange(req);
    const P = [rng.from, rng.to];   // $1 = from (cutoff), $2 = to (as-of)
    const HOLD = `SELECT ucc, total_holding_value FROM holdings_summary
                  WHERE holding_date = (SELECT MAX(holding_date) FROM holdings_summary WHERE holding_date <= $2::date)
                    AND total_holding_value > 0`;

    const summary = await pool.query(`
      WITH h AS (${HOLD})
      SELECT
        COUNT(*) FILTER (WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%') AND (c.last_trade_date IS NULL OR c.last_trade_date < $1::date))::int AS inactive_total,
        COUNT(*) FILTER (WHERE (c.last_trade_date IS NULL OR c.last_trade_date < $1::date) AND h.ucc IS NOT NULL)::int AS inactive_with_dp,
        COALESCE(SUM(h.total_holding_value) FILTER (WHERE (c.last_trade_date IS NULL OR c.last_trade_date < $1::date) AND h.ucc IS NOT NULL),0)::float AS inactive_dp_value,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL)::int AS never_traded,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL AND h.ucc IS NOT NULL)::int AS never_with_dp,
        COUNT(*) FILTER (WHERE c.last_trade_date IS NULL AND c.account_open_date > $2::date - 90)::int AS never_recent
      FROM clients c LEFT JOIN h ON h.ucc = c.ucc
      WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%')   -- exclude ONLY closed accounts; Suspended clients stay in the Inactive & DP counts
    `, P);

    const bands = await pool.query(`
      WITH h AS (${HOLD}),
      b AS (
        SELECT
          CASE WHEN c.last_trade_date IS NULL                        THEN 'Never traded'
               WHEN c.last_trade_date >= $2::date - 90               THEN '30–90 days'
               WHEN c.last_trade_date >= $2::date - 180              THEN '90–180 days'
               WHEN c.last_trade_date >= $2::date - 365              THEN '180–365 days'
               ELSE '365+ days' END AS band,
          (h.ucc IS NOT NULL) AS has_dp
        FROM clients c LEFT JOIN h ON h.ucc = c.ucc
        WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%') AND (c.last_trade_date IS NULL OR c.last_trade_date < $1::date)
      )
      SELECT band, COUNT(*) FILTER (WHERE has_dp)::int AS with_dp,
             COUNT(*) FILTER (WHERE NOT has_dp)::int AS no_dp
      FROM b GROUP BY band
    `, P);

    const byType = await pool.query(`
      WITH h AS (${HOLD})
      -- NRI = UCC begins with 'N' (same rule as Client Analytics / Daily MIS). The client_type
      -- column is unloaded, so reading it flattened everyone to RI and hid the ~1,100 NRI holders.
      SELECT CASE WHEN UPPER(c.ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END AS client_type, COUNT(*)::int AS n
      FROM clients c JOIN h ON h.ucc = c.ucc
      WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%') AND (c.last_trade_date IS NULL OR c.last_trade_date < $1::date)
      GROUP BY 1 ORDER BY n DESC
    `, P);

    const valueDist = await pool.query(`
      WITH h AS (${HOLD}),
      inact AS (
        SELECT h.total_holding_value AS v
        FROM clients c JOIN h ON h.ucc = c.ucc
        WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%') AND (c.last_trade_date IS NULL OR c.last_trade_date < $1::date)
      )
      SELECT
        -- #19: DP holding-value ranges → ₹1–10L, 10–25L, 25L–1Cr, 1–5Cr, Above 5Cr
        COUNT(*) FILTER (WHERE v >= 100000  AND v < 1000000)::int    AS b1,
        COUNT(*) FILTER (WHERE v >= 1000000 AND v < 2500000)::int    AS b2,
        COUNT(*) FILTER (WHERE v >= 2500000 AND v < 10000000)::int   AS b3,
        COUNT(*) FILTER (WHERE v >= 10000000 AND v < 50000000)::int  AS b4,
        COUNT(*) FILTER (WHERE v >= 50000000)::int                   AS b5
      FROM inact
    `, P);

    const priority = await pool.query(`
      WITH h AS (${HOLD})
      SELECT c.ucc, c.name, CASE WHEN UPPER(c.ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END AS client_type,
             c.last_trade_date, h.total_holding_value::float AS holding_value,
             c.account_open_date, rm.rm_name,
             ($2::date - c.last_trade_date) AS days_inactive
      FROM clients c
      JOIN h ON h.ucc = c.ucc
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      -- Same inactivity rule as the cards / bands / doughnut: never-traded (NULL last_trade_date)
      -- OR last trade before the cutoff. The old "IS NOT NULL" excluded all never-traded DP holders,
      -- which is almost the entire list — so it showed empty while the cards counted 6,982.
      WHERE (LOWER(COALESCE(c.status,'')) NOT LIKE 'clos%') AND (c.last_trade_date IS NULL OR c.last_trade_date < $1::date)
      ORDER BY h.total_holding_value DESC
      LIMIT 30
    `, P);

    const s = summary.rows[0] || {};
    const bandOrder = ['30–90 days', '90–180 days', '180–365 days', '365+ days', 'Never traded'];
    const bandMap = {}; bands.rows.forEach(r => { bandMap[r.band] = r; });
    const vd = valueDist.rows[0] || {};

    res.json({
      meta: { basis: 'no trade since the From date', as_of: fmtFullDate(rng.to), range: rangeMeta(rng) },
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
        { bucket: '₹1–10L',    count: Number(vd.b1 || 0) },
        { bucket: '₹10–25L',   count: Number(vd.b2 || 0) },
        { bucket: '₹25L–1Cr',  count: Number(vd.b3 || 0) },
        { bucket: '₹1–5Cr',    count: Number(vd.b4 || 0) },
        { bucket: 'Above ₹5Cr', count: Number(vd.b5 || 0) },
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
        -- Unassigned-pool counts exclude already-mapped clients (stale lead_pool rows), so the
        -- KPI cards match the list, which now filters out clients with an assigned RM.
        (SELECT COUNT(*) FROM lead_pool lp WHERE lp.status='unassigned' AND lp.lead_score > 80
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.ucc=lp.ucc AND c.assigned_rm_id IS NOT NULL))::int        AS score_gt80,
        (SELECT COUNT(*) FROM lead_pool lp WHERE lp.status='unassigned' AND lp.lead_score >= 60 AND lp.lead_score <= 80
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.ucc=lp.ucc AND c.assigned_rm_id IS NOT NULL))::int        AS score_60_80,
        (SELECT COUNT(*) FROM lead_pool lp WHERE lp.status='unassigned' AND lp.lead_score >= 60
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.ucc=lp.ucc AND c.assigned_rm_id IS NOT NULL))::int        AS score_gt60,
        (SELECT COUNT(*) FROM lead_pool WHERE status IN ('assigned','pending','opted_in'))::int                      AS in_pipeline,
        (SELECT COALESCE(SUM(capacity),0) FROM rm_master)::int
          - (SELECT COUNT(*) FROM clients WHERE assigned_rm_id IS NOT NULL)::int                                     AS capacity_available,
        COALESCE((SELECT rm_capacity_limit FROM pipeline_settings ORDER BY id LIMIT 1), 100)::int                    AS capacity_limit,
        (SELECT COUNT(*) FROM lead_pool lp WHERE lp.status='unassigned'
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.ucc=lp.ucc AND c.assigned_rm_id IS NOT NULL))::int        AS pool_total
    `);

    const rows = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(turnover) AS to_mtd
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
        -- Guard against stale lead_pool rows: a client who has since been mapped to an RM
        -- (assigned_rm_id set) must never appear in the Unmapped Pool, even if their lead_pool
        -- status wasn't flipped from 'unassigned'.
        AND c.assigned_rm_id IS NULL
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
    // Auto-generate AI unmap suggestions: high-churn (score ≥ 7) mapped clients that don't
    // already have an unmap request. Inserts only NEW candidates, so a rejected/approved one
    // never reappears. Wrapped so a schema hiccup can't break the page — it just shows none.
    await pool.query(`
      INSERT INTO unmap_requests (ucc, type, reason, mapped_since, status, created_at)
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT c.ucc, 'ai',
             'High churn risk (score ' || ROUND(sc.churn_risk_score)::text || '/10) with limited recent activity',
             c.mapped_at, 'pending', NOW()
      FROM clients c JOIN sc ON sc.ucc = c.ucc
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 7
        AND NOT EXISTS (SELECT 1 FROM unmap_requests ur WHERE ur.ucc = c.ucc)
    `).catch(e => console.error('AI unmap suggestion generation skipped:', e.message));

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

// RM-initiated unmap request — writes a pending row that appears in the "RM-requested"
// section of the Unmap Requests page for a supervisor to approve/reject. The client stays
// mapped until a supervisor approves. requested_by records who raised it.
router.post('/unmap-requests/request', auth, async (req, res) => {
  const { ucc, reason } = req.body || {};
  if (!ucc) return res.status(400).json({ message: 'ucc is required' });
  try {
    // Client must exist and currently be mapped to an RM.
    const c = await pool.query(
      `SELECT ucc, assigned_rm_id, mapped_at FROM clients WHERE ucc = $1`, [ucc]
    );
    if (c.rowCount === 0) return res.status(404).json({ message: 'Client not found' });
    if (!c.rows[0].assigned_rm_id) return res.status(400).json({ message: 'Client is not mapped to any RM' });

    // De-dupe: never stack a second pending request for the same client (RM- or AI-raised).
    const existing = await pool.query(
      `SELECT id FROM unmap_requests WHERE ucc = $1 AND (status = 'pending' OR status IS NULL) LIMIT 1`, [ucc]
    );
    if (existing.rowCount > 0) return res.json({ ok: true, already: true });

    await pool.query(
      `INSERT INTO unmap_requests (ucc, type, reason, mapped_since, status, created_at, requested_by)
       VALUES ($1, 'rm', $2, $3, 'pending', NOW(), $4)`,
      [ucc, (reason && reason.trim()) || 'RM requested unmap', c.rows[0].mapped_at, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('UNMAP-REQUEST ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── COMPANY DASHBOARD ───────────────────────────────────────────
router.get('/company-dashboard', auth, async (req, res) => {
  try {
    const fdRow = await pool.query(`SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);

    // ── Date range (#13/#35 date-range filter) ──────────────────
    const rng = await resolveRange(req);
    const fromD = rng.from, toD = rng.to;

    // Hybrid sourcing for the range aggregates: a calendar month that the range covers IN FULL
    // is read from the PERMANENT archive (client_monthly_summary), so it survives the 90-day
    // purge; only partial boundary months (range starts/ends mid-month) are read from the recent
    // daily_trades tier. wholeCond = "this cms month is fully inside [from,to]"; partialCond =
    // "this daily_trades row's month is NOT fully covered" (so it isn't double-counted).
    const wholeCond = `(month_year||'-01')::date >= $1::date AND (date_trunc('month',(month_year||'-01')::date) + INTERVAL '1 month - 1 day')::date <= $2::date`;
    const partialCond = `to_char(trade_date,'YYYY-MM') NOT IN (SELECT month_year FROM client_monthly_summary WHERE ${wholeCond})`;

    const totals = await pool.query(`
      SELECT COUNT(*)::int AS total_clients,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NOT NULL)::int AS mapped,
             COUNT(*) FILTER (WHERE assigned_rm_id IS NULL)::int AS unmapped
      FROM clients
    `);
    // Company revenue over the range = brokerage + commission (per-client, trade-attributable)
    // + MTF interest + float income (company-level). The mapped/unmapped split is on the
    // trade-attributable part (brokerage + commission).
    const rev = await pool.query(`
      WITH rng AS (
        SELECT ucc, SUM(rev) AS brok_comm FROM (
          SELECT ucc, (COALESCE(brokerage,0) + COALESCE(commission_earned,0)) AS rev
          FROM client_monthly_summary WHERE ${wholeCond}
          UNION ALL
          SELECT ucc, (COALESCE(brokerage_earned,0) + COALESCE(commission_earned,0)) AS rev
          FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}
        ) u GROUP BY ucc
      )
      SELECT COALESCE(SUM(brok_comm),0)::float AS trade_rev,
             COALESCE(SUM(brok_comm) FILTER (WHERE c.assigned_rm_id IS NOT NULL),0)::float AS mapped_rev,
             COALESCE(SUM(brok_comm) FILTER (WHERE c.assigned_rm_id IS NULL),0)::float AS unmapped_rev,
             ((SELECT COALESCE(SUM(d),0) FROM (SELECT MAX(trade_days) AS d FROM client_monthly_summary WHERE ${wholeCond} GROUP BY month_year) w)
              + (SELECT COUNT(DISTINCT trade_date) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}))::int AS trading_days
      FROM rng LEFT JOIN clients c ON c.ucc = rng.ucc
    `, [fromD, toD]);
    // MTF interest over the range (each period's interest spread across its inclusive days).
    const mtfRange = await pool.query(`
      SELECT COALESCE(SUM(interest / (GREATEST((to_date - from_date),0)+1)),0)::float AS mtf
      FROM mtf_interest, LATERAL generate_series(from_date, to_date, interval '1 day') gs
      WHERE gs::date BETWEEN $1 AND $2
    `, [fromD, toD]);
    // Float income over the range = Σ (each day's total ledger balance × FD rate ÷ 365), with
    // CARRY-FORWARD: a day with no ledger of its own (weekend / holiday) inherits the most recent
    // prior ledger balance so interest accrues 7 days a week. Bounded by the latest ledger date —
    // never projects a balance past the last data actually held.
    const floatRange = await pool.query(`
      WITH daybal AS (SELECT ledger_date, SUM(opening_balance) FILTER (WHERE opening_balance > 0) AS bal FROM daily_ledger GROUP BY ledger_date)
      SELECT COALESCE(SUM(
               (SELECT db.bal FROM daybal db WHERE db.ledger_date <= gs::date ORDER BY db.ledger_date DESC LIMIT 1)
             ),0)::float AS bal_sum
      FROM generate_series($1::date, LEAST($2::date, (SELECT MAX(ledger_date) FROM daily_ledger)), interval '1 day') gs
    `, [fromD, toD]);
    const _tradeRev = Number(rev.rows[0]?.trade_rev || 0);
    const _mtfRev   = Number(mtfRange.rows[0]?.mtf || 0);
    const _floatRev = Number(floatRange.rows[0]?.bal_sum || 0) * (fdRate / 100) / 365;
    const _totalRev = _tradeRev + _mtfRev + _floatRev;
    const pipeline = await pool.query(`
      SELECT (SELECT COUNT(*) FROM lead_pool WHERE status IN ('assigned','pending','opted_in'))::int AS active_leads,
             (SELECT COUNT(*) FROM lead_pool WHERE status IN ('pending','opted_in'))::int AS pending_approvals
    `);
    const churn = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT COUNT(*) FILTER (WHERE sc.churn_risk_score >= 6)::int AS churn_high,
             COUNT(DISTINCT c.assigned_rm_id) FILTER (WHERE sc.churn_risk_score >= 6)::int AS rms_affected
      FROM clients c JOIN sc ON sc.ucc = c.ucc WHERE c.assigned_rm_id IS NOT NULL
    `);
    const rmTable = await pool.query(`
      WITH rng AS (
        SELECT ucc, SUM(brok) AS brok, SUM(clr) AS clr, SUM(turnover) AS turnover FROM (
          SELECT ucc, COALESCE(brokerage,0) AS brok, COALESCE(commission_earned,0) AS clr, COALESCE(turnover,0) AS turnover
          FROM client_monthly_summary WHERE ${wholeCond}
          UNION ALL
          SELECT ucc, COALESCE(brokerage_earned,0) AS brok, COALESCE(commission_earned,0) AS clr, COALESCE(turnover,0) AS turnover
          FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}
        ) u GROUP BY ucc
      )
      SELECT rm.id, rm.rm_name, rm.capacity,
             COUNT(c.ucc)::int AS clients,
             COALESCE(SUM(rng.brok),0)::float AS brokerage,
             COALESCE(SUM(rng.clr),0)::float  AS clearing,
             COALESCE(SUM(rng.turnover),0)::float AS turnover,
             (SELECT COUNT(*) FROM lead_pool lp WHERE lp.assigned_rm_id = rm.id AND lp.status IN ('assigned','pending','opted_in'))::int AS leads
      FROM rm_master rm
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN rng ON rng.ucc = c.ucc
      GROUP BY rm.id, rm.rm_name, rm.capacity
      ORDER BY brokerage DESC, clients DESC
    `, [fromD, toD]);
    // Per-RM MTF interest (prorated to the range) and float income — so the dashboard RM revenue
    // shows all four streams (brokerage + clearing + MTF + float), matching RM Performance's total.
    const rmMtf = await pool.query(`
      SELECT c.assigned_rm_id AS rm_id,
             SUM(mi.interest / (GREATEST((mi.to_date - mi.from_date),0)+1)
                 * (LEAST(mi.to_date,$2::date) - GREATEST(mi.from_date,$1::date) + 1))::float AS mtf
      FROM clients c JOIN mtf_interest mi ON mi.ucc = c.ucc
      WHERE c.assigned_rm_id IS NOT NULL AND mi.from_date <= $2::date AND mi.to_date >= $1::date
      GROUP BY c.assigned_rm_id
    `, [fromD, toD]).catch(() => ({ rows: [] }));
    const rmFloat = await pool.query(`
      SELECT c.assigned_rm_id AS rm_id, SUM(GREATEST(dl.opening_balance,0))::float AS bal
      FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
      WHERE dl.ledger_date BETWEEN $1 AND $2 AND c.assigned_rm_id IS NOT NULL
      GROUP BY c.assigned_rm_id
    `, [fromD, toD]).catch(() => ({ rows: [] }));
    const rmMtfBy = {}; rmMtf.rows.forEach(r => { rmMtfBy[r.rm_id] = Number(r.mtf) || 0; });
    const rmFloatBy = {}; rmFloat.rows.forEach(r => { rmFloatBy[r.rm_id] = (Number(r.bal) || 0) * (fdRate / 100) / 365; });
    // Total company turnover over the range (all clients, mapped + unmapped) — denominator for #14
    const totalTurnover = await pool.query(`
      SELECT
        COALESCE((SELECT SUM(turnover) FROM client_monthly_summary WHERE ${wholeCond}),0)::float
        + COALESCE((SELECT SUM(turnover) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}),0)::float
        AS total
    `, [fromD, toD]);
    const pendingTop = await pool.query(`
      SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name, rm.rm_name, lp.lead_score::float AS lead_score, lp.status
      FROM lead_pool lp LEFT JOIN clients c ON c.ucc = lp.ucc LEFT JOIN rm_master rm ON lp.assigned_rm_id = rm.id
      WHERE lp.status IN ('pending','opted_in') ORDER BY lp.lead_score DESC NULLS LAST LIMIT 3
    `);
    // ── DAILY revenue trend, strictly within the selected range (one point per calendar day) ──
    // Streams per day: brokerage + clearing commission (daily_trades), MTF interest spread to daily,
    // and float income (carry-forward ledger balance × FD rate ÷ 365). No all-time total — the
    // chart reflects exactly the chosen range, and weekends now carry float via the carry-forward.
    const bcDaily = await pool.query(`
      SELECT to_char(trade_date,'YYYY-MM-DD') AS d,
             COALESCE(SUM(brokerage_earned),0)::float  AS brok,
             COALESCE(SUM(commission_earned),0)::float AS comm
      FROM daily_trades WHERE trade_date BETWEEN $1 AND $2 GROUP BY 1
    `, [fromD, toD]);
    const mtfDaily = await pool.query(`
      SELECT to_char(gs::date,'YYYY-MM-DD') AS d,
             SUM(interest / (GREATEST((to_date - from_date),0)+1))::float AS mtf
      FROM mtf_interest, LATERAL generate_series(from_date, to_date, interval '1 day') gs
      WHERE gs::date BETWEEN $1 AND $2 GROUP BY 1
    `, [fromD, toD]);
    const floatDaily = await pool.query(`
      WITH daybal AS (SELECT ledger_date, SUM(opening_balance) FILTER (WHERE opening_balance > 0) AS bal FROM daily_ledger GROUP BY ledger_date)
      SELECT to_char(gs::date,'YYYY-MM-DD') AS d,
             (SELECT db.bal FROM daybal db WHERE db.ledger_date <= gs::date ORDER BY db.ledger_date DESC LIMIT 1)::float AS bal
      FROM generate_series($1::date, LEAST($2::date, (SELECT MAX(ledger_date) FROM daily_ledger)), interval '1 day') gs
    `, [fromD, toD]);
    const ledgerSnap = await pool.query(`
      SELECT (SELECT MAX(ledger_date) FROM daily_ledger) AS d,
             COALESCE(SUM(opening_balance) FILTER (WHERE opening_balance > 0),0)::float AS bal
      FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)
    `);
    // Trade date = latest business date with REAL trades (turnover > 0). Ignores brokerage-only
    // rows and holdings-snapshot rows so the header shows the true last trading day.
    const latestTrade = await pool.query(`SELECT MAX(trade_date) d FROM daily_trades WHERE turnover > 0`);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;
    const fmtFull = (d) => { if (!d) return null; const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };

    const bcByDay = {}; bcDaily.rows.forEach(r => { bcByDay[r.d] = r; });
    const mtfByDay = {}; mtfDaily.rows.forEach(r => { mtfByDay[r.d] = Number(r.mtf) || 0; });
    const flByDay  = {}; floatDaily.rows.forEach(r => { flByDay[r.d] = (Number(r.bal) || 0) * (fdRate / 100) / 365; });

    // One row per calendar day in the range (weekends included — they carry float now).
    const trendData = [];
    { let cur = new Date(fromD + 'T00:00:00Z'); const end = new Date(toD + 'T00:00:00Z');
      let guard = 0;
      while (cur <= end && guard++ < 400) {
        const key = cur.toISOString().slice(0, 10);
        trendData.push({
          month: `${cur.getUTCDate()} ${MON[cur.getUTCMonth()]}`,   // x-axis label (the day)
          date: key,
          Brokerage: Number(bcByDay[key]?.brok || 0),
          Commission: Number(bcByDay[key]?.comm || 0),
          MTF: mtfByDay[key] || 0,
          Other: flByDay[key] || 0,                                  // float income for the day
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    const latestMonthKey = latestTrade.rows[0]?.d ? ymOf(latestTrade.rows[0].d) : null;

    res.json({
      meta: {
        latest_month: latestMonthKey ? mLabel(latestMonthKey) : null,
        data_as_of: fmtFull(latestTrade.rows[0]?.d),
        range: rangeMeta(rng, rev.rows[0].trading_days),
      },
      totals: totals.rows[0],
      revenue: {
        total_rev: _totalRev,
        trade_rev: _tradeRev,
        mtf_rev: _mtfRev,
        float_rev: _floatRev,
        mapped_rev: Number(rev.rows[0].mapped_rev),
        unmapped_rev: Number(rev.rows[0].unmapped_rev),
        trading_days: Number(rev.rows[0].trading_days),
        avg_rev_per_day: (rev.rows[0].trading_days ? _totalRev / rev.rows[0].trading_days : 0),
      },
      company_turnover: Number(totalTurnover.rows[0]?.total || 0),
      pipeline: pipeline.rows[0],
      churn: churn.rows[0],
      rm_table: rmTable.rows.map(r => ({
        rm_name: r.rm_name, clients: Number(r.clients),
        // Revenue = all four streams (brokerage + clearing + MTF + float), matching RM Performance.
        revenue: Number(r.brokerage) + Number(r.clearing) + (rmMtfBy[r.id] || 0) + (rmFloatBy[r.id] || 0),
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
               SUM(turnover) AS to_mtd
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
      if (!r.last_trade_date) return 'Inactive';                                            // never traded → Inactive
      if (new Date(r.last_trade_date) >= new Date(Date.now() - 30 * 864e5)) return 'Active'; // traded in last 30 days
      return 'Dormant';                                                                     // traded before, now quiet
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
        assigned_at: r.assigned_at, expires_at: r.assignment_expires_at, reassigns: null, // no per-lead reassignment history stored
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
      -- A client who has OPTED IN (given consent) must ALWAYS appear for approval,
      -- regardless of lead score — otherwise a low-score but consented client is stuck
      -- invisible forever. The score gate only applies to un-consented 'pending' leads.
      WHERE lp.status = 'opted_in'
         OR (lp.status = 'pending' AND lp.lead_score >= 50)
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
        // mapped_at = COALESCE(existing, NOW()) so the FIRST mapping date is preserved and
        // powers the RM Impact pre/post analysis. (Column added via migration; see notes.)
        `UPDATE clients SET assigned_rm_id = $1, is_mapped = true, mapped_at = COALESCE(mapped_at, NOW()), updated_at = NOW() WHERE ucc = $2`,
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
    // All six are independent — run them concurrently instead of one-after-another.
    const [meta, agg, churn, churnCount, topLeads, unmap] = await Promise.all([
      pool.query(`
        SELECT (SELECT COUNT(*) FROM clients)::int AS total_clients,
               (SELECT COUNT(*) FROM rm_master)::int AS rms,
               (SELECT MAX(score_date) FROM ai_scores) AS last_run
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE assigned_rm_id IS NOT NULL)::int AS mapped,
               (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned')::int AS pool,
               (SELECT COUNT(*) FROM lead_pool WHERE status='unassigned' AND lead_score >= 60)::int AS pool_gt60
        FROM clients
      `),
      pool.query(`
        WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
        SELECT c.ucc, c.name, rm.rm_name, sc.churn_risk_score::float AS churn, c.last_trade_date
        FROM clients c JOIN sc ON sc.ucc = c.ucc LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
        WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 5
        ORDER BY sc.churn_risk_score DESC LIMIT 5
      `),
      pool.query(`
        WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
        SELECT COUNT(*)::int AS n FROM clients c JOIN sc ON sc.ucc = c.ucc
        WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 6
      `),
      pool.query(`
        SELECT lp.ucc, COALESCE(lp.client_name, c.name) AS name, lp.lead_score::float AS lead_score, lp.lead_type,
               c.last_trade_date, COALESCE(h.total_holding_value,0)::float AS holdings
        FROM lead_pool lp
        LEFT JOIN clients c ON c.ucc = lp.ucc
        LEFT JOIN holdings_summary h ON h.ucc = lp.ucc AND h.holding_date = (SELECT MAX(holding_date) FROM holdings_summary)
        WHERE lp.status = 'unassigned'
        ORDER BY lp.lead_score DESC NULLS LAST LIMIT 5
      `),
      pool.query(`
        WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
        SELECT c.ucc, c.name, rm.rm_name, c.last_trade_date, sc.churn_risk_score::float AS churn
        FROM clients c JOIN sc ON sc.ucc = c.ucc LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
        WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 7
        ORDER BY sc.churn_risk_score DESC LIMIT 5
      `),
    ]);

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

// Paginated churn-risk list — ALL mapped clients flagged at churn risk (score ≥ 6), so the
// AI Insights churn panel can page through every one (not just the top 5).
router.get('/ai-insights/churn', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;
    const totalQ = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT COUNT(*)::int AS n FROM clients c JOIN sc ON sc.ucc = c.ucc
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 6
    `);
    const rowsQ = await pool.query(`
      WITH sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC)
      SELECT c.ucc, c.name, rm.rm_name, sc.churn_risk_score::float AS churn, c.last_trade_date
      FROM clients c JOIN sc ON sc.ucc = c.ucc LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id IS NOT NULL AND sc.churn_risk_score >= 6
      ORDER BY sc.churn_risk_score DESC, c.ucc
      LIMIT $1 OFFSET $2
    `, [pageSize, offset]);
    const monthsSince = (d) => { if (!d) return null; return Math.floor((Date.now() - new Date(d).getTime()) / (30 * 864e5)); };
    const churnSignal = (d) => { const m = monthsSince(d); return m == null ? 'No recent trade' : `No trade ${m} month${m === 1 ? '' : 's'}`; };
    const total = totalQ.rows[0].n;
    res.json({
      page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)),
      rows: rowsQ.rows.map(r => ({ ucc: r.ucc, name: r.name || r.ucc, rm_name: r.rm_name || '—',
        signal: churnSignal(r.last_trade_date), score: Math.round(Number(r.churn)) })),
    });
  } catch (err) {
    console.error('AI-INSIGHTS-CHURN ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── RM PERFORMANCE ──────────────────────────────────────────────
// ── RM MONTHLY TARGETS ──────────────────────────────────────────
// Per-RM, per-month revenue targets. Read from the rm_targets table (create it in the DB —
// see the migration SQL). Powers the "Target%" column on RM Performance (Rev over range ÷ target).

// GET /analytics/rm-targets?month=YYYY-MM → every RM with its target for that month (0 if unset).
router.get('/rm-targets', auth, async (req, res) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month)
      : ((await pool.query(`SELECT to_char(MAX(trade_date),'YYYY-MM') m FROM daily_trades`)).rows[0]?.m
        || new Date().toISOString().slice(0, 7));
    const q = await pool.query(`
      SELECT rm.id AS rm_id, rm.rm_name, COALESCE(t.target_amount, 0)::float AS target
      FROM rm_master rm
      LEFT JOIN rm_targets t ON t.rm_id = rm.id AND t.month_year = $1
      ORDER BY rm.rm_name`, [month]);
    res.json({ month, rows: q.rows });
  } catch (err) { console.error('RM-TARGETS GET ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// POST /analytics/rm-targets  { rm_id, month_year, target } → upsert one RM's monthly target.
router.post('/rm-targets', auth, async (req, res) => {
  try {
    if (!['supervisor', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Supervisor/admin only' });
    const rmId   = parseInt(req.body?.rm_id, 10);
    const month  = String(req.body?.month_year || '');
    const target = Number(req.body?.target);
    if (!rmId || !/^\d{4}-\d{2}$/.test(month) || isNaN(target) || target < 0)
      return res.status(400).json({ message: 'Need rm_id, month_year (YYYY-MM) and a non-negative target.' });
    await pool.query(`
      INSERT INTO rm_targets (rm_id, month_year, target_amount, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (rm_id, month_year) DO UPDATE SET target_amount = EXCLUDED.target_amount, updated_at = NOW()
    `, [rmId, month, target]);
    res.json({ success: true });
  } catch (err) { console.error('RM-TARGETS POST ERROR:', err.message); res.status(500).json({ message: err.message }); }
});

router.get('/rm-performance', auth, async (req, res) => {
  try {
    const FY = `make_date(CASE WHEN EXTRACT(MONTH FROM (SELECT MAX(trade_date) FROM daily_trades))::int >= 4
                    THEN EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int
                    ELSE EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int - 1 END, 4, 1)`;

    // ── Date range (#35 date-range filter) — the "MTD" revenue/turnover figures
    // are scoped to the selected range (default = current month, same as before).
    const rng = await resolveRange(req);
    const fromD = rng.from, toD = rng.to;

    const rows = await pool.query(`
      WITH mtd AS (
        SELECT c.assigned_rm_id AS rm_id,
               SUM(dt.brokerage_earned + COALESCE(dt.commission_earned,0)) AS rev,   -- brokerage + clearing
               SUM(dt.turnover) AS turnover
        FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc
        WHERE dt.trade_date::date BETWEEN $1 AND $2 AND c.assigned_rm_id IS NOT NULL
        GROUP BY c.assigned_rm_id
      ),
      ytd AS (
        SELECT c.assigned_rm_id AS rm_id, SUM(dt.brokerage_earned + COALESCE(dt.commission_earned,0)) AS rev
        FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc
        WHERE dt.trade_date >= ${FY} AND c.assigned_rm_id IS NOT NULL
        GROUP BY c.assigned_rm_id
      ),
      sc AS (SELECT DISTINCT ON (ucc) ucc, churn_risk_score FROM ai_scores ORDER BY ucc, score_date DESC),
      tgt AS (
        -- Target for the selected range = sum of the monthly targets for every month it spans.
        SELECT rm_id, SUM(target_amount) AS target FROM rm_targets
        WHERE month_year >= to_char($1::date,'YYYY-MM') AND month_year <= to_char($2::date,'YYYY-MM')
        GROUP BY rm_id
      )
      SELECT rm.id, rm.rm_name,
             COUNT(c.ucc)::int AS clients,
             COALESCE(MAX(mtd.rev),0)::float AS mtd_rev,
             COALESCE(MAX(mtd.turnover),0)::float AS mtd_turnover,
             COALESCE(MAX(ytd.rev),0)::float AS ytd_rev,
             COALESCE(MAX(tgt.target),0)::float AS target,
             (SELECT COUNT(*) FROM lead_pool lp WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id)::int AS leads,
             (SELECT COUNT(*) FROM lead_pool lp WHERE COALESCE(lp.assigned_rm_id, lp.assigned_to_rm) = rm.id AND lp.status='mapped')::int AS converted,
             (SELECT COUNT(*) FROM interactions i WHERE i.rm_id = rm.id AND i.interaction_date::date BETWEEN $1 AND $2)::int AS interactions,
             COUNT(c.ucc) FILTER (WHERE sc.churn_risk_score >= 6)::int AS churn_alerts
      FROM rm_master rm
      LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      LEFT JOIN sc ON sc.ucc = c.ucc
      LEFT JOIN mtd ON mtd.rm_id = rm.id
      LEFT JOIN ytd ON ytd.rm_id = rm.id
      LEFT JOIN tgt ON tgt.rm_id = rm.id
      GROUP BY rm.id, rm.rm_name
      ORDER BY mtd_turnover DESC, clients DESC
    `, [fromD, toD]);

    const monthly = await pool.query(`
      SELECT to_char(dt.trade_date,'YYYY-MM') AS mon, rm.rm_name,
             SUM(dt.turnover)::float AS turnover
      FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc JOIN rm_master rm ON c.assigned_rm_id = rm.id
      GROUP BY 1, 2 ORDER BY 1
    `);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;
    const fmtFull = (d) => { if (!d) return null; const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };

    // As-of date + trading days in the selected range (for the header + range label)
    const latestTrade = await pool.query(`SELECT MAX(trade_date) d FROM daily_trades`);
    const tdays = await pool.query(
      `SELECT COUNT(DISTINCT trade_date)::int n FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2`,
      [fromD, toD]
    );

    // ── All-four revenue: the mtd/ytd CTEs above already carry brokerage + clearing. Add each
    // RM's MTF interest + Float income (range and fiscal-YTD) so "Rev (range)", "YTD Rev" and
    // "Target%" use Brokerage + MTF + Float + Clearing, matching the other RM tables. ──
    const fyRow = await pool.query(`SELECT to_char(${FY},'YYYY-MM-DD') AS fy`);
    const fyStart = fyRow.rows[0].fy;
    const FD_RATE_SQL = `SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`;
    const [fdRow, mtfRange, mtfFy, flRange, flFy] = await Promise.all([
      pool.query(FD_RATE_SQL),
      // MTF interest prorated to days overlapping the selected range.
      pool.query(`SELECT c.assigned_rm_id AS rm_id,
                    SUM(mi.interest / (GREATEST((mi.to_date - mi.from_date),0)+1)
                        * (LEAST(mi.to_date,$2::date) - GREATEST(mi.from_date,$1::date) + 1))::float AS mtf
                  FROM clients c JOIN mtf_interest mi ON mi.ucc = c.ucc
                  WHERE c.assigned_rm_id IS NOT NULL AND mi.from_date <= $2::date AND mi.to_date >= $1::date
                  GROUP BY c.assigned_rm_id`, [fromD, toD]).catch(() => ({ rows: [] })),
      // MTF interest since FY start (prorated from the FY start where a period straddles it).
      pool.query(`SELECT c.assigned_rm_id AS rm_id,
                    SUM(mi.interest / (GREATEST((mi.to_date - mi.from_date),0)+1)
                        * ((mi.to_date - GREATEST(mi.from_date,$1::date)) + 1))::float AS mtf
                  FROM clients c JOIN mtf_interest mi ON mi.ucc = c.ucc
                  WHERE c.assigned_rm_id IS NOT NULL AND mi.to_date >= $1::date
                  GROUP BY c.assigned_rm_id`, [fyStart]).catch(() => ({ rows: [] })),
      // Float base for the range and for FY-to-date.
      pool.query(`SELECT c.assigned_rm_id AS rm_id, SUM(GREATEST(dl.opening_balance,0))::float AS bal
                  FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
                  WHERE dl.ledger_date BETWEEN $1 AND $2 AND c.assigned_rm_id IS NOT NULL
                  GROUP BY c.assigned_rm_id`, [fromD, toD]).catch(() => ({ rows: [] })),
      pool.query(`SELECT c.assigned_rm_id AS rm_id, SUM(GREATEST(dl.opening_balance,0))::float AS bal
                  FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
                  WHERE dl.ledger_date >= $1 AND c.assigned_rm_id IS NOT NULL
                  GROUP BY c.assigned_rm_id`, [fyStart]).catch(() => ({ rows: [] })),
    ]);
    const fd = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const mapBy = (q, f) => { const m = {}; q.rows.forEach(r => { m[r.rm_id] = f(r); }); return m; };
    const mtfRangeBy = mapBy(mtfRange, r => Number(r.mtf) || 0);
    const mtfFyBy    = mapBy(mtfFy,    r => Number(r.mtf) || 0);
    const flRangeBy  = mapBy(flRange,  r => (Number(r.bal) || 0) * (fd / 100) / 365);
    const flFyBy     = mapBy(flFy,     r => (Number(r.bal) || 0) * (fd / 100) / 365);

    const rmRows = rows.rows.map(r => {
      const id = Number(r.id);
      const mtdRev = Number(r.mtd_rev) + (mtfRangeBy[id] || 0) + (flRangeBy[id] || 0);
      const ytdRev = Number(r.ytd_rev) + (mtfFyBy[id] || 0) + (flFyBy[id] || 0);
      return {
        rm_id: id, rm_name: r.rm_name, clients: Number(r.clients), mtd_rev: mtdRev, mtd_turnover: Number(r.mtd_turnover),
        ytd_rev: ytdRev, target: Number(r.target), leads: Number(r.leads), converted: Number(r.converted),
        target_pct: Number(r.target) > 0 ? (mtdRev / Number(r.target)) * 100 : null,
        conv_pct: Number(r.leads) > 0 ? (Number(r.converted) / Number(r.leads)) * 100 : 0,
        interactions: Number(r.interactions), churn_alerts: Number(r.churn_alerts),
      };
    });

    // Monthly chart pivot: {month, [rmName]: turnoverCr}
    const rmNames = [...new Set(monthly.rows.map(r => r.rm_name))];
    const byMonth = {};
    monthly.rows.forEach(r => {
      const k = mLabel(r.mon);
      (byMonth[k] = byMonth[k] || { month: k });
      // Send RAW turnover (rupees); the frontend formats adaptively (₹K/L/Cr). Rounding to
      // 2-decimal crores here flattened sub-₹1L months to 0.00 (invisible bars) and made
      // clearly different months (e.g. ₹68k vs ₹1.01L) render as equal-height bars.
      byMonth[k][r.rm_name] = Math.round(Number(r.turnover));
    });
    const chart = Object.values(byMonth);

    const teamRev = rmRows.reduce((s, r) => s + r.mtd_rev, 0);
    const teamConverted = rmRows.reduce((s, r) => s + r.converted, 0);
    const best = rmRows[0] || null;
    const worst = rmRows.length > 1 ? rmRows[rmRows.length - 1] : null;

    res.json({
      meta: {
        as_of: fmtFull(latestTrade.rows[0]?.d),
        range: rangeMeta(rng, tdays.rows[0]?.n),
      },
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

// ============================================================================
// RM PERFORMANCE — Table 1: per-RM revenue breakdown by source, over a range.
// Columns: Brokerage / MTF / Float / Clearing / Total Revenue / Mapped / Traded.
// Revenue = Brokerage + MTF interest + Float income + Clearing (all four), matching
// the Daily MIS income lines. Own date-range filter (?range= / ?from&to).
// ============================================================================
router.get('/rm-revenue-breakdown', auth, async (req, res) => {
  try {
    const rng = await resolveRange(req);
    const fromD = rng.from, toD = rng.to;
    const FD_RATE_SQL = `SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`;

    const [base, mtfQ, floatQ, fdRow, tdays, latest] = await Promise.all([
      // Brokerage + clearing + traded-client count from daily_trades, plus mapped-client count.
      pool.query(`
        SELECT rm.id AS rm_id, rm.rm_name,
               COUNT(DISTINCT c.ucc) FILTER (WHERE c.is_mapped)::int AS mapped_clients,
               COALESCE(br.brokerage,0)::float AS brokerage,
               COALESCE(br.clearing,0)::float  AS clearing,
               COALESCE(br.traded_clients,0)::int AS traded_clients
        FROM rm_master rm
        LEFT JOIN clients c ON c.assigned_rm_id = rm.id
        LEFT JOIN (
          SELECT c2.assigned_rm_id AS rm_id,
                 SUM(dt.brokerage_earned) AS brokerage,
                 SUM(dt.commission_earned) AS clearing,
                 COUNT(DISTINCT dt.ucc) AS traded_clients
          FROM clients c2 JOIN daily_trades dt ON dt.ucc = c2.ucc
          WHERE dt.trade_date::date BETWEEN $1 AND $2 AND c2.assigned_rm_id IS NOT NULL
          GROUP BY c2.assigned_rm_id
        ) br ON br.rm_id = rm.id
        GROUP BY rm.id, rm.rm_name, br.brokerage, br.clearing, br.traded_clients
        ORDER BY rm.rm_name
      `, [fromD, toD]),
      // MTF interest, prorated to the days each mtf_interest period overlaps the range.
      pool.query(`
        SELECT c.assigned_rm_id AS rm_id,
               SUM(mi.interest / (GREATEST((mi.to_date - mi.from_date),0)+1)
                   * (LEAST(mi.to_date,$2::date) - GREATEST(mi.from_date,$1::date) + 1))::float AS mtf
        FROM clients c JOIN mtf_interest mi ON mi.ucc = c.ucc
        WHERE c.assigned_rm_id IS NOT NULL AND mi.from_date <= $2::date AND mi.to_date >= $1::date
        GROUP BY c.assigned_rm_id
      `, [fromD, toD]).catch(() => ({ rows: [] })),
      // Float base = sum of each client's positive daily ledger balance across the range.
      pool.query(`
        SELECT c.assigned_rm_id AS rm_id, SUM(GREATEST(dl.opening_balance,0))::float AS bal
        FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
        WHERE dl.ledger_date BETWEEN $1 AND $2 AND c.assigned_rm_id IS NOT NULL
        GROUP BY c.assigned_rm_id
      `, [fromD, toD]).catch(() => ({ rows: [] })),
      pool.query(FD_RATE_SQL),
      pool.query(`SELECT COUNT(DISTINCT trade_date)::int n FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2`, [fromD, toD]),
      pool.query(`SELECT MAX(trade_date) d FROM daily_trades`),
    ]);

    const fd = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const mtfBy = {}; mtfQ.rows.forEach(r => { mtfBy[r.rm_id] = Number(r.mtf) || 0; });
    const floatBy = {}; floatQ.rows.forEach(r => { floatBy[r.rm_id] = (Number(r.bal) || 0) * (fd / 100) / 365; });

    const rows = base.rows.map(r => {
      const brokerage = Number(r.brokerage), clearing = Number(r.clearing);
      const mtf = mtfBy[r.rm_id] || 0, float = floatBy[r.rm_id] || 0;
      return { rm_id: Number(r.rm_id), rm_name: r.rm_name,
        brokerage, mtf, float, clearing, total: brokerage + mtf + float + clearing,
        mapped_clients: Number(r.mapped_clients), traded_clients: Number(r.traded_clients) };
    });
    const sum = (f) => rows.reduce((s, x) => s + f(x), 0);
    const totals = { brokerage: sum(x => x.brokerage), mtf: sum(x => x.mtf), float: sum(x => x.float),
      clearing: sum(x => x.clearing), total: sum(x => x.total),
      mapped_clients: sum(x => x.mapped_clients), traded_clients: sum(x => x.traded_clients) };

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const fmtFull = (d) => { if (!d) return null; const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
    res.json({ meta: { as_of: fmtFull(latest.rows[0]?.d), range: rangeMeta(rng, tdays.rows[0]?.n) }, rows, totals });
  } catch (err) {
    console.error('RM-REVENUE-BREAKDOWN ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// RM PERFORMANCE — Table 2: one RM's month-by-month performance (RM dropdown).
// Columns: Month / Revenue / Target / % Achieved / Mapped / Traded / % Traded /
// Leads Conv% / Interactions / Unmapped. Revenue = all four sources (as Table 1).
// Summary rows appended: MTD (current month), "For day" (latest trading day),
// "FY the year" (fiscal-year-to-date). No date-range filter — only the RM picker.
// ============================================================================
router.get('/rm-monthly', auth, async (req, res) => {
  try {
    const rmsQ = await pool.query(`SELECT id AS rm_id, rm_name FROM rm_master ORDER BY rm_name`);
    const rms = rmsQ.rows.map(r => ({ rm_id: Number(r.rm_id), rm_name: r.rm_name }));

    // "All RMs" is the default: aggregate across every RM. A numeric rm_id scopes to one RM.
    const raw = String(req.query.rm_id ?? '').trim().toLowerCase();
    let rmId = parseInt(req.query.rm_id, 10);
    const allMode = raw === '' || raw === 'all' || !rms.some(r => r.rm_id === rmId);
    if (allMode) rmId = null;
    const rmName = allMode ? 'All RMs' : (rms.find(r => r.rm_id === rmId)?.rm_name || null);

    // Condition fragments swap between one-RM ($1) and all-RMs (assigned to any RM).
    const cCond   = allMode ? 'c.assigned_rm_id IS NOT NULL' : 'c.assigned_rm_id = $1';
    const iCond   = allMode ? 'i.rm_id IS NOT NULL' : 'i.rm_id = $1';
    const mapCond = allMode ? 'assigned_rm_id IS NOT NULL' : 'assigned_rm_id = $1';
    const ldCond  = allMode ? 'COALESCE(assigned_rm_id, assigned_to_rm) IS NOT NULL' : 'COALESCE(assigned_rm_id, assigned_to_rm) = $1';
    const tgtCond = allMode ? 'TRUE' : 'rm_id = $1';
    const P = allMode ? [] : [rmId];

    const FD_RATE_SQL = `SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`;
    const FY_SQL = `SELECT to_char(make_date(CASE WHEN EXTRACT(MONTH FROM (SELECT MAX(trade_date) FROM daily_trades))::int >= 4
                      THEN EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int
                      ELSE EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int - 1 END, 4, 1),'YYYY-MM') AS fy`;

    const [tr, mtfQ, flQ, intQ, tgtQ, mapQ, leadsQ, fdRow, latestQ, fyQ, fdTrade, fdFloat, fdInt, fyTraded, fdMtf] = await Promise.all([
      // Per-month brokerage + clearing + traded clients from the PERMANENT archive (won't gap on purge).
      pool.query(`SELECT cms.month_year AS mon,
                         SUM(cms.brokerage)::float AS brokerage,
                         SUM(cms.commission_earned)::float AS clearing,
                         COUNT(DISTINCT cms.ucc) FILTER (WHERE cms.turnover > 0)::int AS traded
                  FROM clients c JOIN client_monthly_summary cms ON cms.ucc = c.ucc
                  WHERE ${cCond} GROUP BY 1`, P),
      pool.query(`SELECT mm.month_year AS mon, SUM(mm.interest_earned)::float AS mtf
                  FROM clients c JOIN mtf_monthly mm ON mm.ucc = c.ucc
                  WHERE ${cCond} GROUP BY 1`, P).catch(() => ({ rows: [] })),
      pool.query(`SELECT to_char(dl.ledger_date,'YYYY-MM') AS mon, SUM(GREATEST(dl.opening_balance,0))::float AS bal
                  FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
                  WHERE ${cCond} GROUP BY 1`, P).catch(() => ({ rows: [] })),
      pool.query(`SELECT to_char(i.interaction_date,'YYYY-MM') AS mon, COUNT(*)::int AS interactions
                  FROM interactions i WHERE ${iCond} GROUP BY 1`, P).catch(() => ({ rows: [] })),
      pool.query(`SELECT month_year AS mon, SUM(target_amount)::float AS target FROM rm_targets WHERE ${tgtCond} GROUP BY 1`, P).catch(() => ({ rows: [] })),
      pool.query(`SELECT to_char(mapped_at,'YYYY-MM') AS mon, COUNT(*)::int AS n
                  FROM clients WHERE ${mapCond} AND is_mapped = true AND mapped_at IS NOT NULL GROUP BY 1`, P),
      pool.query(`SELECT COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE status='mapped')::int AS converted
                  FROM lead_pool WHERE ${ldCond}`, P).catch(() => ({ rows: [{ leads: 0, converted: 0 }] })),
      pool.query(FD_RATE_SQL),
      pool.query(`SELECT MAX(trade_date) AS d, to_char(MAX(trade_date),'YYYY-MM') AS ym FROM daily_trades`),
      pool.query(FY_SQL),
      // "For day" — latest trading day
      pool.query(`SELECT SUM(dt.brokerage_earned)::float AS brokerage, SUM(dt.commission_earned)::float AS clearing,
                         COUNT(DISTINCT dt.ucc)::int AS traded
                  FROM clients c JOIN daily_trades dt ON dt.ucc = c.ucc
                  WHERE ${cCond} AND dt.trade_date = (SELECT MAX(trade_date) FROM daily_trades)`, P),
      pool.query(`SELECT SUM(GREATEST(dl.opening_balance,0))::float AS bal
                  FROM clients c JOIN daily_ledger dl ON dl.ucc = c.ucc
                  WHERE ${cCond} AND dl.ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)`, P).catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*)::int AS interactions FROM interactions i
                  WHERE ${iCond} AND i.interaction_date::date = (SELECT MAX(trade_date) FROM daily_trades)`, P).catch(() => ({ rows: [{ interactions: 0 }] })),
      // FY distinct traded clients — from the permanent archive (month-level, purge-proof).
      pool.query(`SELECT COUNT(DISTINCT cms.ucc)::int AS traded
                  FROM clients c JOIN client_monthly_summary cms ON cms.ucc = c.ucc
                  WHERE ${cCond} AND cms.turnover > 0 AND cms.month_year >= to_char(make_date(
                        CASE WHEN EXTRACT(MONTH FROM (SELECT MAX(trade_date) FROM daily_trades))::int >= 4
                             THEN EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int
                             ELSE EXTRACT(YEAR FROM (SELECT MAX(trade_date) FROM daily_trades))::int - 1 END, 4, 1),'YYYY-MM')`, P),
      // "For day" MTF = the day's accrued MTF interest (each mtf_interest period spread evenly across
      // its inclusive days), for the latest trading day — so the For-day revenue includes all 4 streams.
      pool.query(`SELECT COALESCE(SUM(mi.interest / (GREATEST((mi.to_date - mi.from_date),0)+1)),0)::float AS mtf
                  FROM clients c JOIN mtf_interest mi ON mi.ucc = c.ucc
                  WHERE ${cCond}
                    AND mi.from_date <= (SELECT MAX(trade_date) FROM daily_trades)
                    AND mi.to_date   >= (SELECT MAX(trade_date) FROM daily_trades)`, P).catch(() => ({ rows: [{ mtf: 0 }] })),
    ]);

    const fd = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const floatIncome = (bal) => (Number(bal) || 0) * (fd / 100) / 365;
    const brokBy = {}, clrBy = {}, tradedBy = {}, mtfBy = {}, flBy = {}, intBy = {}, tgtBy = {};
    tr.rows.forEach(r => { brokBy[r.mon] = Number(r.brokerage) || 0; clrBy[r.mon] = Number(r.clearing) || 0; tradedBy[r.mon] = Number(r.traded) || 0; });
    mtfQ.rows.forEach(r => { mtfBy[r.mon] = Number(r.mtf) || 0; });
    flQ.rows.forEach(r => { flBy[r.mon] = Number(r.bal) || 0; });
    intQ.rows.forEach(r => { intBy[r.mon] = Number(r.interactions) || 0; });
    tgtQ.rows.forEach(r => { tgtBy[r.mon] = Number(r.target) || 0; });

    // Cumulative mapped-client count as of each month-end.
    const mapNew = {}; mapQ.rows.forEach(r => { mapNew[r.mon] = Number(r.n) || 0; });
    const totalMapped = Object.values(mapNew).reduce((s, n) => s + n, 0);
    const mappedAsOf = (mon) => Object.keys(mapNew).filter(m => m <= mon).reduce((s, m) => s + mapNew[m], 0);

    const leads = Number(leadsQ.rows[0]?.leads || 0), converted = Number(leadsQ.rows[0]?.converted || 0);
    const convPct = leads > 0 ? (converted / leads) * 100 : null;
    const unmapped = Math.max(leads - converted, 0);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mLabel = (m) => `${MON[+m.split('-')[1] - 1]} '${m.split('-')[0].slice(2)}`;

    // Month universe = every month with any signal, ascending.
    const months = [...new Set([...Object.keys(brokBy), ...Object.keys(mtfBy), ...Object.keys(flBy), ...Object.keys(intBy), ...Object.keys(tgtBy)])].sort();

    const mkRow = (mon, label, kind) => {
      const brokerage = brokBy[mon] || 0, clearing = clrBy[mon] || 0, mtf = mtfBy[mon] || 0, float = floatIncome(flBy[mon] || 0);
      const revenue = brokerage + clearing + mtf + float;
      const target = tgtBy[mon] || 0;
      const traded = tradedBy[mon] || 0;
      const mapped = mappedAsOf(mon);
      return { label, kind, revenue, target, pct_achieved: target > 0 ? (revenue / target) * 100 : null,
        mapped, traded, pct_traded: mapped > 0 ? (traded / mapped) * 100 : null,
        conv_pct: convPct, interactions: intBy[mon] || 0, unmapped };
    };

    const curMon = latestQ.rows[0]?.ym || (months[months.length - 1] || null);

    // For day = latest trading day.
    const b = Number(fdTrade.rows[0]?.brokerage || 0), c = Number(fdTrade.rows[0]?.clearing || 0);
    const fdFl = floatIncome(fdFloat.rows[0]?.bal || 0);
    const fdMtfVal = Number(fdMtf.rows[0]?.mtf || 0);
    const fdTradedN = Number(fdTrade.rows[0]?.traded || 0);
    const forDayRow = { label: 'For day', kind: 'day', revenue: b + c + fdFl + fdMtfVal, target: 0, pct_achieved: null,
      mapped: totalMapped, traded: fdTradedN, pct_traded: totalMapped > 0 ? (fdTradedN / totalMapped) * 100 : null,
      conv_pct: convPct, interactions: Number(fdInt.rows[0]?.interactions || 0), unmapped };

    // MTD = current month to date (the monthly figures for the current month already are MTD).
    const mtdRow = curMon ? { ...mkRow(curMon, 'MTD', 'mtd') } : null;

    // Completed months only (exclude the current/in-progress month — MTD represents it), newest first.
    const monthRows = months.filter(m => m !== curMon).sort().reverse().map(m => mkRow(m, mLabel(m), 'month'));

    // FY the year = fiscal-year-to-date.
    const fyMon = fyQ.rows[0]?.fy || null;
    const fyMonths = fyMon ? months.filter(m => m >= fyMon) : months;
    const fyRow = (() => {
      const brokerage = fyMonths.reduce((s, m) => s + (brokBy[m] || 0), 0);
      const clearing  = fyMonths.reduce((s, m) => s + (clrBy[m] || 0), 0);
      const mtf       = fyMonths.reduce((s, m) => s + (mtfBy[m] || 0), 0);
      const float     = fyMonths.reduce((s, m) => s + floatIncome(flBy[m] || 0), 0);
      const target    = fyMonths.reduce((s, m) => s + (tgtBy[m] || 0), 0);
      const interactions = fyMonths.reduce((s, m) => s + (intBy[m] || 0), 0);
      const revenue = brokerage + clearing + mtf + float;
      const traded = Number(fyTraded.rows[0]?.traded || 0);
      return { label: 'FY the year', kind: 'fy', revenue, target, pct_achieved: target > 0 ? (revenue / target) * 100 : null,
        mapped: totalMapped, traded, pct_traded: totalMapped > 0 ? (traded / totalMapped) * 100 : null,
        conv_pct: convPct, interactions, unmapped };
    })();

    // Order: For day → MTD → completed months (newest first) → FY the year.
    const rows = [forDayRow, ...(mtdRow ? [mtdRow] : []), ...monthRows, fyRow];

    res.json({ rms, rm_id: allMode ? 'all' : rmId, rm_name: rmName, rows });
  } catch (err) {
    console.error('RM-MONTHLY ERROR:', err.message);
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
      SELECT ((MAX(trade_date) - MIN(trade_date)) / 30.0) AS months FROM daily_trades
    `);
    const monthsSpan = Number(span.rows[0]?.months || 0);

    // Month math on 'YYYY-MM' keys
    const addMon = (ym, k) => {
      const [y, m] = ym.split('-').map(Number);
      const idx = (y * 12 + (m - 1)) + k;
      return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    };
    const WIN = 3;   // up to 3 calendar months on each side of the mapping (adaptive: fewer is OK)

    // Total mapped clients per RM (live), even those we can't measure yet
    const totalPerRm = await pool.query(`
      SELECT rm.id, rm.rm_name, COUNT(c.ucc)::int AS clients
      FROM rm_master rm LEFT JOIN clients c ON c.assigned_rm_id = rm.id
      GROUP BY rm.id, rm.rm_name ORDER BY clients DESC
    `);

    // Per-mapped-client MONTHLY revenue (brokerage + clearing commission) and options turnover
    const tradeMon = await pool.query(`
      WITH mc AS (
        SELECT ucc, assigned_rm_id, to_char(mapped_at,'YYYY-MM') AS map_mon
        FROM clients
        WHERE is_mapped = true AND mapped_at IS NOT NULL AND assigned_rm_id IS NOT NULL
      )
      SELECT mc.ucc, mc.assigned_rm_id AS rm_id, mc.map_mon,
             to_char(dt.trade_date,'YYYY-MM') AS mon,
             SUM(COALESCE(dt.brokerage_earned,0) + COALESCE(dt.commission_earned,0))::float AS rev,
             SUM(COALESCE(dt.options_premium_turnover,0))::float AS opt_to
      FROM mc JOIN daily_trades dt ON dt.ucc = mc.ucc
      GROUP BY mc.ucc, mc.assigned_rm_id, mc.map_mon, mon
    `);
    // Per-client MONTHLY credit ledger balance (float base)
    const ledgerMon = await pool.query(`
      WITH mc AS (
        SELECT ucc FROM clients WHERE is_mapped = true AND mapped_at IS NOT NULL AND assigned_rm_id IS NOT NULL
      )
      SELECT dl.ucc, to_char(dl.ledger_date,'YYYY-MM') AS mon,
             AVG(dl.opening_balance) FILTER (WHERE dl.opening_balance > 0)::float AS bal
      FROM mc JOIN daily_ledger dl ON dl.ucc = mc.ucc
      GROUP BY dl.ucc, mon
    `);
    const nameRes = await pool.query(`SELECT ucc, name FROM clients WHERE is_mapped = true`);
    const nameOf = {}; nameRes.rows.forEach(r => { nameOf[r.ucc] = r.name; });
    const rmNameById = {}; totalPerRm.rows.forEach(r => { rmNameById[r.id] = r.rm_name; });

    // Fold monthly rows into per-client structures
    const cli = {};   // ucc -> { rm_id, map_mon, m:{mon:{rev,opt}}, bal:{mon:v} }
    tradeMon.rows.forEach(r => {
      const c = (cli[r.ucc] = cli[r.ucc] || { rm_id: r.rm_id, map_mon: r.map_mon, m: {}, bal: {} });
      c.m[r.mon] = { rev: Number(r.rev) || 0, opt: Number(r.opt_to) || 0 };
    });
    ledgerMon.rows.forEach(r => { if (cli[r.ucc]) cli[r.ucc].bal[r.mon] = Number(r.bal) || 0; });

    // Average a metric over the WIN months on one side (only months that actually have data)
    const sideAvg = (months, pick) => {
      let sum = 0, n = 0;
      months.forEach(mon => { if (mon != null && pick(mon) != null) { sum += pick(mon); n++; } });
      return n > 0 ? { avg: sum / n, n } : { avg: 0, n: 0 };
    };

    const measured = [];   // per-client measured records
    for (const ucc of Object.keys(cli)) {
      const c = cli[ucc];
      const preM  = Array.from({ length: WIN }, (_, i) => addMon(c.map_mon, -(i + 1)));   // 3 months before
      const postM = Array.from({ length: WIN }, (_, i) => addMon(c.map_mon, i));           // mapping month + 2
      const revPre  = sideAvg(preM,  mon => c.m[mon]?.rev);
      const revPost = sideAvg(postM, mon => c.m[mon]?.rev);
      const optPre  = sideAvg(preM,  mon => c.m[mon]?.opt);
      const optPost = sideAvg(postM, mon => c.m[mon]?.opt);
      const balPre  = sideAvg(preM,  mon => c.bal[mon]);
      const balPost = sideAvg(postM, mon => c.bal[mon]);
      // Measured = at least one month of trade data on EACH side of the mapping
      const isMeasured = (revPre.n > 0 || optPre.n > 0) && (revPost.n > 0 || optPost.n > 0);
      if (!isMeasured) continue;
      measured.push({
        ucc, name: nameOf[ucc] || ucc, rm_id: c.rm_id, rm_name: rmNameById[c.rm_id] || '—',
        map_mon: c.map_mon,
        rev_pre: revPre.avg, rev_post: revPost.avg,
        opt_pre: optPre.avg, opt_post: optPost.avg,
        bal_pre: balPre.avg, bal_post: balPost.avg,
      });
    }

    const round2 = (v) => Math.round(v * 100) / 100;
    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

    // Per-RM aggregation (sum of member clients' avg-monthly figures = RM book/month)
    const per_rm = totalPerRm.rows.map(r => {
      const mine = measured.filter(x => x.rm_id === r.id);
      const revPre  = mine.reduce((s, x) => s + x.rev_pre, 0);
      const revPost = mine.reduce((s, x) => s + x.rev_post, 0);
      const optPre  = mine.reduce((s, x) => s + x.opt_pre, 0);
      const optPost = mine.reduce((s, x) => s + x.opt_post, 0);
      const balPre  = mine.reduce((s, x) => s + x.bal_pre, 0);
      const balPost = mine.reduce((s, x) => s + x.bal_post, 0);
      const noImp = mine.filter(x => x.rev_post <= x.rev_pre).length;
      return {
        rm_name: r.rm_name, clients_measured: mine.length, total_clients: Number(r.clients),
        rev_pre: round2(revPre), rev_post: round2(revPost), rev_change_pct: pct(revPost, revPre),
        to_pre: round2(optPre), to_post: round2(optPost), to_change_pct: pct(optPost, optPre),   // raw ₹ (frontend formats adaptively)
        float_change: round2(balPost - balPre), unmap_candidates: noImp,
      };
    });

    // Team cards
    const M = measured.length;
    const revUp = measured.filter(x => x.rev_post > x.rev_pre).length;
    const noImp = measured.filter(x => x.rev_post <= x.rev_pre).length;
    const sum = (f) => measured.reduce((s, x) => s + f(x), 0);
    const cards = {
      rev_increase_pct:   M ? Math.round((revUp / M) * 100) : null,
      to_increase_pct:    pct(sum(x => x.opt_post), sum(x => x.opt_pre)),
      float_increase_pct: pct(sum(x => x.bal_post), sum(x => x.bal_pre)),
      no_improve_pct:     M ? Math.round((noImp / M) * 100) : null,
    };

    // Unmap candidates — measured clients with no revenue lift
    const no_improvement = measured
      .filter(x => x.rev_post <= x.rev_pre)
      .map(x => ({
        ucc: x.ucc, name: x.name, rm_name: x.rm_name,
        mapped_since: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+x.map_mon.split('-')[1] - 1]} '${x.map_mon.split('-')[0].slice(2)}`,
        to_pre: round2(x.opt_pre), to_post: round2(x.opt_post),   // raw ₹
        rev_pre: round2(x.rev_pre), rev_post: round2(x.rev_post),
        recommendation: x.rev_post < x.rev_pre
          ? 'Revenue fell after mapping — review RM fit or consider reassignment.'
          : 'No revenue lift after mapping — monitor next quarter.',
      }));

    res.json({
      meta: {
        insufficient_history: M === 0,
        trade_months: Math.round(monthsSpan * 10) / 10,
        window_months: WIN,
        measured_clients: M,
      },
      cards,
      per_rm,
      no_improvement,
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

    // Hybrid sourcing: whole months of a range from the permanent archive, the partial boundary
    // month from the recent daily_trades tier. `2` variants target the prior window ($3..$4).
    const wholeCond  = `(month_year||'-01')::date >= $1::date AND (date_trunc('month',(month_year||'-01')::date) + INTERVAL '1 month - 1 day')::date <= $2::date`;
    const partialCond = `to_char(trade_date,'YYYY-MM') NOT IN (SELECT month_year FROM client_monthly_summary WHERE ${wholeCond})`;
    const wholeCond2  = `(month_year||'-01')::date >= $3::date AND (date_trunc('month',(month_year||'-01')::date) + INTERVAL '1 month - 1 day')::date <= $4::date`;
    const partialCond2 = `to_char(trade_date,'YYYY-MM') NOT IN (SELECT month_year FROM client_monthly_summary WHERE ${wholeCond2})`;

    // TOTAL distinct clients who TRADED (turnover > 0) in the range — a true period total, not a
    // per-day average. prev = the same distinct count over the immediately preceding equal window.
    const avgTraded = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT ucc) FROM (
           SELECT ucc FROM client_monthly_summary WHERE ${wholeCond} AND turnover > 0
           UNION SELECT ucc FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond} AND turnover > 0
         ) a)::int AS this_m,
        (SELECT COUNT(DISTINCT ucc) FROM (
           SELECT ucc FROM client_monthly_summary WHERE ${wholeCond2} AND turnover > 0
           UNION SELECT ucc FROM daily_trades WHERE trade_date::date BETWEEN $3 AND $4 AND ${partialCond2} AND turnover > 0
         ) b)::int AS prev_m
    `, [rng.from, rng.to, priorFrom, priorTo]);

    // NRI classification rule (per spec): a client is NRI when their UCC begins with 'N'.
    const nri = await pool.query(`SELECT COUNT(*)::int AS n FROM clients WHERE UPPER(ucc) LIKE 'N%'`);
    // Total client master count (for the RI = total − NRI split beside the NRI card).
    const allClients = await pool.query(`SELECT COUNT(*)::int AS n FROM clients`);
    // Total distinct NRI clients who TRADED in the range (tallies with the NRI row of the breakdown).
    const nriTraded = await pool.query(`
      SELECT COUNT(DISTINCT ucc)::int AS n FROM (
        SELECT ucc FROM client_monthly_summary WHERE ${wholeCond} AND turnover > 0 AND UPPER(ucc) LIKE 'N%'
        UNION SELECT ucc FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond} AND turnover > 0 AND UPPER(ucc) LIKE 'N%'
      ) u
    `, [rng.from, rng.to]);

    const dailyFO = await pool.query(`
      SELECT dt.trade_date::text AS d,
             COUNT(DISTINCT dt.ucc)::int AS clients,
             COUNT(DISTINCT dt.ucc) FILTER (WHERE UPPER(dt.ucc) LIKE 'N%')::int AS nri
      FROM daily_trades dt LEFT JOIN clients c ON c.ucc = dt.ucc
      WHERE (dt.eq_fo_turnover > 0 OR dt.options_premium_turnover > 0) AND dt.trade_date::date BETWEEN $1 AND $2
      GROUP BY dt.trade_date ORDER BY dt.trade_date
    `, [rng.from, rng.to]);

    const breakdown = await pool.query(`
      WITH mtd AS (
        SELECT ucc, opt_prem_to AS options_premium_turnover, eq_cash_to AS eq_cash_turnover,
               comm_to AS commodity_fo_turnover, brokerage AS brokerage_earned,
               CASE WHEN UPPER(ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END AS ctype
        FROM client_monthly_summary cms WHERE ${wholeCond} AND turnover > 0
        UNION ALL
        SELECT ucc, options_premium_turnover, eq_cash_turnover, commodity_fo_turnover, brokerage_earned,
               CASE WHEN UPPER(ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END
        FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond} AND turnover > 0
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
      SELECT CASE WHEN UPPER(m.ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END AS ctype, COUNT(DISTINCT m.ucc)::int AS n
      FROM mtf_monthly m
      WHERE m.month_year = (SELECT MAX(month_year) FROM mtf_monthly) GROUP BY ctype
    `);
    const mtfByType = {}; mtfUsers.rows.forEach(r => { mtfByType[r.client_type] = Number(r.n); });

    // High-value watch: top option traders overall AND per client-type (RI / NRI) so the UI can
    // filter All / RI / NRI. Float is taken as of the SELECTED end date (latest ledger on/before it),
    // not the newest ledger overall.
    const hv = await pool.query(`
      WITH mtd AS (
        SELECT ucc, SUM(opt_to) AS opt_to, SUM(brok) AS brok FROM (
          SELECT ucc, COALESCE(opt_prem_to,0) AS opt_to, COALESCE(brokerage,0) AS brok FROM client_monthly_summary cms WHERE ${wholeCond}
          UNION ALL
          SELECT ucc, COALESCE(options_premium_turnover,0), COALESCE(brokerage_earned,0) FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND ${partialCond}
        ) u GROUP BY ucc
      ),
      led AS (SELECT ucc, opening_balance FROM daily_ledger
              WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger WHERE ledger_date <= $2)),
      mtf AS (SELECT ucc, SUM(interest_earned) AS interest FROM mtf_monthly WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly) GROUP BY ucc),
      base AS (
        SELECT m.ucc, c.name, CASE WHEN UPPER(m.ucc) LIKE 'N%' THEN 'NRI' ELSE 'RI' END AS client_type,
               m.opt_to::float AS opt_to, COALESCE(m.brok,0)::float AS brok,
               COALESCE(led.opening_balance,0)::float AS float_bal, COALESCE(mtf.interest,0)::float AS mtf,
               rm.rm_name, c.last_trade_date
        FROM mtd m
        LEFT JOIN clients c ON c.ucc = m.ucc
        LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
        LEFT JOIN led ON led.ucc = m.ucc
        LEFT JOIN mtf ON mtf.ucc = m.ucc
        WHERE m.opt_to > 0
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY opt_to DESC) AS rn_all,
                  ROW_NUMBER() OVER (PARTITION BY client_type ORDER BY opt_to DESC) AS rn_type
        FROM base
      )
      SELECT * FROM ranked WHERE rn_all <= 10 OR rn_type <= 10 ORDER BY opt_to DESC
    `, [rng.from, rng.to]);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dLabel = (d) => { const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`; };
    const b = breakdown.rows[0] || {};
    const at = avgTraded.rows[0] || {};
    const statusOf = (d) => (d && new Date(d) >= new Date(Date.now() - 30 * 864e5) ? 'Active' : 'Dormant');

    // Realized (same-day matched) P&L — daily_trades.realized_pnl is computed at import from
    // matched intraday buy/sell legs. Cards classify each client by NET P&L over the range;
    // the trend counts profitable vs loss clients per day.
    const pnlCards = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE pnl > 0)::int AS profitable,
             COUNT(*) FILTER (WHERE pnl < 0)::int AS loss
      FROM ( SELECT ucc, SUM(realized_pnl) AS pnl FROM daily_trades
             WHERE trade_date::date BETWEEN $1 AND $2 GROUP BY ucc ) x
    `, [rng.from, rng.to]);
    const pnlDaily = await pool.query(`
      SELECT trade_date::text AS d,
             COUNT(DISTINCT ucc) FILTER (WHERE realized_pnl > 0)::int AS profitable,
             COUNT(DISTINCT ucc) FILTER (WHERE realized_pnl < 0)::int AS loss
      FROM daily_trades WHERE trade_date::date BETWEEN $1 AND $2 AND realized_pnl <> 0
      GROUP BY trade_date ORDER BY trade_date
    `, [rng.from, rng.to]);
    const pnlHas = pnlDaily.rows.length > 0;

    const asOfCa = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM daily_trades`);
    const hvMap = (r) => ({
      ucc: r.ucc, name: r.name || r.ucc, client_type: r.client_type, opt_to: Number(r.opt_to),
      brokerage: Number(r.brok), float: Number(r.float_bal), mtf: Number(r.mtf),
      rm_name: r.rm_name || '—', status: statusOf(r.last_trade_date),
    });
    const hvAll = hv.rows.filter(r => Number(r.rn_all) <= 10).map(hvMap);
    const hvRI  = hv.rows.filter(r => r.client_type === 'RI'  && Number(r.rn_type) <= 10).map(hvMap);
    const hvNRI = hv.rows.filter(r => r.client_type === 'NRI' && Number(r.rn_type) <= 10).map(hvMap);
    res.json({
      meta: { as_of: asOfCa.rows[0]?.a || null, range: rangeMeta(rng) },
      cards: {
        total_traded: Number(at.this_m || 0), total_traded_prev: Number(at.prev_m || 0),
        nri: Number(nriTraded.rows[0]?.n || 0),
        nri_total: Number(nri.rows[0].n),
        // RI (Resident) = every traded client that is not NRI. Shown beside NRI with its %.
        ri: Math.max(0, Number(at.this_m || 0) - Number(nriTraded.rows[0]?.n || 0)),
        ri_total: Math.max(0, Number(allClients.rows[0].n) - Number(nri.rows[0].n)),
        profitable: pnlHas ? Number(pnlCards.rows[0].profitable) : null,
        loss:       pnlHas ? Number(pnlCards.rows[0].loss)       : null,
      },
      daily_fo: dailyFO.rows.map(r => ({ date: dLabel(r.d), Resident: Number(r.clients) - Number(r.nri), NRI: Number(r.nri) })),
      daily_pnl: pnlDaily.rows.map(r => ({ date: dLabel(r.d), Profit: Number(r.profitable), Loss: Number(r.loss) })),
      pnl_available: pnlHas,
      breakdown: breakdown.rows.map(r => ({
        client_type: r.client_type, active: Number(r.active),
        eq_options: Number(r.eq_options), eq_cash: Number(r.eq_cash), commodity: Number(r.commodity),
        mtf_users: mtfByType[r.client_type] || 0,
        opt_to: Number(r.opt_to), brokerage: Number(r.brokerage),
        avg_opt_to: Number(r.eq_options) > 0 ? Number(r.opt_to) / Number(r.eq_options) : 0,
        avg_brok: Number(r.active) > 0 ? Number(r.brokerage) / Number(r.active) : 0,
      })),
      hv_watch: hvAll, hv_ri: hvRI, hv_nri: hvNRI,
    });
  } catch (err) {
    console.error('CLIENT-ANALYTICS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── CORPORATE DAILY MIS ─────────────────────────────────────────
router.get('/daily-mis', auth, async (req, res) => {
  try {
    // The page only needs recent months (today / trend / MTD / prior-3-month averages), so the
    // big per-trade and per-day scans are bounded to the last ~5 months by default. If the user
    // validates an explicit older From–To window, that range is included too ($1/$2). This keeps
    // the default load from re-scanning all history every time.
    const qFrom = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const qTo   = req.query.to   ? String(req.query.to).slice(0, 10)   : null;
    // Single param ($1 = validated From date, or NULL). The recent-window scans below use a
    // LEAST(cutoff, COALESCE($1,'infinity')) lower bound instead of "trade_date >= cutoff OR
    // BETWEEN $1 AND $2". The old OR form defeated the trade_date index (a parameterised OR
    // branch forces a full sequential scan), which is what made perDay take ~8s. A plain
    // "trade_date >= <scalar>" is index-friendly.
    const P = [qFrom];

    // ── Per-query timing (prints to the backend console / `pm2 logs clientiq-api`) ──
    // Each of the 9 queries below is wrapped in timed(); the line "[daily-mis] <name> <ms>ms"
    // tells us exactly which query dominates the load. "[daily-mis] TOTAL <ms>ms" is the
    // wall-clock for the whole (concurrent) batch. Remove these logs once tuning is done.
    const _mis0 = Date.now();
    const timed = (label, p) => { const s = Date.now(); return p.then(r => { console.log(`[daily-mis] ${label} ${Date.now() - s}ms`); return r; }); };

    // All independent — run them concurrently instead of one-after-another.
    const [fdRow, perDay, expiryQ, brok, commQ, mtf, mtfCliMonth, ledger, mtfD, ledgerDaily] = await Promise.all([
      timed('fd_rate', pool.query(`SELECT COALESCE((SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1), (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5) AS fd_rate`)),
      // 5-way segment split + client segments per day, from raw trades. (No clients JOIN — nothing
      // used it; NRI is derived from the UCC prefix.) Bounded to recent months + any validated range.
      // Per-day 5-way segment turnover + client segments, sourced from daily_trades — NOT raw
      // `trades`. Raw is purged per-DAY at 90 trading days, so a segment-turnover table built on
      // it silently drops to ₹0 for any day older than the window (e.g. Apr 1–14 showing ₹0 while
      // Apr 15+ was fine). daily_trades holds the per-UCC-per-day rollup and survives until its
      // whole month graduates, so it keeps every in-window day's turnover intact. Segments use the
      // clean commodity-split columns (comm_opt_to) so commodity options are never double-counted:
      //   eq_opt   = all options − commodity options            (options_to − comm_opt_to)
      //   comm_fut = all commodity − commodity options          (comm_to    − comm_opt_to)
      // The five segments then sum to daily_trades.turnover (each symbol counted once).
      timed('perDay', pool.query(`
        SELECT trade_date::text AS d,
               COALESCE(SUM(options_to - comm_opt_to),0)::float AS eq_opt,
               COALESCE(SUM(comm_opt_to),0)::float              AS comm_opt,
               COALESCE(SUM(eq_fut_to),0)::float                AS eq_fut,
               COALESCE(SUM(comm_to - comm_opt_to),0)::float    AS comm_fut,
               COALESCE(SUM(eq_cash_to),0)::float               AS eq_cash,
               COUNT(*)::int                                                       AS total_clients,
               COUNT(*) FILTER (WHERE eq_fut_to > 0 OR (options_to - comm_opt_to) > 0)::int AS fo_eq_clients,
               COUNT(*) FILTER (WHERE comm_to > 0)::int                            AS fo_comm_clients,
               COUNT(*) FILTER (WHERE eq_cash_to > 0)::int                         AS cash_clients,
               COUNT(*) FILTER (WHERE UPPER(ucc) LIKE 'N%')::int                   AS nri_clients
        FROM daily_trades
        WHERE trade_date >= LEAST((SELECT MAX(trade_date) FROM daily_trades) - INTERVAL '5 months', COALESCE($1::date, 'infinity'::date))
        GROUP BY trade_date ORDER BY trade_date
      `, P)),
      // Expiry-day highlight: the trade_date IS a contract expiry (Tue/Thu weekly). daily_trades
      // doesn't carry expiry_date, so this reads raw `trades`; days older than the 90-day raw
      // window just aren't flagged (cosmetic — the turnover numbers above are unaffected).
      timed('expiry', pool.query(`
        SELECT DISTINCT trade_date::text AS d FROM trades
        WHERE expiry_date = trade_date AND EXTRACT(DOW FROM trade_date) IN (2,4)
          AND trade_date >= LEAST((SELECT MAX(trade_date) FROM trades) - INTERVAL '5 months', COALESCE($1::date, 'infinity'::date))
      `, P).catch(() => ({ rows: [] }))),
      timed('brok', pool.query(`SELECT trade_date::text AS d, SUM(brokerage_earned)::float AS brok FROM daily_trades
                  WHERE trade_date >= LEAST((SELECT MAX(trade_date) FROM daily_trades) - INTERVAL '5 months', COALESCE($1::date, 'infinity'::date))
                  GROUP BY 1`, P)),
      timed('comm', pool.query(`SELECT trade_date::text AS d, SUM(commission_earned)::float AS comm FROM daily_trades
                  WHERE trade_date >= LEAST((SELECT MAX(trade_date) FROM daily_trades) - INTERVAL '5 months', COALESCE($1::date, 'infinity'::date))
                  GROUP BY 1`, P)),
      timed('mtf', pool.query(`
        SELECT COALESCE(SUM(interest_earned),0)::float AS interest, COALESCE(SUM(avg_mtf_balance),0)::float AS bal,
               COUNT(DISTINCT ucc)::int AS clients
        FROM mtf_monthly WHERE month_year = (SELECT MAX(month_year) FROM mtf_monthly)`)),
      timed('mtfCliMonth', pool.query(`SELECT month_year, COUNT(DISTINCT ucc)::int AS clients,
                         COALESCE(SUM(avg_mtf_balance),0)::float AS funding
                  FROM mtf_monthly GROUP BY month_year`)),
      timed('ledger', pool.query(`SELECT COALESCE(SUM(opening_balance) FILTER (WHERE opening_balance > 0),0)::float AS bal FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)`)),
      // mtf_interest may be empty / absent — don't let it fail the whole batch.
      timed('mtfD', pool.query(`
        SELECT gs::date::text AS dt, SUM(interest / (GREATEST((to_date - from_date), 0) + 1)) AS daily
        FROM mtf_interest, LATERAL generate_series(from_date, to_date, interval '1 day') gs
        GROUP BY gs::date
      `).catch(() => ({ rows: [] }))),
      // Per-day carried-forward float balance. Bounded to the same recent window as the trade
      // scans (5 months, or back to a validated From date if earlier) — the carry-forward
      // subquery still reaches older balances via "ledger_date <= gs::date", so the earliest
      // day in the window inherits the last known balance before it. Previously this generated a
      // row for EVERY day since the ledger began (MIN→MAX) with a correlated lookup per day.
      timed('ledgerDaily', pool.query(`
        -- AS MATERIALIZED is critical: without it Postgres 12+ inlines daybal into the correlated
        -- subquery and re-runs the whole daily_ledger GROUP BY once per generated day (that was the
        -- ~13s). Materialized, the aggregation runs once and each day just scans the small result.
        WITH daybal AS MATERIALIZED (SELECT ledger_date, SUM(opening_balance) FILTER (WHERE opening_balance > 0) AS bal FROM daily_ledger GROUP BY ledger_date)
        SELECT to_char(gs::date,'YYYY-MM-DD') AS d,
               (SELECT db.bal FROM daybal db WHERE db.ledger_date <= gs::date ORDER BY db.ledger_date DESC LIMIT 1)::float AS bal
        FROM generate_series(
               LEAST((SELECT MAX(ledger_date) FROM daily_ledger) - INTERVAL '5 months', COALESCE($1::date, 'infinity'::date)),
               (SELECT MAX(ledger_date) FROM daily_ledger),
               interval '1 day') gs
      `, P)),
    ]);
    console.log(`[daily-mis] TOTAL ${Date.now() - _mis0}ms  (rows: perDay=${perDay.rows.length}, ledgerDaily=${ledgerDaily.rows.length})`);

    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);
    const brokBy = {}; brok.rows.forEach(r => { brokBy[r.d] = Number(r.brok); });
    const commBy = {}; commQ.rows.forEach(r => { commBy[r.d] = Number(r.comm); });
    const mtfCliByMonth = {}, mtfFundByMonth = {};
    mtfCliMonth.rows.forEach(r => { mtfCliByMonth[r.month_year] = Number(r.clients); mtfFundByMonth[r.month_year] = Number(r.funding); });
    const mtfByDate = {};
    mtfD.rows.forEach(r => { mtfByDate[r.dt] = Number(r.daily); });
    const floatByDate = {};
    ledgerDaily.rows.forEach(r => { floatByDate[r.d] = (Number(r.bal) || 0) * (fdRate / 100) / 365; });

    const expirySet = new Set((expiryQ.rows || []).map(r => String(r.d)));
    const rows = perDay.rows.map(r => ({
      d: String(r.d), eq_opt: Number(r.eq_opt), comm_opt: Number(r.comm_opt), eq_fut: Number(r.eq_fut),
      comm_fut: Number(r.comm_fut), eq_cash: Number(r.eq_cash), total_clients: Number(r.total_clients),
      fo_eq_clients: Number(r.fo_eq_clients), fo_comm_clients: Number(r.fo_comm_clients), cash_clients: Number(r.cash_clients),
      nri_clients: Number(r.nri_clients), resident_clients: Number(r.total_clients) - Number(r.nri_clients),
      is_expiry: expirySet.has(String(r.d)), brok: brokBy[String(r.d)] || 0, comm: commBy[String(r.d)] || 0,
    }));
    const n = rows.length;
    // Optional as-of date (?asof=YYYY-MM-DD) anchors the Last-traded-date / Yesterday / Day-before
    // columns on the latest TRADING day on/before it. Yesterday/Day-before are the previous trading
    // days — `rows` holds only days with trades, so stepping back skips weekends/holidays. Default
    // (no asof) anchors on the latest trading day overall. Independent of the From–To range panel.
    const asof = req.query.asof ? String(req.query.asof).slice(0, 10) : null;
    let anchorIdx = n - 1;
    if (asof) { let i = n - 1; while (i >= 0 && String(rows[i].d) > asof) i--; anchorIdx = i; }
    const today = anchorIdx >= 0 ? rows[anchorIdx] : undefined;
    const yday  = anchorIdx >= 1 ? rows[anchorIdx - 1] : undefined;
    const dbef  = anchorIdx >= 2 ? rows[anchorIdx - 2] : undefined;
    const curMonth = today ? ymOf(today.d) : null;
    // MTD = the anchor month up to and including the anchor date.
    const mtdRows = rows.filter(r => ymOf(r.d) === curMonth && (!today || String(r.d) <= String(today.d)));
    const priorRows = rows.filter(r => ymOf(r.d) !== curMonth);
    // Discrete prior-MONTH row sets for the Prior 1M / 2M / 3M avg columns (income + volume):
    // 1M = the single month just before the anchor month, 2M = two months before, 3M = three
    // months before. Each average is that one calendar month only (not a cumulative window).
    const monthKeyOffset = (ym, k) => { if (!ym) return null; let [y, m] = ym.split('-').map(Number); m -= k; while (m <= 0) { m += 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; };
    const pm1 = monthKeyOffset(curMonth, 1), pm2 = monthKeyOffset(curMonth, 2), pm3 = monthKeyOffset(curMonth, 3);
    const p1Rows = rows.filter(r => ymOf(r.d) === pm1);
    const p2Rows = rows.filter(r => ymOf(r.d) === pm2);
    const p3Rows = rows.filter(r => ymOf(r.d) === pm3);
    const expRows = rows.filter(r => r.is_expiry), nonExp = rows.filter(r => !r.is_expiry);
    const avg = (arr, f) => arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0;
    const cr = (v) => +(v / 1e7).toFixed(2);
    const vsPct = (cur, base) => base ? +(((cur - base) / base) * 100).toFixed(1) : null;
    const dailyFloat = Number(ledger.rows[0]?.bal || 0) * (fdRate / 100) / 365;

    // ── Prior 1M/2M/3M from the PERMANENT monthly archive (client_monthly_summary) ──
    // The raw `trades` / `daily_trades` tiers are purged on a rolling 90-day window, so any
    // prior-month turnover / clearing read from them silently drops to ₹0 once the month ages
    // out. client_monthly_summary keeps every month forever, so the Prior 1M/2M/3M columns for
    // turnover, clearing and brokerage are sourced from it here. (Today/Yesterday/MTD stay on
    // the recent tiers — always in-window.) Its segment-turnover sum also reconciles ~5-8%
    // closer to the Brokerage Analysis Report than the old daily_trades.turnover column.
    const cmsQ = await pool.query(`
      SELECT month_year AS m,
             COALESCE(SUM(eq_cash_to),0)::float        AS eq_cash,
             COALESCE(SUM(eq_fo_to),0)::float          AS eq_fut,
             COALESCE(SUM(opt_prem_to),0)::float       AS eq_opt,
             COALESCE(SUM(comm_to),0)::float           AS comm,
             COALESCE(SUM(brokerage),0)::float         AS brokerage,
             COALESCE(SUM(commission_earned),0)::float AS commission,
             COALESCE(SUM(turnover),0)::float          AS turnover,
             COALESCE(SUM(comm_opt_to),0)::float       AS comm_opt,
             MAX(trade_days)::int                      AS days
      FROM client_monthly_summary
      WHERE month_year = ANY($1)
      GROUP BY month_year
    `, [[pm1, pm2, pm3].filter(Boolean)]).catch(() => ({ rows: [] }));
    const cmsBy = {};
    cmsQ.rows.forEach(r => { cmsBy[r.m] = {
      eq_cash: +r.eq_cash, eq_fut: +r.eq_fut, eq_opt: +r.eq_opt, comm: +r.comm,
      brokerage: +r.brokerage, commission: +r.commission,
      turnover: +r.turnover, comm_opt: +r.comm_opt, days: Math.max(1, +r.days || 1) }; });
    // client_monthly_summary stores commodity F&O combined; split a prior month's commodity into
    // options vs futures using the current window's ratio (keeps the commodity total exact).
    const commOptSum = rows.reduce((s, r) => s + r.comm_opt, 0);
    const commFutSum = rows.reduce((s, r) => s + r.comm_fut, 0);
    const commOptRatio = (commOptSum + commFutSum) > 0 ? commOptSum / (commOptSum + commFutSum) : 0;
    // Per-day average of a metric for a prior month, from the permanent archive. Returns null
    // when the month isn't in the archive (→ keep the existing in-window value as a fallback).
    const cmsAvg = (pm, key) => {
      const c = cmsBy[pm]; if (!c) return null;
      // Commodity options: real archived value once backfilled; else fall back to the window ratio.
      const commOpt = c.comm_opt > 0 ? c.comm_opt : c.comm * commOptRatio;
      if (key === 'comm_opt')  return commOpt / c.days;
      if (key === 'comm_fut')  return (c.comm - commOpt) / c.days;
      if (key === 'eq_opt')    return (c.eq_opt - commOpt) / c.days;   // eq options = all options − commodity options
      // Clean total (no commodity-options double-count): prefer the archived turnover column.
      if (key === 'total_vol') return (c.turnover > 0 ? c.turnover
                                        : (c.eq_cash + c.eq_fut + c.eq_opt + c.comm - commOpt)) / c.days;
      return (c[key] || 0) / c.days;   // eq_cash | eq_fut | brokerage | commission
    };
    // Per-date MTF interest from the SAME source as the income table (mtf_interest, spread over
    // each period's real days). Keeps every panel consistent: a date the MTF file doesn't cover
    // reads ₹0 everywhere, instead of the old crude "monthly ÷ 30" flat value used only here.
    const mtfToday = today ? (mtfByDate[today.d] || 0) : 0;
    const mtfMtd   = avg(mtdRows, r => mtfByDate[r.d] || 0);

    const volSeg = (label, f, expiry) => ({
      segment: label,
      today: today ? cr(f(today)) : 0, yesterday: yday ? cr(f(yday)) : 0,
      mtd_avg: cr(avg(mtdRows, f)),
      prior1m_avg: cr(avg(p1Rows, f)), prior2m_avg: cr(avg(p2Rows, f)), prior3m_avg: cr(avg(p3Rows, f)),
      vs: vsPct(avg(mtdRows, f), avg(p3Rows, f)),   // MTD avg vs Prior-3M avg (like-for-like)
      expiry_premium: expiry && nonExp.length && avg(nonExp, f) > 0
        ? +(((avg(expRows, f) - avg(nonExp, f)) / avg(nonExp, f)) * 100).toFixed(0) : null,
    });
    const totVol = (r) => r.eq_opt + r.comm_opt + r.eq_fut + r.comm_fut + r.eq_cash;
    const actSeg = (label, f) => ({
      category: label, today: today ? f(today) : 0, yesterday: yday ? f(yday) : 0,
      mtd_avg: Math.round(avg(mtdRows, f)),
      prior1m_avg: Math.round(avg(p1Rows, f)), prior2m_avg: Math.round(avg(p2Rows, f)), prior3m_avg: Math.round(avg(p3Rows, f)),
      vs: vsPct(avg(mtdRows, f), avg(p3Rows, f)),   // MTD avg vs Prior-3M avg
    });

    // Income lines (₹): clearing unavailable; brokerage/MTF/float real
    const incLine = (line, tf, note) => {
      const t = today ? tf(today) : 0, y = yday ? tf(yday) : 0, db = dbef ? tf(dbef) : 0;
      const mtd = avg(mtdRows, tf), p1 = avg(p1Rows, tf), p2 = avg(p2Rows, tf), p3 = avg(p3Rows, tf);
      // No rounding — carry the exact value (paise) through; the UI formats to 2 decimals.
      return { line, today: note ? null : t, yesterday: note ? null : y,
        day_before: note ? null : db, mtd_avg: note ? null : mtd,
        prior1m_avg: note ? null : p1, prior2m_avg: note ? null : p2, prior3m_avg: note ? null : p3,
        vs: note ? null : vsPct(mtd, p3), note: note || null };   // MTD avg vs Prior-3M avg
    };
    const income = [
      incLine('Clearing charges (commission)', r => r.comm, null),
      incLine('Brokerage', r => r.brok, null),
      incLine('MTF interest (daily)', r => mtfByDate[r.d] || 0, null),
      // Per-day float = that day's total ledger balance × FD rate ÷ 365 (floatByDate).
      // Falls back to the latest-snapshot estimate only for a day with no ledger entry,
      // so Today/Yesterday/Day-before reflect each day's real balance instead of one flat figure.
      incLine('Float income (est.)', r => (floatByDate[r.d] != null ? floatByDate[r.d] : dailyFloat), null),
    ];
    // Repoint Prior 1M/2M/3M for clearing & brokerage to the permanent archive (purge-proof).
    const overrideIncPrior = (line, key) => {
      const l = income.find(x => x.line === line); if (!l) return;
      const v1 = cmsAvg(pm1, key), v2 = cmsAvg(pm2, key), v3 = cmsAvg(pm3, key);
      if (v1 != null) l.prior1m_avg = v1;
      if (v2 != null) l.prior2m_avg = v2;
      if (v3 != null) l.prior3m_avg = v3;
      l.vs = vsPct(l.mtd_avg || 0, l.prior3m_avg);   // MTD avg vs Prior-3M avg
    };
    overrideIncPrior('Clearing charges (commission)', 'commission');
    overrideIncPrior('Brokerage', 'brokerage');
    const realLines = income.filter(l => !l.note);
    const totalToday = realLines.reduce((s, l) => s + (l.today || 0), 0);
    const totalMtd = realLines.reduce((s, l) => s + (l.mtd_avg || 0), 0);
    const totalP1 = realLines.reduce((s, l) => s + (l.prior1m_avg || 0), 0);
    const totalP2 = realLines.reduce((s, l) => s + (l.prior2m_avg || 0), 0);
    const totalPrior = realLines.reduce((s, l) => s + (l.prior3m_avg || 0), 0);
    income.push({ line: 'Total revenue', today: totalToday, yesterday: realLines.reduce((s, l) => s + (l.yesterday || 0), 0),
      day_before: realLines.reduce((s, l) => s + (l.day_before || 0), 0), mtd_avg: totalMtd,
      prior1m_avg: totalP1, prior2m_avg: totalP2, prior3m_avg: totalPrior, vs: vsPct(totalMtd, totalPrior), note: null, total: true });
    income.forEach(l => { l.share = (l.note || l.total) ? null : (totalToday > 0 ? Math.round((l.today || 0) / totalToday * 100) : 0); });

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dLabel = (d) => { const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`; };
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    // ── Optional date-range validation panel (?from=YYYY-MM-DD&to=YYYY-MM-DD) ──
    // Returns each calendar day in the inclusive range with its real MTF interest,
    // brokerage, clearing commission and float income, plus the range totals. Lets the
    // user validate a specific window (e.g. an MTF file uploaded for 27–31 Jul) against
    // the source file. Days with no data read ₹0. Independent of the "today" anchor above.
    let range = null;
    if (qFrom && qTo && qFrom <= qTo) {   // qFrom/qTo declared at the top of the handler
      // Per-day segment turnover comes from the same `rows` used by the "today" panel
      // (raw trades, 5-way split). Keyed by date so the range can look each day up.
      const segByDate = {};
      rows.forEach(r => { segByDate[String(r.d)] = r; });
      const days = [];
      let cur = new Date(qFrom + 'T00:00:00Z');
      const end = new Date(qTo + 'T00:00:00Z');
      let guard = 0;
      while (cur <= end && guard++ < 400) {
        const ds = isoOf(cur);
        const mtfI = mtfByDate[ds] || 0, brokI = brokBy[ds] || 0, commI = commBy[ds] || 0, fltI = floatByDate[ds] || 0;
        const s = segByDate[ds] || {};
        days.push({ date: ds, label: dLabel(ds),
          // income lines (₹)
          mtf_interest: mtfI, brokerage: brokI, commission: commI, float_income: fltI,
          total: mtfI + brokI + commI + fltI,
          // segment turnover (₹) — eq cash / eq futures / eq options premium / comm futures / comm options
          eq_cash: s.eq_cash || 0, eq_fut: s.eq_fut || 0, eq_opt: s.eq_opt || 0,
          comm_fut: s.comm_fut || 0, comm_opt: s.comm_opt || 0,
          turnover: (s.eq_cash || 0) + (s.eq_fut || 0) + (s.eq_opt || 0) + (s.comm_fut || 0) + (s.comm_opt || 0),
          clients: s.total_clients || 0 });
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
      }
      const sum = (f) => days.reduce((s, x) => s + f(x), 0);
      range = { from: qFrom, to: qTo, days, totals: {
        mtf_interest: sum(x => x.mtf_interest), brokerage: sum(x => x.brokerage),
        commission: sum(x => x.commission), float_income: sum(x => x.float_income),
        total: sum(x => x.total),
        eq_cash: sum(x => x.eq_cash), eq_fut: sum(x => x.eq_fut), eq_opt: sum(x => x.eq_opt),
        comm_fut: sum(x => x.comm_fut), comm_opt: sum(x => x.comm_opt), turnover: sum(x => x.turnover) } };
    }

    // Revenue mix — honours the validated From–To range when one is active, otherwise the last
    // traded date. Uses the same four real streams (clearing, brokerage, MTF interest, float) so
    // the pie recomputes for the selected window instead of being pinned to the anchor day.
    const mixByLine = range
      ? { 'Clearing charges (commission)': range.totals.commission,
          'Brokerage':                     range.totals.brokerage,
          'MTF interest (daily)':          range.totals.mtf_interest,
          'Float income (est.)':           range.totals.float_income }
      : null;
    const mixTotal = range
      ? (range.totals.commission + range.totals.brokerage + range.totals.mtf_interest + range.totals.float_income)
      : totalToday;
    const revenueMix = realLines.map(l => {
      const v = range ? (mixByLine[l.line] || 0) : (l.today || 0);
      return { label: l.line.replace(' (daily)', '').replace(' (est.)', ''),
               pct: mixTotal > 0 ? Math.round(v / mixTotal * 100) : 0 };
    });

    // MTF book "Prior 3M avg" column: average each metric across the 3 prior calendar months
    // (pm1/pm2/pm3), using only months that actually have MTF data. Daily interest is averaged
    // the same way as the MTD column (per-day, from mtfByDate) so the columns are comparable.
    const p3m = [pm1, pm2, pm3];
    const meanOf = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const p3Fund = meanOf(p3m.map(m => mtfFundByMonth[m]).filter(v => v != null));
    const p3Cli  = meanOf(p3m.map(m => mtfCliByMonth[m]).filter(v => v != null));
    const p3Apc  = meanOf(p3m.map(m => (mtfCliByMonth[m] ? mtfFundByMonth[m] / mtfCliByMonth[m] : null)).filter(v => v != null));
    const p3RowsAll = [...p1Rows, ...p2Rows, ...p3Rows];
    const p3DailyInt = p3RowsAll.length ? avg(p3RowsAll, r => mtfByDate[r.d] || 0) : null;

    // Volume table — build, then repoint Prior 1M/2M/3M turnover (₹ Cr) to the permanent archive.
    const volume = [
      volSeg('Eq Options (premium TO)', r => r.eq_opt, true),
      volSeg('Comm Options', r => r.comm_opt, false),
      volSeg('Eq Futures', r => r.eq_fut, false),
      volSeg('Comm Futures', r => r.comm_fut, false),
      volSeg('Equity Cash', r => r.eq_cash, false),
      { ...volSeg('Total (all segments)', totVol, false), total: true },
    ];
    const overrideVolPrior = (label, key) => {
      const s = volume.find(x => x.segment === label); if (!s) return;
      const v1 = cmsAvg(pm1, key), v2 = cmsAvg(pm2, key), v3 = cmsAvg(pm3, key);
      if (v1 != null) s.prior1m_avg = cr(v1);
      if (v2 != null) s.prior2m_avg = cr(v2);
      if (v3 != null) s.prior3m_avg = cr(v3);
      s.vs = vsPct(s.mtd_avg, s.prior3m_avg);   // MTD avg vs Prior-3M avg
    };
    overrideVolPrior('Eq Options (premium TO)', 'eq_opt');
    overrideVolPrior('Comm Options', 'comm_opt');
    overrideVolPrior('Eq Futures', 'eq_fut');
    overrideVolPrior('Comm Futures', 'comm_fut');
    overrideVolPrior('Equity Cash', 'eq_cash');
    overrideVolPrior('Total (all segments)', 'total_vol');

    res.json({
      range,
      meta: { today: fmtDate(today?.d), yesterday_date: fmtDate(yday?.d), day_before_date: fmtDate(dbef?.d),
              asof, is_expiry: today ? today.is_expiry : false, brokerage_loaded: rows.reduce((s, r) => s + r.brok, 0) > 0,
              mix_scope: range ? `${fmtDate(range.from)} → ${fmtDate(range.to)}` : fmtDate(today?.d) },
      income,
      volume,
      activity: [
        actSeg('Total clients traded', r => r.total_clients),
        actSeg('F&O clients (Eq)', r => r.fo_eq_clients),
        actSeg('F&O clients (Comm)', r => r.fo_comm_clients),
        actSeg('Equity cash clients', r => r.cash_clients),
        // MTF book column is that book's distinct MTF clients (from mtf_monthly): current
        // period for today/MTD, and the three prior periods for Prior 1M/2M/3M. `?? null`
        // keeps a period with no MTF data blank ("—") rather than 0.
        (() => {
          const cur = mtfCliByMonth[curMonth] ?? 0;
          const p1 = mtfCliByMonth[pm1] ?? null, p2 = mtfCliByMonth[pm2] ?? null, p3 = mtfCliByMonth[pm3] ?? null;
          return { category: 'MTF clients', note: 'Weekly book', today: cur, yesterday: cur, mtd_avg: cur,
                   prior1m_avg: p1, prior2m_avg: p2, prior3m_avg: p3, vs: vsPct(cur, p3 || 0) };
        })(),
        actSeg('Resident clients', r => r.resident_clients),
        actSeg('NRI clients', r => r.nri_clients),
      ],
      mtf: {
        funding: Number(mtf.rows[0]?.bal || 0), interest: Number(mtf.rows[0]?.interest || 0),
        clients: Number(mtf.rows[0]?.clients || 0),
        daily_interest: Math.round(mtfToday), mtd_interest: Math.round(mtfMtd),
        avg_per_client: Number(mtf.rows[0]?.clients || 0) > 0 ? Number(mtf.rows[0]?.bal || 0) / Number(mtf.rows[0]?.clients || 0) : 0,
        // Prior-3-month averages for the MTF book "Prior 3M avg" column (null → "—").
        prior3m_funding: p3Fund, prior3m_clients: p3Cli == null ? null : Math.round(p3Cli),
        prior3m_avg_per_client: p3Apc, prior3m_daily_interest: p3DailyInt == null ? null : Math.round(p3DailyInt),
      },
      revenue_mix: revenueMix,
      trend: rows.slice(Math.max(0, anchorIdx - 16), anchorIdx + 1).map(r => ({
        date: dLabel(r.d), options_cr: cr(r.eq_opt + r.comm_opt), clients: r.total_clients,
        revenue_l: +((r.brok + (mtfByDate[r.d] || 0) + (floatByDate[r.d] != null ? floatByDate[r.d] : dailyFloat)) / 1e5).toFixed(2), is_expiry: r.is_expiry,
      })),
    });
  } catch (err) {
    console.error('DAILY-MIS ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// CORPORATE DAILY MIS — export & email (PDF / Excel / email to management)
// The client POSTs the already-loaded /daily-mis payload so the export matches
// exactly what the supervisor sees on screen (including any validated range).
// PDF  : pdfmake with the built-in Helvetica AFM fonts — no font files shipped,
//        so amounts use "Rs" notation (the ₹ glyph is absent from WinAnsi Helvetica).
// Excel: the xlsx package already used by the importer, one sheet per section.
// Email: nodemailer 'updates' mailbox, with the PDF + Excel attached.
// ============================================================================
const PDF_FONTS = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};
const misPrinter = new PdfPrinter(PDF_FONTS);

const misRs  = (n) => (n == null || n === '' || isNaN(Number(n))) ? '—' : 'Rs ' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const misPct = (n) => (n == null) ? '—' : (Number(n) >= 0 ? '+' : '') + n + '%';
const misNum = (n) => (n == null) ? '—' : Number(n).toLocaleString('en-IN');
const misEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One normalized list of tables from a daily-mis payload.
// Each: { sheet, title, headers[], rows[][] (display strings) } — reused by PDF, Excel and email.
function misTables(data) {
  const d = data || {}, meta = d.meta || {}, tables = [];
  if (Array.isArray(d.income) && d.income.length) tables.push({
    sheet: 'Income', title: 'Daily income summary — all revenue lines',
    headers: ['Revenue line', `Last traded (${meta.today || ''})`, `Prev day (${meta.yesterday_date || ''})`, `2nd prev (${meta.day_before_date || ''})`, 'MTD avg', 'Prior 1M', 'Prior 2M', 'Prior 3M', 'vs 3M', 'Share'],
    rows: d.income.map((r) => [
      (r.line || '') + (r.note ? ` (${r.note})` : ''),
      misRs(r.today), misRs(r.yesterday), misRs(r.day_before),
      misRs(r.mtd_avg), misRs(r.prior1m_avg), misRs(r.prior2m_avg), misRs(r.prior3m_avg),
      misPct(r.vs), r.total ? '100%' : (r.share == null ? '—' : r.share + '%'),
    ]),
  });
  if (Array.isArray(d.volume) && d.volume.length) tables.push({
    sheet: 'Volume', title: 'Daily volume — all segments (Rs Cr)',
    headers: ['Segment', `Last traded (${meta.today || ''})`, `Prev day (${meta.yesterday_date || ''})`, 'MTD avg', 'Prior 1M', 'Prior 2M', 'Prior 3M', 'vs 3M', 'Expiry premium'],
    rows: d.volume.map((r) => [
      r.segment || '',
      r.today + ' Cr', r.yesterday + ' Cr', r.mtd_avg + ' Cr', r.prior1m_avg + ' Cr', r.prior2m_avg + ' Cr', r.prior3m_avg + ' Cr',
      misPct(r.vs), r.expiry_premium == null ? '—' : misPct(r.expiry_premium) + ' vs normal',
    ]),
  });
  if (Array.isArray(d.activity) && d.activity.length) tables.push({
    sheet: 'Activity', title: 'Daily client activity',
    headers: ['Category', `Last traded (${meta.today || ''})`, `Prev day (${meta.yesterday_date || ''})`, 'MTD avg', 'Prior 1M', 'Prior 2M', 'Prior 3M', 'vs 3M'],
    rows: d.activity.map((r) => [
      (r.category || '') + (r.note ? ` (${r.note})` : ''),
      misNum(r.today), misNum(r.yesterday), misNum(r.mtd_avg), misNum(r.prior1m_avg), misNum(r.prior2m_avg), misNum(r.prior3m_avg), misPct(r.vs),
    ]),
  });
  if (d.mtf) { const m = d.mtf; tables.push({
    sheet: 'MTF', title: 'MTF book summary',
    headers: ['Metric', 'Value'],
    rows: [
      ['Net MTF funding (Rs Cr)', (Number(m.funding || 0) / 1e7).toFixed(2)],
      ['MTF interest earned today (Rs)', misRs(m.daily_interest)],
      ['MTF interest MTD (Rs)', misRs(m.mtd_interest)],
      ['MTF clients', misNum(m.clients)],
      ['Avg book per client (Rs L)', (Number(m.avg_per_client || 0) / 1e5).toFixed(2)],
    ],
  }); }
  if (Array.isArray(d.revenue_mix) && d.revenue_mix.length) tables.push({
    sheet: 'Revenue mix', title: `Revenue mix — ${meta.today || ''}`,
    headers: ['Stream', 'Share'],
    rows: d.revenue_mix.map((r) => [r.label || '', (r.pct == null ? '—' : r.pct + '%')]),
  });
  if (Array.isArray(d.trend) && d.trend.length) tables.push({
    sheet: 'Trend', title: 'Recent trading-day trend',
    headers: ['Date', 'Revenue (Rs L)', 'Options prem TO (Rs Cr)', 'Clients traded', 'Expiry day'],
    rows: d.trend.map((r) => ['' + r.date, 'Rs ' + r.revenue_l + ' L', 'Rs ' + r.options_cr + ' Cr', misNum(r.clients), r.is_expiry ? 'Yes' : '—']),
  });
  if (d.range && Array.isArray(d.range.days) && d.range.days.length) { const t = d.range.totals || {}; tables.push({
    sheet: 'Range validation', title: `Selected range — daily revenue validation (${d.range.from} to ${d.range.to})`,
    headers: ['Date', 'MTF interest', 'Brokerage', 'Clearing (comm)', 'Float income', 'Day total'],
    rows: [
      ...d.range.days.map((x) => [x.label, misRs(x.mtf_interest), misRs(x.brokerage), misRs(x.commission), misRs(x.float_income), misRs(x.total)]),
      [`Total (${d.range.days.length} days)`, misRs(t.mtf_interest), misRs(t.brokerage), misRs(t.commission), misRs(t.float_income), misRs(t.total)],
    ],
  }); }
  return tables;
}

function buildMisPdf(data) {
  const meta = (data && data.meta) || {};
  const content = [
    { text: 'Navia Markets', style: 'brand' },
    { text: 'Corporate Daily MIS', style: 'h1' },
    { text: `As of ${meta.today || '—'}${meta.is_expiry ? '  ·  weekly expiry day' : ''}`, style: 'sub' },
    { text: `Generated ${new Date().toLocaleString('en-IN')}`, style: 'sub2', margin: [0, 0, 0, 10] },
  ];
  misTables(data).forEach((tb) => {
    content.push({ text: tb.title, style: 'h2', margin: [0, 8, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: tb.headers.map((h, i) => (i === 0 ? '*' : 'auto')),
        body: [
          tb.headers.map((h) => ({ text: h, style: 'th' })),
          ...tb.rows.map((r) => r.map((c, i) => ({ text: c, style: i === 0 ? 'tdL' : 'td' }))),
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex === 0 ? '#1B3F7A' : rowIndex % 2 === 0 ? '#f3f6fb' : null),
        hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#d9e1ee',
      },
    });
  });
  content.push({ text: 'Float income = client credit ledger balance × FD rate ÷ 365. Amounts in Rs; "Cr" = crore, "L" = lakh. Figures reflect the last traded date.', style: 'foot', margin: [0, 12, 0, 0] });

  const docDefinition = {
    pageOrientation: 'landscape', pageSize: 'A4', pageMargins: [24, 28, 24, 28],
    defaultStyle: { font: 'Helvetica', fontSize: 8, color: '#1f2a44' },
    content,
    styles: {
      brand: { fontSize: 10, bold: true, color: '#1B3F7A' },
      h1: { fontSize: 16, bold: true, margin: [0, 2, 0, 0] },
      sub: { fontSize: 9, color: '#5b6577' },
      sub2: { fontSize: 8, color: '#9aa3b2' },
      h2: { fontSize: 10, bold: true, color: '#1B3F7A' },
      th: { fontSize: 7.5, bold: true, color: '#ffffff', margin: [1, 3, 1, 3] },
      td: { fontSize: 7.5, alignment: 'right', margin: [1, 2, 1, 2] },
      tdL: { fontSize: 7.5, alignment: 'left', margin: [1, 2, 1, 2] },
      foot: { fontSize: 7, italics: true, color: '#9aa3b2' },
    },
    footer: (cur, tot) => ({ text: `Navia ClientIQ · Corporate Daily MIS · page ${cur} of ${tot}`, alignment: 'center', fontSize: 7, color: '#9aa3b2', margin: [0, 6, 0, 0] }),
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = misPrinter.createPdfKitDocument(docDefinition);
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (e) { reject(e); }
  });
}

function buildMisXlsx(data) {
  const wb = XLSX.utils.book_new();
  const meta = (data && data.meta) || {};
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Navia Markets — Corporate Daily MIS'],
    ['As of', meta.today || ''],
    ['Expiry day', meta.is_expiry ? 'Yes' : 'No'],
    ['Generated', new Date().toLocaleString('en-IN')],
  ]), 'Summary');
  const used = {};
  misTables(data).forEach((tb) => {
    let name = (tb.sheet || 'Sheet').slice(0, 31);
    if (used[name]) { name = (name.slice(0, 28) + ' ' + (++used[name])).slice(0, 31); } else { used[name] = 1; }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tb.headers, ...tb.rows]), name);
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function misSummaryHtml(data, note) {
  const meta = (data && data.meta) || {};
  let html = '<div style="font-family:Arial,sans-serif;max-width:840px;margin:0 auto;color:#1f2a44">'
    + '<div style="background:#1B3F7A;padding:16px 20px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">Navia Markets — Corporate Daily MIS</h2>'
    + `<div style="color:#cdd8ee;font-size:13px;margin-top:4px">As of ${misEsc(meta.today || '—')}${meta.is_expiry ? ' · weekly expiry day' : ''}</div></div>`
    + '<div style="padding:16px 20px;border:1px solid #e6e9f0;border-top:none;border-radius:0 0 8px 8px">';
  if (note) html += `<p style="background:#f3f6fb;padding:10px 12px;border-radius:6px;font-size:14px;white-space:pre-wrap">${misEsc(note)}</p>`;
  misTables(data).forEach((tb) => {
    html += `<h3 style="color:#1B3F7A;font-size:14px;margin:16px 0 6px">${misEsc(tb.title)}</h3>`
      + '<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>'
      + tb.headers.map((h) => `<th style="background:#1B3F7A;color:#fff;text-align:left;padding:5px 7px;font-weight:600">${misEsc(h)}</th>`).join('')
      + '</tr></thead><tbody>'
      + tb.rows.map((r, ri) => `<tr style="background:${ri % 2 ? '#fff' : '#f3f6fb'}">` + r.map((c, ci) => `<td style="padding:4px 7px;border-bottom:1px solid #e6e9f0;text-align:${ci ? 'right' : 'left'}">${misEsc(c)}</td>`).join('') + '</tr>').join('')
      + '</tbody></table>';
  });
  html += `<p style="font-size:11px;color:#9aa3b2;margin-top:16px">Generated ${misEsc(new Date().toLocaleString('en-IN'))} · Navia ClientIQ. Amounts in Rs; Cr = crore, L = lakh. Full PDF and Excel are attached.</p></div></div>`;
  return html;
}

// 'updates' mailbox — same host/credentials the app already uses for client updates.
function misMailer() {
  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.zatpatmail.com', port: 587, secure: false,
      auth: { user: 'emailapikey', pass: 'PHtE6r1YS+Hq2Wcs9RMF7fKxEc/wPIksq+IzKAZHuYpLDvRXFk0Br9F/wzO/rxcoBvEQE/+fnoNgtLuf4L3Xc27vMG5FX2qyqK3sx/VYSPOZsbq6x00fuVkZcUzUUY7od9Nj3CHVstbaNA==' },
    }),
    from: 'updates@navia.co.in',
  };
}

// POST /analytics/daily-mis/export/pdf  { data }
router.post('/daily-mis/export/pdf', auth, async (req, res) => {
  try {
    const data = req.body && req.body.data;
    if (!data || !data.meta) return res.status(400).json({ message: 'Missing MIS data' });
    const pdf = await buildMisPdf(data);
    const fname = `Daily_MIS_${String(data.meta.today || 'export').replace(/[^\w]+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(pdf);
  } catch (err) { console.error('MIS PDF ERROR:', err); res.status(500).json({ message: 'Could not build PDF' }); }
});

// POST /analytics/daily-mis/export/xlsx  { data }
router.post('/daily-mis/export/xlsx', auth, async (req, res) => {
  try {
    const data = req.body && req.body.data;
    if (!data || !data.meta) return res.status(400).json({ message: 'Missing MIS data' });
    const buf = buildMisXlsx(data);
    const fname = `Daily_MIS_${String(data.meta.today || 'export').replace(/[^\w]+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (err) { console.error('MIS XLSX ERROR:', err); res.status(500).json({ message: 'Could not build Excel' }); }
});

// POST /analytics/daily-mis/email  { data, to, note } — sends the MIS with PDF + Excel attached.
router.post('/daily-mis/email', auth, async (req, res) => {
  try {
    const { data, to, note } = req.body || {};
    if (!data || !data.meta) return res.status(400).json({ message: 'Missing MIS data' });
    const recipients = String(to || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) return res.status(400).json({ message: 'Enter at least one recipient email.' });
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const bad = recipients.filter((r) => !emailRe.test(r));
    if (bad.length) return res.status(400).json({ message: 'Invalid email(s): ' + bad.join(', ') });

    const pdf = await buildMisPdf(data);
    const xlsx = buildMisXlsx(data);
    const dtag = String(data.meta.today || 'export').replace(/[^\w]+/g, '_');
    const { transporter, from } = misMailer();
    await transporter.sendMail({
      from: '"Navia Markets MIS" <' + from + '>',
      to: recipients.join(', '),
      subject: `Corporate Daily MIS — ${data.meta.today || ''}`,
      html: misSummaryHtml(data, note),
      attachments: [
        { filename: `Daily_MIS_${dtag}.pdf`, content: pdf },
        { filename: `Daily_MIS_${dtag}.xlsx`, content: xlsx },
      ],
    });
    res.json({ success: true, message: `MIS emailed to ${recipients.join(', ')} (PDF + Excel attached).` });
  } catch (err) { console.error('MIS EMAIL ERROR:', err); res.status(500).json({ message: err.message || 'Could not send email' }); }
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
    else if (key === 'lastday') from = b.mx;   // single latest trading day (from = to = data_max)
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
    // "Active" = actually TRADED that month. daily_trades also holds zero-turnover rows
    // written by the holdings-snapshot import (one row per client on the snapshot date to
    // store holding_value) — those are holders, not traders, so filter turnover > 0 or they
    // show up as phantom "active" clients in a month with no trade files (e.g. Aug snapshot).
    // Monthly activity/revenue from the PERMANENT archive (client_monthly_summary) so past
    // months never drop out once daily_trades is purged.
    const active = await pool.query(`
      SELECT month_year AS mon, COUNT(DISTINCT ucc) FILTER (WHERE turnover > 0)::int AS active
      FROM client_monthly_summary GROUP BY 1 ORDER BY 1
    `);
    const cohorts = await pool.query(`
      SELECT to_char(account_open_date,'YYYY-MM') AS mon, COUNT(*)::int AS opened
      FROM clients WHERE account_open_date IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 8
    `);
    const seg = await pool.query(`
      WITH m AS (SELECT DISTINCT month_year AS mon, ucc FROM client_monthly_summary WHERE turnover > 0),
      s AS (
        SELECT month_year AS mon,
               COUNT(DISTINCT ucc) FILTER (WHERE turnover > 0)::int AS total,
               COUNT(DISTINCT ucc) FILTER (WHERE opt_prem_to > 0)::int AS eq_options,
               COUNT(DISTINCT ucc) FILTER (WHERE eq_cash_to > 0)::int AS eq_cash,
               COUNT(DISTINCT ucc) FILTER (WHERE comm_to > 0)::int AS comm_fo,
               COUNT(DISTINCT ucc) FILTER (WHERE eq_fo_to > 0)::int AS eq_fut
        FROM client_monthly_summary GROUP BY 1
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

    // #7 "RD" = Revenue per Day. Per month: total book revenue (brokerage + clearing commission)
    // ÷ number of actual trading days that month. Exposes the PREVIOUS month's avg/day (and the
    // current month's, for context). Trading days = distinct dates with real turnover.
    const revDay = await pool.query(`
      SELECT month_year AS mon,
             COALESCE(SUM(brokerage + commission_earned),0)::float AS revenue,
             MAX(trade_days)::int AS days
      FROM client_monthly_summary WHERE turnover > 0 GROUP BY 1 ORDER BY 1
    `);
    const rdRows = revDay.rows.map(r => ({ mon: r.mon, rd: Number(r.days) ? Number(r.revenue) / Number(r.days) : 0 }));
    const rdCurr = rdRows.length ? rdRows[rdRows.length - 1] : null;
    const rdPrev = rdRows.length > 1 ? rdRows[rdRows.length - 2] : null;

    // ── Cohort retention matrix + blended curve ──────────────────────────────
    // We can only OBSERVE retention in a calendar month for which we actually hold
    // trade files. So for a cohort that opened in month C, the cell "M-k" (k months
    // after opening) is computable ONLY when month C+k is one we have data for; every
    // other cell is genuinely unknown and returns null (renders "—") — never a
    // misleading 0%. With trade files landing in July, the observable cells are the
    // diagonal that lands on July: Jan→M6, Feb→M5, Mar→M4, Apr→M3, May→M2, Jun→M1,
    // Jul→M0. As more monthly files are loaded, more of the matrix fills in on its own.
    const addMonths = (ym, k) => {
      const [y, m] = ym.split('-').map(Number);
      const idx = (y * 12 + (m - 1)) + k;
      return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    };
    const dataMonthsQ = await pool.query(`
      SELECT DISTINCT month_year AS m
      FROM client_monthly_summary WHERE turnover > 0
    `);
    const dataMonths = new Set(dataMonthsQ.rows.map(r => r.m));
    // distinct cohort clients who traded, bucketed by months-since-opening (k)
    const matrixQ = await pool.query(`
      WITH cohort AS (
        SELECT to_char(account_open_date,'YYYY-MM') AS cmon, ucc
        FROM clients WHERE account_open_date IS NOT NULL
      ),
      traded AS (
        SELECT DISTINCT ucc, month_year AS tmon
        FROM client_monthly_summary WHERE turnover > 0
      )
      SELECT c.cmon,
             ( (split_part(t.tmon,'-',1)::int * 12 + split_part(t.tmon,'-',2)::int)
             - (split_part(c.cmon,'-',1)::int * 12 + split_part(c.cmon,'-',2)::int) ) AS k,
             COUNT(DISTINCT c.ucc)::int AS active
      FROM cohort c JOIN traded t ON t.ucc = c.ucc
      GROUP BY 1, 2
    `);
    const activeByCohortK = {};   // cmon -> { k -> distinct active clients }
    for (const r of matrixQ.rows) {
      const k = Number(r.k);
      if (k < 0) continue;        // guard: trade dated before opening (shouldn't happen)
      (activeByCohortK[r.cmon] ||= {})[k] = Number(r.active);
    }
    const cohortRows = cohorts.rows.slice().reverse().map(r => {
      const cmon = r.mon, opened = Number(r.opened);
      const ret = {};              // k(0..12) -> pct | null   (#14: M0 = opening month itself)
      for (let k = 0; k <= 12; k++) {
        const target = addMonths(cmon, k);
        if (!dataMonths.has(target)) { ret[k] = null; continue; }   // month not observed → "—"
        const act = (activeByCohortK[cmon] && activeByCohortK[cmon][k]) || 0;
        ret[k] = opened ? +(act / opened * 100).toFixed(1) : null;
      }
      return { cohort: monLbl(cmon), cmon, opened, ret };
    });
    // Blended retention curve M0..M12 — every cohort whose (opening + k) month is
    // observed, pooled and weighted by accounts opened. M0 = the opening month itself.
    const curve = [];
    for (let k = 0; k <= 12; k++) {
      let num = 0, den = 0, cohortsIn = 0;
      for (const r of cohorts.rows) {
        const cmon = r.mon, opened = Number(r.opened);
        if (!dataMonths.has(addMonths(cmon, k))) continue;          // unobserved → skip cohort
        num += (activeByCohortK[cmon] && activeByCohortK[cmon][k]) || 0;
        den += opened; cohortsIn++;
      }
      if (den > 0) curve.push({ m: k, label: `M${k}`, pct: +(num / den * 100).toFixed(1), base: den, cohorts_in: cohortsIn });
    }
    const curvePct = (k) => { const p = curve.find(c => c.m === k); return p ? p.pct : null; };

    // Churn is only meaningful when the PRIOR calendar month was also observed. If the
    // month before the latest one has no trade files, "0 churned" would be a false
    // all-clear — so return null ("—") instead.
    const activeMonths = active.rows.map(r => r.mon);
    const latestMon = activeMonths.length ? activeMonths[activeMonths.length - 1] : null;
    const prevObserved = latestMon && activeMonths.includes(addMonths(latestMon, -1));

    res.json({
      meta: {
        insufficient_history: dataMonths.size < 3,
        active_months: active.rows.length,
        observed_months: [...dataMonths].sort(),
        as_of: asOfRet.rows[0]?.a || null,
      },
      cards: {
        monthly_active: a.length ? a[a.length - 1].active : 0,
        monthly_active_prev: a.length > 1 ? a[a.length - 2].active : 0,
        // 30-day ≈ traded in the month after opening (M1); 90-day ≈ M3. Null until observed.
        retention_30: curvePct(1),
        retention_90: curvePct(3),
        churn: (latest && prevObserved) ? Number(latest.churned) : null,
        // #7 Revenue per Day — previous month's average, with label + current month for context
        rd_prev_month: rdPrev ? +rdPrev.rd.toFixed(2) : null,
        rd_prev_label: rdPrev ? monLbl(rdPrev.mon) : null,
        rd_curr_month: rdCurr ? +rdCurr.rd.toFixed(2) : null,
        rd_curr_label: rdCurr ? monLbl(rdCurr.mon) : null,
      },
      monthly_active: a,
      cohorts: cohortRows,
      retention_curve: curve,
      segment_trend: segRows,
    });
  } catch (err) { console.error('RETENTION ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ── CLIENT REVENUE RAMP ─────────────────────────────────────────
router.get('/revenue-ramp', auth, async (req, res) => {
  try {
    // Date range filters the OPENING cohorts shown (account_open_date in [from,to]).
    // Default = current FY, so the FY cohorts (Apr…) are on screen with their computable diagonal.
    const rng = await resolveRange(req, 'clients', 'account_open_date');
    const fromD = rng.from, toD = rng.to;
    const addMonths = (ym, k) => {
      const [y, m] = ym.split('-').map(Number);
      const idx = (y * 12 + (m - 1)) + k;
      return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    };

    // Months we can actually measure revenue in = any month with trades (brokerage) or MTF interest.
    const dataMonthsQ = await pool.query(`
      SELECT DISTINCT m FROM (
        SELECT month_year m FROM client_monthly_summary WHERE turnover > 0
        UNION SELECT month_year m FROM mtf_monthly
      ) z`);
    const dataMonths = new Set(dataMonthsQ.rows.map(r => r.m));

    // Cohort sizes for ALL opening months. The headline cards + ramp curve are a full-book metric
    // (so M6/M12 fill from older cohorts even when the table is filtered to recent months); the
    // date range below only scopes which cohort ROWS the table shows.
    const cohortSizeQ = await pool.query(`
      SELECT to_char(account_open_date,'YYYY-MM') AS cmon, COUNT(*)::int AS clients
      FROM clients WHERE account_open_date IS NOT NULL GROUP BY 1`);
    const cohortSize = {}; cohortSizeQ.rows.forEach(r => { cohortSize[r.cmon] = Number(r.clients); });

    // Per cohort × elapsed-month k: total revenue (options clearing + brokerage + MTF) across clients.
    const rampQ = await pool.query(`
      WITH cohort AS (
        SELECT ucc, to_char(account_open_date,'YYYY-MM') AS cmon
        FROM clients WHERE account_open_date IS NOT NULL
      ),
      rev AS (
        -- Revenue per client-month = options clearing (premium × 0.0005, Navia's primary stream)
        -- + brokerage + MTF interest — the same three streams the Concentration Risk doughnut uses.
        SELECT ucc, mon, SUM(rev)::float AS rev FROM (
          SELECT ucc, month_year AS mon,
                 (COALESCE(brokerage,0) + COALESCE(opt_prem_to,0) * 0.0005)::float AS rev
          FROM client_monthly_summary WHERE turnover > 0
          UNION ALL
          SELECT ucc, month_year AS mon, COALESCE(interest_earned,0)::float AS rev FROM mtf_monthly
        ) s GROUP BY ucc, mon
      )
      SELECT c.cmon,
        ( (split_part(r.mon,'-',1)::int*12 + split_part(r.mon,'-',2)::int)
        - (split_part(c.cmon,'-',1)::int*12 + split_part(c.cmon,'-',2)::int) ) AS k,
        SUM(r.rev)::float AS total_rev
      FROM cohort c JOIN rev r ON r.ucc = c.ucc
      GROUP BY 1, 2`);
    const revByCK = {};   // cmon -> { k -> total revenue }
    for (const r of rampQ.rows) { const k = Number(r.k); if (k < 0) continue; (revByCK[r.cmon] ||= {})[k] = Number(r.total_rev); }

    // First options-trade date per cohort client (for the 60-day activation metric).
    const optQ = await pool.query(`
      WITH cohort AS (
        SELECT ucc, account_open_date, to_char(account_open_date,'YYYY-MM') AS cmon
        FROM clients WHERE account_open_date IS NOT NULL
      ),
      firstopt AS (SELECT ucc, MIN(trade_date) d FROM daily_trades WHERE options_premium_turnover > 0 GROUP BY ucc)
      SELECT c.cmon,
        COUNT(*) FILTER (WHERE f.d IS NOT NULL AND f.d >= c.account_open_date AND f.d - c.account_open_date <= 60)::int AS activated
      FROM cohort c LEFT JOIN firstopt f ON f.ucc = c.ucc
      GROUP BY 1`);
    const activatedByC = {}; optQ.rows.forEach(r => { activatedByC[r.cmon] = Number(r.activated); });

    const cmons = Object.keys(cohortSize).sort();   // ALL opening months (curve/cards blend over these)
    const cohortsAll = cmons.map(cmon => {
      const size = cohortSize[cmon];
      const cell = (k) => {
        if (!dataMonths.has(addMonths(cmon, k))) return null;                 // elapsed month not observed → "—"
        const tr = (revByCK[cmon] && revByCK[cmon][k]) || 0;
        return size ? Math.round(tr / size) : null;                          // avg revenue per client (₹)
      };
      // Options activation is only trustworthy when the whole 0–60-day window is observed; a
      // single loaded month can't confirm "within 60 days", so it stays null until history deepens.
      const windowObserved = dataMonths.has(addMonths(cmon, 0)) && dataMonths.has(addMonths(cmon, 1)) && dataMonths.has(addMonths(cmon, 2));
      const opt = (windowObserved && size) ? +(((activatedByC[cmon] || 0) / size) * 100).toFixed(1) : null;
      return { cohort: monLbl(cmon), cmon, clients: size,
               m1: cell(1), m2: cell(2), m3: cell(3), m6: cell(6), m12: cell(12), opt_activation: opt };
    });
    // Selected range scopes EVERYTHING (table, cards and curve) to cohorts whose opening month
    // falls in [fromM, toM]. Note: for a recent-only range the cohorts are young, so M6/M12 read
    // "—" until those cohorts age into those elapsed months.
    const fromM = fromD.slice(0, 7), toM = toD.slice(0, 7);
    const cohorts = cohortsAll.filter(c => c.cmon >= fromM && c.cmon <= toM);
    const cmonsInRange = cmons.filter(cmon => cmon >= fromM && cmon <= toM);

    // Blended ramp curve M0..M12 (weighted by clients opened; only observed elapsed months).
    const curve = [];
    for (let k = 0; k <= 12; k++) {
      let num = 0, den = 0;
      for (const cmon of cmonsInRange) {
        if (!dataMonths.has(addMonths(cmon, k))) continue;
        num += (revByCK[cmon] && revByCK[cmon][k]) || 0;
        den += cohortSize[cmon];
      }
      if (den > 0) curve.push({ m: `M${k}`, rev: Math.round(num / den) });
    }
    const curveRev = (k) => { const p = curve.find(c => c.m === `M${k}`); return p ? p.rev : null; };

    // Blended options-activation by M2 across cohorts whose full 0–60-day window is observed.
    let optNum = 0, optDen = 0;
    for (const cmon of cmonsInRange) {
      const windowObserved = dataMonths.has(addMonths(cmon, 0)) && dataMonths.has(addMonths(cmon, 1)) && dataMonths.has(addMonths(cmon, 2));
      if (windowObserved) { optNum += activatedByC[cmon] || 0; optDen += cohortSize[cmon]; }
    }
    const optCard = optDen > 0 ? +((optNum / optDen) * 100).toFixed(1) : null;

    const asOfRamp = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM daily_trades`);
    res.json({
      meta: {
        insufficient_history: dataMonths.size < 3,
        observed_months: [...dataMonths].sort(),
        as_of: asOfRamp.rows[0]?.a || null,
        range: rangeMeta(rng),
      },
      cards: { m1: curveRev(1), m3: curveRev(3), m6: curveRev(6), opt_activation: optCard },
      cohorts,
      ramp_curve: curve,
      opt_activation_by_cohort: cohorts.map(c => ({ cohort: c.cohort, pct: c.opt_activation })),
    });
  } catch (err) { console.error('REVENUE-RAMP ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ── MARKET SHARE ────────────────────────────────────────────────
// --- exchange_volume table (manual / feed-fed exchange turnover, segment-wise) ---
// Columns: trade_date, segment (eqopt|eqfut|commopt|commfut|eqcash), traded_value (₹, options = PREMIUM turnover)
let _exVolEnsured = false;
async function ensureExchangeVolume() {
  if (_exVolEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_volume (
      trade_date   DATE         NOT NULL,
      segment      VARCHAR(12)  NOT NULL,
      traded_value NUMERIC      NOT NULL,
      source       VARCHAR(16)  DEFAULT 'manual',
      updated_at   TIMESTAMPTZ  DEFAULT now(),
      PRIMARY KEY (trade_date, segment)
    )
  `);
  _exVolEnsured = true;
}

const MKT_SEGS = [
  { key: 'eqopt',   label: 'Equity Options (premium)' },
  { key: 'eqfut',   label: 'Equity Futures' },
  { key: 'commopt', label: 'Commodity Options (premium)' },
  { key: 'commfut', label: 'Commodity Futures' },
  { key: 'eqcash',  label: 'Equity Cash' },
];

// Navia per-day per-segment turnover, split 5 ways from daily_trades.symbols
// (the retained detail tier — the raw `trades` table is a staging table and only
// holds the latest upload, so bounds/history must come from daily_trades like
// every other report). Options `to` in symbols is premium turnover.
const NAVIA_SEG_SQL = `
  SELECT dt.trade_date::text AS d,
    CASE WHEN (e->>'pt')='FO' AND UPPER(COALESCE(e->>'ot','')) IN ('CE','PE') THEN 'eqopt'
         WHEN (e->>'pt')='CO' AND UPPER(COALESCE(e->>'ot','')) IN ('CE','PE') THEN 'commopt'
         WHEN (e->>'pt')='FO' THEN 'eqfut'
         WHEN (e->>'pt')='CO' THEN 'commfut'
         WHEN (e->>'pt')='CM' THEN 'eqcash'
         ELSE 'other' END AS seg,
    SUM((e->>'to')::numeric)::float AS val
  FROM daily_trades dt
  CROSS JOIN LATERAL jsonb_array_elements(dt.symbols) e
  WHERE dt.trade_date::date BETWEEN $1 AND $2
  GROUP BY 1, 2`;

router.get('/market-share', auth, async (req, res) => {
  try {
    await ensureExchangeVolume();
    // Bounds must anchor to the last day of ACTUAL trading. daily_trades also holds
    // zero-turnover holdings-snapshot rows (e.g. an Aug holdings import with no trades),
    // which would otherwise push the max date into a month that has no market data and
    // make presets like "Last 30 days" run past 31 Jul. Filter turnover > 0.
    const rng = await resolveRange(req, '(SELECT trade_date FROM daily_trades WHERE turnover > 0) dt');

    // Navia daily traded value per segment (current window)
    const navia = await pool.query(NAVIA_SEG_SQL, [rng.from, rng.to]);

    // Exchange daily traded value per segment (manual/feed)
    const exch = await pool.query(`
      SELECT trade_date::text AS d, segment AS seg, SUM(traded_value)::float AS val
      FROM exchange_volume WHERE trade_date::date BETWEEN $1 AND $2
      GROUP BY 1, 2
    `, [rng.from, rng.to]);

    const CR = 1e7;
    const cr = v => +(Number(v || 0) / CR).toFixed(2);
    const monthKey = d => d.slice(0, 7);
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const deltaPct = (cur, prev) => (prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null);
    const dirOf = (cur, prev) => (cur > prev ? 'up' : cur < prev ? 'down' : 'flat');

    // exchange lookup: seg -> {date -> val}
    const exMap = {};
    for (const r of exch.rows) (exMap[r.seg] = exMap[r.seg] || {})[r.d] = r.val;

    // ── per (month, segment) aggregates ─────────────────────────────
    const navMon = {}, navMonMatched = {}, exMonTot = {}, exMonDates = {};
    for (const r of exch.rows) {
      const k = monthKey(r.d) + '|' + r.seg;
      exMonTot[k] = (exMonTot[k] || 0) + r.val;
      (exMonDates[k] = exMonDates[k] || new Set()).add(r.d);
    }
    for (const r of navia.rows) {
      const k = monthKey(r.d) + '|' + r.seg;
      navMon[k] = (navMon[k] || 0) + r.val;
      if (exMap[r.seg] && exMap[r.seg][r.d] != null) navMonMatched[k] = (navMonMatched[k] || 0) + r.val;
    }

    // ── per-day totals across ALL segments (for the day-wise chart) ──
    const navDay = {}, exDay = {};
    for (const r of navia.rows) navDay[r.d] = (navDay[r.d] || 0) + r.val;
    for (const r of exch.rows)  exDay[r.d]  = (exDay[r.d]  || 0) + r.val;
    // day axis: from the earliest to the latest day that has any data, filling gaps
    const dataDates = [...new Set([...Object.keys(navDay), ...Object.keys(exDay)])].sort();
    const daily = [];
    if (dataDates.length) {
      const dayMs = 86400000;
      let cur = new Date(dataDates[0] + 'T00:00:00Z');
      const end = new Date(dataDates[dataDates.length - 1] + 'T00:00:00Z');
      let guard = 0;
      while (cur <= end && guard < 400) {
        const iso = cur.toISOString().slice(0, 10);
        daily.push({
          d: iso,
          day: cur.getUTCDate(),
          label: `${cur.getUTCDate()} ${MON[cur.getUTCMonth()]}`,
          navia_cr: cr(navDay[iso] || 0),
          exchange_cr: cr(exDay[iso] || 0),
        });
        cur = new Date(cur.getTime() + dayMs); guard++;
      }
    }

    // ── month-wise segment tables ───────────────────────────────────
    const monthsSet = new Set([...navia.rows.map(r => monthKey(r.d)), ...exch.rows.map(r => monthKey(r.d))]);
    const prevMonthOf = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };
    const months = [...monthsSet].sort().map(m => {
      const pm = prevMonthOf(m);
      const segs = MKT_SEGS.map(s => {
        const k = m + '|' + s.key, pk = pm + '|' + s.key;
        const nt = navMon[k] || 0, nm = navMonMatched[k] || 0, et = exMonTot[k] || 0, np = navMon[pk] || 0;
        const days = exMonDates[k] ? exMonDates[k].size : 0;
        return {
          key: s.key, label: s.label,
          navia_cr: cr(nt), navia_matched_cr: cr(nm), exchange_cr: cr(et),
          share: et > 0 ? +((nm / et) * 100).toFixed(2) : null,
          trading_days: days,
          navia_delta_pct: deltaPct(nt, np),   // vs previous calendar month
          navia_dir: dirOf(nt, np),
        };
      });
      return { month: m, label: monLbl(m), segments: segs };
    });

    // ── cards: overall over the whole range ─────────────────────────
    let sumMatched = 0, sumExch = 0;
    for (const mo of months) for (const s of mo.segments) if (s.exchange_cr > 0) { sumMatched += s.navia_matched_cr; sumExch += s.exchange_cr; }
    const overallShare = sumExch > 0 ? +((sumMatched / sumExch) * 100).toFixed(3) : null;
    const segAgg = {};
    for (const mo of months) for (const s of mo.segments) if (s.exchange_cr > 0) {
      const a = segAgg[s.key] = segAgg[s.key] || { label: s.label, nm: 0, et: 0 };
      a.nm += s.navia_matched_cr; a.et += s.exchange_cr;
    }
    let topSeg = null;
    for (const k in segAgg) { const a = segAgg[k]; const sh = a.et > 0 ? (a.nm / a.et) * 100 : 0; if (!topSeg || sh > topSeg.share) topSeg = { label: a.label, share: +sh.toFixed(2) }; }

    const naviaTotalAll = Object.values(navDay).reduce((a, b) => a + b, 0);
    let naviaPrevAll = 0;
    if (rng.from && rng.to) {
      const dayMs = 86400000;
      const fromD = new Date(rng.from + 'T00:00:00Z'), toD = new Date(rng.to + 'T00:00:00Z');
      const span = Math.round((toD - fromD) / dayMs) + 1;
      const pTo = new Date(fromD.getTime() - dayMs), pFrom = new Date(pTo.getTime() - (span - 1) * dayMs);
      const isoU = d => d.toISOString().slice(0, 10);
      const prev = await pool.query(NAVIA_SEG_SQL, [isoU(pFrom), isoU(pTo)]);
      naviaPrevAll = prev.rows.reduce((a, r) => a + r.val, 0);
    }

    const feedAvailable = exch.rows.length > 0;
    const asOfMkt = await pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') a FROM exchange_volume WHERE trade_date::date BETWEEN $1 AND $2`, [rng.from, rng.to]);
    res.json({
      meta: {
        feed_available: feedAvailable,
        reason: feedAvailable ? null : 'No exchange turnover figures entered for this range yet — add them to the exchange_volume table (Admin can insert manually or via the feed).',
        as_of: asOfMkt.rows[0]?.a || null,
        range: rangeMeta(rng),
      },
      cards: {
        overall_share: overallShare,
        top_segment: topSeg ? topSeg.label : null,
        top_segment_share: topSeg ? topSeg.share : null,
        navia_total_cr: cr(naviaTotalAll),
        navia_prev_total_cr: cr(naviaPrevAll),
        navia_delta_pct: deltaPct(naviaTotalAll, naviaPrevAll),
        navia_dir: dirOf(naviaTotalAll, naviaPrevAll),
        exchange_total_cr: +(sumExch).toFixed(2),
      },
      daily,
      months,
    });
  } catch (err) { console.error('MARKET-SHARE ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;