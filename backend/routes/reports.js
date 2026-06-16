const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/top-clients', auth, async (req, res) => {
  try {
    const { limit = 20, from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        SUM(dt.brokerage_earned) total_brokerage,
        SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover) total_turnover,
        SUM(dt.options_premium_turnover) total_options
      FROM daily_trades dt
      JOIN clients c ON dt.ucc = c.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE dt.trade_date BETWEEN $1 AND $2
      GROUP BY c.ucc, c.name, c.client_type, u.name
      ORDER BY total_brokerage DESC
      LIMIT $3
    `, [fromDate, toDate, limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/inactive-clients', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        MAX(dt.trade_date) last_trade_date,
        CURRENT_DATE - MAX(dt.trade_date) days_inactive
      FROM clients c
      LEFT JOIN daily_trades dt ON c.ucc = dt.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE c.is_active = true
      GROUP BY c.ucc, c.name, c.client_type, u.name
      HAVING MAX(dt.trade_date) < NOW() - INTERVAL '30 days' OR MAX(dt.trade_date) IS NULL
      ORDER BY days_inactive DESC NULLS FIRST
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/rm-performance', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT u.id, u.name,
        COUNT(DISTINCT c.ucc) total_clients,
        COALESCE(SUM(dt.brokerage_earned), 0) total_brokerage,
        COALESCE(SUM(dt.eq_cash_turnover + dt.eq_fo_turnover + dt.commodity_fo_turnover), 0) total_turnover,
        COUNT(DISTINCT i.id) total_interactions
      FROM users u
      LEFT JOIN clients c ON c.assigned_rm_id = u.id AND c.is_mapped = true
      LEFT JOIN daily_trades dt ON dt.ucc = c.ucc AND dt.trade_date BETWEEN $1 AND $2
      LEFT JOIN interactions i ON i.rm_id = u.id AND i.interaction_date BETWEEN $1 AND $2
      WHERE u.role = 'rm' AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_brokerage DESC
    `, [fromDate, toDate]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/churn-risk', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.ucc, c.name, c.client_type, u.name as rm_name,
        a.churn_risk_score, a.lead_score, a.ai_notes
      FROM clients c
      JOIN ai_scores a ON c.ucc = a.ucc
      LEFT JOIN users u ON c.assigned_rm_id = u.id
      WHERE a.score_date = (SELECT MAX(score_date) FROM ai_scores)
        AND a.churn_risk_score >= 60
      ORDER BY a.churn_risk_score DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;