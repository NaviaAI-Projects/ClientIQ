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

    // Optional dormant filter (used by the Dormant Clients page): mapped clients who
    // previously traded but have had no trade for >3 months. Default (no param) is
    // unchanged — returns all of the RM's mapped clients (used by Mapped Clients).
    const dormantOnly = req.query.dormant === 'true';
    const dormantClause = dormantOnly
      ? `AND c.last_trade_date IS NOT NULL AND c.last_trade_date < (CURRENT_DATE - INTERVAL '3 months')`
      : '';

    const result = await pool.query(`
      SELECT c.*,
        rm.rm_name as rm_name,
        (SELECT lead_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as lead_score,
        (SELECT churn_risk_score FROM ai_scores WHERE ucc = c.ucc ORDER BY score_date DESC LIMIT 1) as churn_risk_score
      FROM clients c
      LEFT JOIN rm_master rm ON c.assigned_rm_id = rm.id
      WHERE c.assigned_rm_id = $1
      ${dormantClause}
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

// #20 Client 360 income/revenue breakup — 4 sections: Clearing charges, Turnover, Float, MTF.
// Computed over the client's FULL history from the permanent archive (client_monthly_summary /
// mtf_monthly), so it is not capped at the ~90-day raw-detail window.
router.get('/:ucc/income-breakup', auth, async (req, res) => {
  try {
    const { ucc } = req.params;
    const fdRow = await pool.query(`
      SELECT COALESCE(
        (SELECT rate FROM float_rate_history h WHERE h.effective_from <= (SELECT MAX(ledger_date) FROM daily_ledger) ORDER BY h.effective_from DESC LIMIT 1),
        (SELECT value::numeric FROM settings WHERE key='fd_rate'),
        6.5) AS fd_rate`);
    const fdRate = parseFloat(fdRow.rows[0]?.fd_rate ?? 6.5);

    const trade = await pool.query(`
      SELECT COALESCE(SUM(turnover),0)::float           AS turnover,
             COALESCE(SUM(commission_earned),0)::float  AS clearing,
             COALESCE(SUM(brokerage),0)::float          AS brokerage,
             MIN((month_year||'-01')::date) AS from_d,
             (MAX((month_year||'-01')::date) + INTERVAL '1 month - 1 day')::date AS to_d,
             COALESCE(SUM(trade_days),0)::int           AS trade_days
      FROM client_monthly_summary WHERE ucc = $1
    `, [ucc]);

    const mtf = await pool.query(`
      SELECT COALESCE(SUM(interest_earned),0)::float AS mtf FROM mtf_monthly WHERE ucc = $1
    `, [ucc]);

    const led = await pool.query(`
      SELECT opening_balance::float AS bal, ledger_date
      FROM daily_ledger WHERE ucc = $1 ORDER BY ledger_date DESC LIMIT 1
    `, [ucc]);
    // Float accrues only on a CREDIT (positive) ledger balance. Monthly estimate = credit × rate ÷ 365 × 30.
    const creditBal = Math.max(0, Number(led.rows[0]?.bal || 0));
    const floatMonthly = creditBal * (fdRate / 100) / 365 * 30;

    const t = trade.rows[0] || {};
    const clearing = Number(t.clearing || 0);
    const mtfInterest = Number(mtf.rows[0]?.mtf || 0);

    res.json({
      fd_rate: fdRate,
      window: { from: t.from_d || null, to: t.to_d || null, trade_days: Number(t.trade_days || 0) },
      turnover: Number(t.turnover || 0),
      clearing,
      brokerage: Number(t.brokerage || 0),
      mtf_interest: mtfInterest,
      float_income: floatMonthly,
      ledger_balance: creditBal,
      ledger_date: led.rows[0]?.ledger_date || null,
      // Revenue = income streams only (turnover is volume, shown for context, not summed here)
      total_income: clearing + mtfInterest + floatMonthly,
    });
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

// ════════════════════════════════════════════════════════════════════════════
// POST /api/clients/ingest — machine-to-machine client creation for the
// account-opening cron. Authenticated with the shared TRADING_APP_API_KEY via the
// `X-API-Key` header (NOT the human JWT). Idempotent upsert on ucc, so the cron can
// safely re-push the same day's accounts without creating duplicates.
//
// Body — a single record, an array, or { clients: [...] }. Field aliases accepted:
//   ucc               (required)  [uccode, ucc_code, client_code]
//   name                          [client_name, clientName]
//   client_type       default RI  [type, clientType]
//   account_open_date             [open_date, regd_date, account_open]  YYYY-MM-DD (DD-MM-YYYY / DD/MM/YYYY also parsed)
//   status            default Active [account_status, overall_status]
//   email
//
// Returns { ok, received, created, updated, skipped, errors[] }. plan is set to
// 'Zero-brokerage' on create (the brokerage import later promotes payers to 'Brokerage')
// and is never overwritten on update. account_open_date/name are never blanked on update.
// ════════════════════════════════════════════════════════════════════════════
router.post('/ingest', async (req, res) => {
  // ── API-key auth (server-to-server) ──
  const provided = req.headers['x-api-key'] || req.headers['x-apikey'] || req.query.api_key;
  const expected = process.env.TRADING_APP_API_KEY;
  if (!expected) return res.status(500).json({ message: 'Ingest key not configured (TRADING_APP_API_KEY)' });
  if (!provided || String(provided) !== String(expected)) {
    return res.status(401).json({ message: 'Invalid or missing API key' });
  }

  // ── Normalise the body into an array of records ──
  const body = req.body;
  const list = Array.isArray(body) ? body
    : Array.isArray(body?.clients) ? body.clients
    : (body && typeof body === 'object' && Object.keys(body).length) ? [body]
    : [];
  if (!list.length) return res.status(400).json({ message: 'No client records provided' });
  if (list.length > 5000) return res.status(413).json({ message: 'Batch too large — send ≤ 5000 records per call' });

  const pick = (r, ...keys) => { for (const k of keys) { const v = r?.[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return null; };
  const toISO = (s) => {
    if (!s) return null;
    s = String(s).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)))            return `${m[1]}-${m[2]}-${m[3]}`;   // ISO
    if ((m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)))     return `${m[3]}-${m[2]}-${m[1]}`;   // DD-MM-YYYY / DD/MM/YYYY
    const d = new Date(s);                                                                        // last resort
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  const result = { received: list.length, created: 0, updated: 0, skipped: 0, errors: [] };
  try {
    // Ensure the optional email column exists (idempotent), so the upsert can set it.
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT`).catch(() => {});

    for (let i = 0; i < list.length; i++) {
      const r = list[i] || {};
      const ucc  = pick(r, 'ucc', 'uccode', 'ucc_code', 'client_code');
      if (!ucc) { result.skipped++; if (result.errors.length < 50) result.errors.push({ index: i, error: 'ucc is required' }); continue; }
      const name       = pick(r, 'name', 'client_name', 'clientName');
      // NRI rule: any UCC beginning with 'N' is an NRI client — the prefix is authoritative,
      // so newly-ingested accounts are classified correctly even when the cron omits client_type.
      const clientType = String(ucc).toUpperCase().startsWith('N')
        ? 'NRI'
        : (pick(r, 'client_type', 'clientType', 'type') || 'RI');
      const openDate   = toISO(pick(r, 'account_open_date', 'open_date', 'regd_date', 'account_open'));
      const statusRaw  = pick(r, 'status', 'account_status', 'overall_status') || 'Active';
      const email      = pick(r, 'email');
      const st         = statusRaw.toLowerCase();
      const isActive   = st.includes('active') && !st.includes('inactive');   // "inactive" contains "active"

      try {
        const up = await pool.query(`
          INSERT INTO clients (ucc, name, client_type, plan, account_open_date, is_active, status, email, created_at, updated_at)
          VALUES ($1, $2, $3, 'Zero-brokerage', $4::date, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (ucc) DO UPDATE SET
            name              = COALESCE(EXCLUDED.name, clients.name),
            client_type       = EXCLUDED.client_type,
            account_open_date = COALESCE(EXCLUDED.account_open_date, clients.account_open_date),
            is_active         = EXCLUDED.is_active,
            status            = EXCLUDED.status,
            email             = COALESCE(EXCLUDED.email, clients.email),
            updated_at        = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [ucc, name, clientType, openDate, isActive, statusRaw, email]);
        if (up.rows[0]?.inserted) result.created++; else result.updated++;
      } catch (e) {
        result.skipped++; if (result.errors.length < 50) result.errors.push({ index: i, ucc, error: e.message });
      }
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('CLIENT-INGEST ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/clients/status — server-to-server STATUS updates (account closures etc.)
// Companion to /ingest: the in-house cron calls this when a client's status changes
// (e.g. an account is closed / suspended / reactivated). Same `X-API-Key` auth.
//
// Body — a single record, an array, or { clients: [...] }. Field aliases:
//   ucc     (required)  [uccode, ucc_code, client_code]
//   status  (required)  [account_status, overall_status]   e.g. Closed / Active / Suspended / Dormant
//
// Only UPDATES existing clients (never creates — creation is /ingest). is_active is
// derived from the status text. When a client is closed, their lead_pool entry is
// retired ('closed') so they drop out of the Unmapped Pool. Idempotent per ucc.
// Returns { ok, received, updated, not_found, skipped, closed, errors[] }.
// ════════════════════════════════════════════════════════════════════════════
router.post('/status', async (req, res) => {
  // ── API-key auth (server-to-server) — same key as /ingest ──
  const provided = req.headers['x-api-key'] || req.headers['x-apikey'] || req.query.api_key;
  const expected = process.env.TRADING_APP_API_KEY;
  if (!expected) return res.status(500).json({ message: 'Ingest key not configured (TRADING_APP_API_KEY)' });
  if (!provided || String(provided) !== String(expected)) {
    return res.status(401).json({ message: 'Invalid or missing API key' });
  }

  const body = req.body;
  const list = Array.isArray(body) ? body
    : Array.isArray(body?.clients) ? body.clients
    : (body && typeof body === 'object' && Object.keys(body).length) ? [body]
    : [];
  if (!list.length) return res.status(400).json({ message: 'No status records provided' });
  if (list.length > 5000) return res.status(413).json({ message: 'Batch too large — send ≤ 5000 records per call' });

  const pick = (r, ...keys) => { for (const k of keys) { const v = r?.[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return null; };

  const result = { received: list.length, updated: 0, not_found: 0, skipped: 0, closed: 0, errors: [] };
  try {
    for (let i = 0; i < list.length; i++) {
      const r = list[i] || {};
      const ucc       = pick(r, 'ucc', 'uccode', 'ucc_code', 'client_code');
      const statusRaw = pick(r, 'status', 'account_status', 'overall_status');
      if (!ucc)       { result.skipped++; if (result.errors.length < 50) result.errors.push({ index: i, error: 'ucc is required' }); continue; }
      if (!statusRaw) { result.skipped++; if (result.errors.length < 50) result.errors.push({ index: i, ucc, error: 'status is required' }); continue; }

      const st       = statusRaw.toLowerCase();
      const isActive = st.includes('active') && !st.includes('inactive');   // "inactive" contains "active"
      const isClosed = st.startsWith('clos');

      try {
        // Update only — never create. A UCC the app has never seen is reported as not_found.
        const up = await pool.query(
          `UPDATE clients SET status = $2, is_active = $3, updated_at = NOW() WHERE ucc = $1`,
          [ucc, statusRaw, isActive]);
        if (up.rowCount === 0) { result.not_found++; continue; }
        result.updated++;

        // A closed account should leave the Unmapped Pool / lead pipeline so RMs don't work it.
        if (isClosed) {
          await pool.query(`UPDATE lead_pool SET status = 'closed' WHERE ucc = $1 AND status = 'unassigned'`, [ucc]).catch(() => {});
          result.closed++;
        }
      } catch (e) {
        result.skipped++; if (result.errors.length < 50) result.errors.push({ index: i, ucc, error: e.message });
      }
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('CLIENT-STATUS ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;