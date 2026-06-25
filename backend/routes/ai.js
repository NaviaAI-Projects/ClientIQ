const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Add this function at the top of the file, after the imports
    async function getWeights(pool) {
      const result = await pool.query(
        `SELECT key, value FROM settings 
        WHERE key IN (
          'options_to_weight','float_weight','equity_weight',
          'mtf_weight','nri_weight','dormancy_weight',
          'lead_score_threshold'
        )`
      );
      const w = {};
      result.rows.forEach(r => { w[r.key] = parseFloat(r.value); });
      return {
        options:   w.options_to_weight   || 35,
        float:     w.float_weight        || 20,
        equity:    w.equity_weight       || 20,
        mtf:       w.mtf_weight          || 10,
        nri:       w.nri_weight          || 8,
        dormancy:  w.dormancy_weight     || 7,
        threshold: w.lead_score_threshold || 60
      };
    }

router.post('/rescore', auth, async (req, res) => {
  try {
    const clients = await pool.query(`
      SELECT
        c.ucc,
        c.name,
        COALESCE(SUM(dt.options_premium_turnover), 0) AS options_turnover,
        COALESCE(SUM(dt.eq_cash_turnover), 0) AS equity_turnover,
        COALESCE(MAX(dl.opening_balance), 0) AS ledger_balance,
        COALESCE(MAX(hs.total_holding_value), 0) AS holding_value,
        COALESCE(MAX(mtf.avg_mtf_balance), 0) AS mtf_balance,
        MAX(c.last_trade_date) AS last_trade_date
      FROM clients c
      LEFT JOIN daily_trades dt ON c.ucc = dt.ucc
      LEFT JOIN daily_ledger dl ON c.ucc = dl.ucc
      LEFT JOIN holdings_summary hs ON c.ucc = hs.ucc
      LEFT JOIN mtf_monthly mtf ON c.ucc = mtf.ucc
      GROUP BY c.ucc, c.name
    `);

    let processed = 0;

    const weights = await getWeights(pool);

    for (const client of clients.rows) {
      const optionsScore = Number(client.options_turnover) > 0 ? weights.options : 0;
      const floatScore = Number(client.ledger_balance) >= 50000 ? weights.float :
                        Number(client.ledger_balance) >= 10000 ? weights.float / 2 : 0;
      const equityScore = Number(client.equity_turnover) > 0 ? weights.equity : 0;
      const mtfScore = Number(client.mtf_balance) > 0 ? weights.mtf : 0;
      const nriScore = ['NRI','NRE','NRO','NRE-HV','NRO-HV'].includes(client.client_type) ? weights.nri : 0;

      let dormancyScore = 0;
      if (client.last_trade_date) {
        const lastTrade = new Date(client.last_trade_date);
        const today = new Date();
        const diffDays = Math.floor((today - lastTrade) / (1000 * 60 * 60 * 24));
        // 2+ missed expiry weeks ≈ 14+ days; 4+ weeks ≈ 28+ days
        dormancyScore = diffDays >= 28 ? weights.dormancy : diffDays >= 14 ? Math.round(weights.dormancy / 2) : 0;
      }

      const leadScore = Math.min(
        optionsScore + floatScore + equityScore + mtfScore + nriScore,
        100
      );

      const churnRiskScore = Math.min(dormancyScore, 100);

      const aiNotes =
        leadScore >= 60
          ? 'High opportunity client. Recommended for RM follow-up.'
          : 'Low opportunity client currently. Monitor activity.';

      await pool.query(`
        INSERT INTO ai_scores
        (
          ucc,
          score_date,
          lead_score,
          churn_risk_score,
          options_score,
          float_score,
          equity_score,
          mtf_score,
          nri_score,
          dormancy_score,
          ai_notes,
          created_at
        )
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (ucc, score_date) DO UPDATE
        SET
          lead_score = EXCLUDED.lead_score,
          churn_risk_score = EXCLUDED.churn_risk_score,
          options_score = EXCLUDED.options_score,
          float_score = EXCLUDED.float_score,
          equity_score = EXCLUDED.equity_score,
          mtf_score = EXCLUDED.mtf_score,
          nri_score = EXCLUDED.nri_score,
          dormancy_score = EXCLUDED.dormancy_score,
          ai_notes = EXCLUDED.ai_notes
      `, [
        client.ucc,
        leadScore,
        churnRiskScore,
        optionsScore,
        floatScore,
        equityScore,
        mtfScore,
        nriScore,
        dormancyScore,
        aiNotes
      ]);

      if (leadScore >= weights.threshold) {
        await pool.query(`
          INSERT INTO lead_pool
          (
            ucc,
            lead_score,
            churn_risk_score,
            status,
            created_at
          )
          VALUES ($1, $2, $3, 'unassigned', NOW())
          ON CONFLICT (ucc) DO UPDATE
          SET
            lead_score = EXCLUDED.lead_score,
            churn_risk_score = EXCLUDED.churn_risk_score,
            status = lead_pool.status
        `, [
          client.ucc,
          leadScore,
          churnRiskScore
        ]);
      }

      processed++;
    }

    res.json({
      message: 'AI scoring completed successfully',
      processed
    });

  } catch (err) {
    console.error('AI RESCORE ERROR:', err);
    res.status(500).json({
      message: 'AI scoring failed',
      error: err.message
    });
  }
});

module.exports = router;