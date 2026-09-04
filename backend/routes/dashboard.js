const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

router.get('/company', auth, async (req, res) => {
  try {
    // Use the latest date that actually has data, not the wall-clock "today"
    // (brokerage/ledger are snapshot-dated on upload; turnover is on the trade date).
    const [total, active, mapped, trades, float_, leads] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query('SELECT COUNT(*) FROM clients WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM clients WHERE is_mapped = true'),
      pool.query(`SELECT
          (SELECT COALESCE(SUM(brokerage_earned),0) FROM daily_trades
             WHERE trade_date = (SELECT MAX(trade_date) FROM daily_trades WHERE brokerage_earned > 0)) AS brokerage,
          (SELECT COALESCE(SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover),0) FROM daily_trades
             WHERE trade_date = (SELECT MAX(trade_date) FROM daily_trades
                                 WHERE eq_cash_turnover > 0 OR eq_fo_turnover > 0 OR commodity_fo_turnover > 0)) AS turnover`),
      pool.query('SELECT COALESCE(SUM(opening_balance),0) total FROM daily_ledger WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)'),
      pool.query("SELECT COUNT(*) FROM lead_pool WHERE status = 'unassigned'")
    ]);
    res.json({
      total_clients:    parseInt(total.rows[0].count),
      active_clients:   parseInt(active.rows[0].count),
      mapped_clients:   parseInt(mapped.rows[0].count),
      today_brokerage:  parseFloat(trades.rows[0].brokerage),
      today_turnover:   parseFloat(trades.rows[0].turnover),
      total_float:      parseFloat(float_.rows[0].total),
      unassigned_leads: parseInt(leads.rows[0].count)
    });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

router.get('/float-stats', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT SUM(opening_balance) as total_float,
        ROUND(SUM(opening_balance * COALESCE(
          (SELECT rate FROM float_rate_history h WHERE h.effective_from <= daily_ledger.ledger_date ORDER BY h.effective_from DESC LIMIT 1),
          (SELECT value::numeric FROM settings WHERE key='fd_rate'), 6.5)) / 100 / 365, 2) as daily_income
      FROM daily_ledger
      WHERE ledger_date = (SELECT MAX(ledger_date) FROM daily_ledger)
    `);
    res.json(result.rows[0] || { total_float: null, daily_income: null });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/rm', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    const userName   = userResult.rows[0]?.name || '';
    const rmResult   = await pool.query('SELECT id, capacity FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1', [userName]);
    const rmId       = rmResult.rows[0]?.id || null;
    const rmCapacity = rmResult.rows[0]?.capacity != null ? parseInt(rmResult.rows[0].capacity) : null;

    if (!rmId) {
      console.warn(`No rm_master record for user: ${userName}`);
      return res.json({ my_clients: 0, my_leads: 0, interactions_30d: 0 });
    }

    const [clients, leads, optedIn, churn, interactions, asOf, rev, monthlyBrok, monthlyMtf, top] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients WHERE assigned_rm_id = $1', [rmId]),
      pool.query("SELECT COUNT(*) FROM lead_pool WHERE assigned_to_rm = $1 AND status = 'assigned'", [rmId]),
      // "Interested" = leads that have opted in (real lifecycle state), still awaiting mapping
      pool.query("SELECT COUNT(*) FROM lead_pool WHERE assigned_to_rm = $1 AND status = 'opted_in'", [rmId]),
      // Churn alerts = mapped clients whose latest churn risk score is high (0–10 scale, ≥7)
      pool.query(`
        SELECT COUNT(*) FROM clients c
        JOIN ai_scores a ON a.ucc = c.ucc
          AND a.score_date = (SELECT MAX(score_date) FROM ai_scores WHERE ucc = c.ucc)
        WHERE c.assigned_rm_id = $1 AND a.churn_risk_score >= 7
      `, [rmId]),
      pool.query(`
        SELECT COUNT(*) FROM interactions
        WHERE rm_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `, [req.user.id]),
      // Latest date that actually has trade data (#12 "As of Date")
      pool.query(`SELECT to_char(MAX(trade_date),'FMDD Mon YYYY') AS d FROM daily_trades`),
      // RM-scoped revenue: MTD + YTD brokerage from this RM's assigned clients, and MTD MTF interest.
      pool.query(`
        WITH mx AS (SELECT MAX(trade_date) AS md FROM daily_trades),
        fy AS (SELECT make_date(
                 CASE WHEN EXTRACT(MONTH FROM (SELECT md FROM mx)) >= 4
                      THEN EXTRACT(YEAR FROM (SELECT md FROM mx))::int
                      ELSE EXTRACT(YEAR FROM (SELECT md FROM mx))::int - 1 END, 4, 1) AS fystart)
        SELECT
          COALESCE(SUM(dt.brokerage_earned) FILTER (
            WHERE date_trunc('month',dt.trade_date) = date_trunc('month',(SELECT md FROM mx))),0)::float AS mtd_brokerage,
          COALESCE(SUM(dt.brokerage_earned) FILTER (
            WHERE dt.trade_date >= (SELECT fystart FROM fy)),0)::float AS ytd_brokerage,
          COUNT(DISTINCT dt.ucc) FILTER (
            WHERE date_trunc('month',dt.trade_date) = date_trunc('month',(SELECT md FROM mx))
            AND dt.brokerage_earned > 0)::int AS revenue_clients
        FROM daily_trades dt
        JOIN clients c ON c.ucc = dt.ucc AND c.assigned_rm_id = $1
      `, [rmId]),
      // Monthly brokerage (last 6 months) for this RM's clients
      pool.query(`
        SELECT to_date(cms.month_year||'-01','YYYY-MM-DD') AS ms,
               COALESCE(SUM(cms.brokerage),0)::float AS brokerage
        FROM client_monthly_summary cms
        JOIN clients c ON c.ucc = cms.ucc AND c.assigned_rm_id = $1
        WHERE cms.month_year >= to_char((SELECT MAX(trade_date) FROM daily_trades) - INTERVAL '6 months','YYYY-MM')
        GROUP BY 1 ORDER BY 1
      `, [rmId]),
      // Monthly MTF interest for this RM's clients
      pool.query(`
        SELECT m.month_year AS ym, COALESCE(SUM(m.interest_earned),0)::float AS mtf
        FROM mtf_monthly m
        JOIN clients c ON c.ucc = m.ucc AND c.assigned_rm_id = $1
        GROUP BY 1 ORDER BY 1
      `, [rmId]),
      // Top 5 clients by MTD brokerage for this RM
      pool.query(`
        SELECT dt.ucc, c.name, COALESCE(SUM(dt.brokerage_earned),0)::float AS mtd_revenue
        FROM daily_trades dt
        JOIN clients c ON c.ucc = dt.ucc AND c.assigned_rm_id = $1
        WHERE date_trunc('month',dt.trade_date) = date_trunc('month',(SELECT MAX(trade_date) FROM daily_trades))
        GROUP BY dt.ucc, c.name
        HAVING COALESCE(SUM(dt.brokerage_earned),0) > 0
        ORDER BY mtd_revenue DESC LIMIT 5
      `, [rmId]),
    ]);

    // Build a month->{Brokerage,MTF} series. Month label maps from 'YYYY-MM' for MTF join.
    const MONF = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mtfByYm = {}; monthlyMtf.rows.forEach(r => { mtfByYm[r.ym] = Number(r.mtf); });
    const monthly = monthlyBrok.rows.map(r => {
      const d = new Date(r.ms);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      return { month: `${MONF[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`,
               Brokerage: Number(r.brokerage), MTF: mtfByYm[ym] || 0 };
    });
    const r0 = rev.rows[0] || {};
    const mtdBrok = Number(r0.mtd_brokerage || 0);
    const mtdMtf  = monthly.length ? monthly[monthly.length-1].MTF : 0;
    const mtdTotal = mtdBrok + mtdMtf;

    const toContact  = parseInt(leads.rows[0].count);      // assigned, not yet opted in
    const interested = parseInt(optedIn.rows[0].count);    // opted in (real lifecycle state)

    res.json({
      rm_name:          userName || 'RM',
      data_as_of:       asOf.rows[0]?.d || null,
      my_clients:       parseInt(clients.rows[0].count),
      capacity:         rmCapacity,                          // real RM capacity (null if unset)
      my_leads:         toContact + interested,              // active = to-contact + interested
      interested_leads: interested,
      to_contact:       toContact,
      churn_alerts:     parseInt(churn.rows[0].count),
      interactions_30d: parseInt(interactions.rows[0].count),
      // Real revenue figures (null-safe; will be 0 when the RM has no mapped clients yet)
      mtd_revenue:      mtdTotal,
      mtd_brokerage:    mtdBrok,
      mtd_mtf:          mtdMtf,
      ytd_revenue:      Number(r0.ytd_brokerage || 0) + monthlyMtf.rows.reduce((s,r)=>s+Number(r.mtf),0),
      revenue_clients:  parseInt(r0.revenue_clients || 0),
      brokerage_share:  mtdTotal > 0 ? Math.round(mtdBrok / mtdTotal * 100) : null,
      monthly,          // [{month, Brokerage, MTF}]
      top_clients:      top.rows.map(t => ({ ucc: t.ucc, name: t.name || t.ucc, mtd_revenue: Number(t.mtd_revenue) })),
    });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

// ── RM monthly performance (My Performance page) ──────────────────
// Real per-month series for the logged-in RM. Revenue, leads assigned, converted and
// interactions are computed from the DB. Target / achieved% / clients-EOM have no data
// source in the system, so they are returned as null (rendered "—", never fabricated).
router.get('/rm-performance', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    const userName   = userResult.rows[0]?.name || '';
    const rmResult   = await pool.query('SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1', [userName]);
    const rmId       = rmResult.rows[0]?.id || null;
    if (!rmId) return res.json({ rm_name: userName || 'RM', months: [] });

    const [brok, mtf, leadsAssigned, converted, inter, targets] = await Promise.all([
      pool.query(`
        SELECT cms.month_year AS ym, COALESCE(SUM(cms.brokerage),0)::float AS brokerage
        FROM client_monthly_summary cms JOIN clients c ON c.ucc = cms.ucc AND c.assigned_rm_id = $1
        WHERE cms.month_year >= to_char((SELECT MAX(trade_date) FROM daily_trades) - INTERVAL '6 months','YYYY-MM')
        GROUP BY 1`, [rmId]),
      pool.query(`
        SELECT m.month_year AS ym, COALESCE(SUM(m.interest_earned),0)::float AS mtf
        FROM mtf_monthly m JOIN clients c ON c.ucc = m.ucc AND c.assigned_rm_id = $1
        GROUP BY 1`, [rmId]),
      pool.query(`
        SELECT to_char(date_trunc('month',assigned_at),'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM lead_pool WHERE COALESCE(assigned_rm_id, assigned_to_rm) = $1 AND assigned_at IS NOT NULL
        GROUP BY 1`, [rmId]),
      pool.query(`
        SELECT to_char(date_trunc('month',updated_at),'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM lead_pool WHERE COALESCE(assigned_rm_id, assigned_to_rm) = $1 AND status = 'mapped'
        GROUP BY 1`, [rmId]),
      pool.query(`
        SELECT to_char(date_trunc('month',created_at),'YYYY-MM') AS ym, COUNT(*)::int AS n
        FROM interactions WHERE rm_id = $1 GROUP BY 1`, [req.user.id]),
      // Per-month revenue targets set by admin (analytics → RM targets). Missing table
      // or no rows → empty, so target stays "—" and nothing is fabricated.
      pool.query(`
        SELECT month_year AS ym, COALESCE(target_amount,0)::float AS target
        FROM rm_targets WHERE rm_id = $1`, [rmId]).catch(() => ({ rows: [] })),
    ]);

    // Build a 6-month spine anchored to the latest trade month.
    const maxRow = await pool.query(`SELECT MAX(trade_date) AS md FROM daily_trades`);
    const md = maxRow.rows[0]?.md ? new Date(maxRow.rows[0].md) : new Date(Date.UTC(2026, 6, 1));
    const MONF = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const map = (rows) => { const m = {}; rows.forEach(r => { m[r.ym] = Number(r.brokerage ?? r.mtf ?? r.n); }); return m; };
    const bM = map(brok.rows), mM = map(mtf.rows), laM = map(leadsAssigned.rows), cM = map(converted.rows), iM = map(inter.rows);
    // Targets keyed by 'YYYY-MM'. Only months with a stored target appear here.
    const tM = {}; (targets.rows || []).forEach(r => { tM[r.ym] = Number(r.target) || 0; });

    const months = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth() - k, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      const revenue = (bM[ym] || 0) + (mM[ym] || 0);
      const target = Object.prototype.hasOwnProperty.call(tM, ym) ? tM[ym] : null;
      months.push({
        month: `${MONF[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`,
        revenue,
        target,                                                     // from rm_targets (admin), else null → "—"
        achieved_pct: (target && target > 0) ? (revenue / target) * 100 : null,
        leads_assigned: laM[ym] || 0,
        converted: cM[ym] || 0,
        clients_eom: null,      // needs historical mapping snapshots
        interactions: iM[ym] || 0,
      });
    }
    res.json({ rm_name: userName || 'RM', months });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

module.exports = router;