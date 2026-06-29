const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

router.get('/company', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [total, active, mapped, trades, float_, leads] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query('SELECT COUNT(*) FROM clients WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM clients WHERE is_mapped = true'),
      pool.query('SELECT COALESCE(SUM(brokerage_earned),0) brokerage, COALESCE(SUM(eq_cash_turnover + eq_fo_turnover + commodity_fo_turnover),0) turnover FROM daily_trades WHERE trade_date = $1', [today]),
      pool.query('SELECT COALESCE(SUM(opening_balance),0) total FROM daily_ledger WHERE ledger_date = $1', [today]),
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
        ROUND(SUM(opening_balance) * 6.5 / 100 / 365, 2) as daily_income
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
    const rmResult   = await pool.query('SELECT id FROM rm_master WHERE LOWER(rm_name) = LOWER($1) LIMIT 1', [userName]);
    const rmId       = rmResult.rows[0]?.id || null;

    if (!rmId) {
      console.warn(`No rm_master record for user: ${userName}`);
      return res.json({ my_clients: 0, my_leads: 0, interactions_30d: 0 });
    }

    const [clients, leads, interactions] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM clients WHERE assigned_rm_id = $1', [rmId]),
      pool.query("SELECT COUNT(*) FROM lead_pool WHERE assigned_to_rm = $1 AND status = 'assigned'", [rmId]),
      pool.query(`
        SELECT COUNT(*) FROM interactions
        WHERE rm_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `, [req.user.id])
    ]);

    res.json({
      my_clients:       parseInt(clients.rows[0].count),
      my_leads:         parseInt(leads.rows[0].count),
      interactions_30d: parseInt(interactions.rows[0].count)
    });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

module.exports = router;