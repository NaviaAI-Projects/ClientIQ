const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {

    const { page = 1, limit = 50, search = '', type = '', status = '', plan = '', rm = '' } = req.query;
    const offset = (page - 1) * limit;

    const conditions = ['(c.name ILIKE $1 OR c.ucc ILIKE $1)'];
    const params     = [`%${search}%`];
    let   idx        = 2;

    if (type) {
      conditions.push(`c.client_type = $${idx++}`);
      params.push(type);
    }
    if (status === 'active')   { conditions.push(`c.is_active = true`); }
    if (status === 'inactive') { conditions.push(`c.is_active = false`); }
    if (status === 'mapped')   { conditions.push(`c.is_mapped = true`); }
    if (status === 'unmapped') { conditions.push(`c.is_mapped = false`); }
    if (plan) {
      conditions.push(`LOWER(c.plan) LIKE $${idx++}`);
      params.push(`%${plan}%`);
    }
    if (rm === 'unmapped') { conditions.push(`c.assigned_rm_id IS NULL`); }

    const WHERE = conditions.join(' AND ');

    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT opening_balance FROM daily_ledger WHERE ucc = c.ucc ORDER BY ledger_date DESC LIMIT 1) as latest_balance,
        (SELECT total_holding_value FROM holdings_summary WHERE ucc = c.ucc ORDER BY holding_date DESC LIMIT 1) as latest_holdings
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE ${WHERE}
      ORDER BY c.name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    const count = await pool.query(`
      SELECT COUNT(*) FROM clients c WHERE ${WHERE}
    `, params);

    res.json({
      clients: result.rows,
      total: parseInt(count.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

router.get('/my/clients', auth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT name FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );

    const userName = userResult.rows[0]?.name || '';

    const rmResult = await pool.query(
      'SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1',
      [userName]
    );

    const rmId = rmResult.rows[0]?.id || null;
    if (!rmId) {
      console.warn(`No rm_master record found for user: ${userName} (id: ${req.user.id})`);
      return res.json([]); // or appropriate empty response
    }

    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT lead_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as lead_score,
        (SELECT churn_risk_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as churn_risk_score
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id = $1
      ORDER BY c.name ASC
    `, [rmId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

router.get('/:ucc/chart-data', auth, async (req, res) => {
  try {
    const { ucc } = req.params;

    // Day-wise chart data over the last 30 days: turnover per segment (daily_trades),
    // opening balance per day (daily_ledger), holding value per day (holdings_summary),
    // and MTF interest per day (mtf_interest periods spread evenly across their days).
    const [trades, ledger, holdings, mtf] = await Promise.all([
      pool.query(`
        SELECT trade_date AS d,
          SUM(eq_cash_turnover)          AS eq_cash,
          SUM(eq_fo_turnover)            AS eq_fo,
          SUM(options_premium_turnover)  AS eq_options,
          SUM(commodity_fo_turnover)     AS comm_fut
        FROM daily_trades
        WHERE ucc = $1 AND trade_date >= NOW() - INTERVAL '30 days'
        GROUP BY trade_date
      `, [ucc]),

      pool.query(`
        SELECT ledger_date AS d, opening_balance AS bal
        FROM daily_ledger
        WHERE ucc = $1 AND ledger_date >= NOW() - INTERVAL '30 days'
      `, [ucc]),

      pool.query(`
        SELECT holding_date AS d, total_holding_value AS hv
        FROM holdings_summary
        WHERE ucc = $1 AND holding_date >= NOW() - INTERVAL '30 days'
      `, [ucc]),

      pool.query(`
        SELECT gs::date AS d, SUM(interest / (GREATEST((to_date - from_date), 0) + 1)) AS mtf
        FROM mtf_interest, LATERAL generate_series(from_date, to_date, interval '1 day') gs
        WHERE ucc = $1 AND gs::date >= NOW() - INTERVAL '30 days'
        GROUP BY gs::date
      `, [ucc]),
    ]);

    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // node-postgres parses a DATE column into a JS Date at the SERVER's local midnight.
    // Using toISOString() here would re-interpret that instant in UTC and, on any server
    // ahead of UTC (e.g. IST +5:30), shift the date back one day (27 Jul -> 26 Jul).
    // Read the LOCAL components instead, which faithfully recover the stored date.
    const iso = (d) => {
      if (d instanceof Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return String(d).slice(0, 10);
    };
    const dayLabel = (k) => { const dt = new Date(k + 'T00:00:00Z'); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`; };

    const dayMap = {};
    // avg_balance is a ledger snapshot: it starts null and we carry the last known value
    // forward (LOCF) so the line stays flat on days the ledger file wasn't uploaded.
    // holding_value defaults to 0 on days with no holdings file, so gap days read as ₹0 and
    // the line runs continuously across the window (no carry-forward of a stale prior value).
    // mtf_interest is a per-day FLOW, so it correctly stays 0 on days with no MTF period.
    const ensure = (k) => (dayMap[k] = dayMap[k] || {
      _k: k, eq_cash: 0, eq_futures: 0, eq_options: 0, comm_fut: 0, comm_opt: 0,
      avg_balance: null, mtf_interest: 0, holding_value: 0,
    });
    trades.rows.forEach(r => { const o = ensure(iso(r.d));
      o.eq_cash = parseFloat(r.eq_cash) || 0; o.eq_futures = parseFloat(r.eq_fo) || 0;
      o.eq_options = parseFloat(r.eq_options) || 0; o.comm_fut = parseFloat(r.comm_fut) || 0; });
    ledger.rows.forEach(r => { ensure(iso(r.d)).avg_balance = parseFloat(r.bal) || 0; });
    holdings.rows.forEach(r => { ensure(iso(r.d)).holding_value = parseFloat(r.hv) || 0; });
    mtf.rows.forEach(r => { ensure(iso(r.d)).mtf_interest = parseFloat(r.mtf) || 0; });

    // Seed the ledger carry-forward from the most recent balance BEFORE the window,
    // so days at the very start of the window aren't blank.
    const [seedBal] = await Promise.all([
      pool.query(`SELECT opening_balance AS v FROM daily_ledger WHERE ucc = $1 AND ledger_date < NOW() - INTERVAL '30 days' ORDER BY ledger_date DESC LIMIT 1`, [ucc]),
    ]);
    let lastBal = seedBal.rows[0] ? parseFloat(seedBal.rows[0].v) || 0 : 0;

    const chartData = Object.values(dayMap)
      .sort((a, b) => (a._k < b._k ? -1 : 1))
      .map(o => {
        // Opening balance is a daily ledger snapshot present on (almost) every day, so we
        // carry the last known value forward to keep the line continuous.
        if (o.avg_balance == null) o.avg_balance = lastBal; else lastBal = o.avg_balance;
        // Holding value: show ONLY the actual holdings snapshots that exist in the DB.
        // Days with no holdings file stay null (no carry-forward), so the chart plots the
        // real snapshot dates and does NOT paint a stale prior value onto later days.
        return { date: dayLabel(o._k), month: dayLabel(o._k), ...o };
      });

    res.json(chartData);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/:ucc', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT lead_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as lead_score,
        (SELECT churn_risk_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as churn_risk_score,
        (SELECT opening_balance FROM daily_ledger WHERE ucc = c.ucc ORDER BY ledger_date DESC LIMIT 1) as latest_balance,
        (SELECT total_holding_value FROM holdings_summary WHERE ucc = c.ucc ORDER BY holding_date DESC LIMIT 1) as latest_holdings
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.ucc = $1
    `, [req.params.ucc]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

module.exports = router;