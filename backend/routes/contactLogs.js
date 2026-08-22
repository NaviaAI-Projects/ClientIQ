const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// interactions.follow_up_time is added by a migration; until it's run we simply skip it,
// so logging keeps working. Checked once and cached.
let _hasFollowUpTime = null;
async function followUpTimeExists() {
  if (_hasFollowUpTime !== null) return _hasFollowUpTime;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='interactions' AND column_name='follow_up_time' LIMIT 1`
    );
    _hasFollowUpTime = r.rowCount > 0;
  } catch { _hasFollowUpTime = false; }
  return _hasFollowUpTime;
}

// Map a raw interaction_type to a friendly label the frontend understands.
// (Contact Log / Interaction Log read `type`, `channel`, `duration_minutes`, `interaction_date`, `is_lead`.)
const TYPE_CASE = `
  CASE
    WHEN UPPER(i.interaction_type) LIKE '%CLICK%'    THEN 'Click-to-call'
    WHEN UPPER(i.interaction_type) LIKE '%WHATSAPP%' THEN 'WhatsApp'
    WHEN UPPER(i.interaction_type) LIKE '%EMAIL%'    THEN 'Email'
    WHEN UPPER(i.interaction_type) LIKE '%MEET%'     THEN 'Meeting'
    WHEN UPPER(i.interaction_type) LIKE '%CALL%'     THEN 'Call'
    WHEN i.interaction_type IS NULL OR i.interaction_type = '' THEN 'Note'
    ELSE i.interaction_type
  END`;

// GET /api/contact-logs — interactions for the logged-in RM.
// Optional query: ?ucc=<UCC>  (single client)   ?limit=<n>   (default 50)
router.get('/', auth, async (req, res) => {
  try {
    const { ucc } = req.query;
    const limit   = Math.min(parseInt(req.query.limit) || 50, 200);

    const params = [req.user.id];
    let uccFilter = '';
    if (ucc) { params.push(ucc); uccFilter = `AND i.ucc = $${params.length}`; }
    params.push(limit);
    const limitIdx = params.length;

    const result = await pool.query(`
      SELECT DISTINCT ON (i.ucc, i.interaction_type, DATE(COALESCE(i.interaction_date, i.created_at)),
             COALESCE(SUBSTRING(i.notes FROM 'Subject: (.+)'), i.notes))
        i.id, i.ucc,
        COALESCE(i.client_name, c.name) AS client_name,
        COALESCE(i.client_name, c.name) AS name,
        ${TYPE_CASE} AS type,
        ${TYPE_CASE} AS channel,
        i.interaction_type AS raw_type,
        i.outcome,
        i.notes,
        i.follow_up_date,
        COALESCE(i.interaction_date, i.created_at) AS interaction_date,
        CASE WHEN i.duration_seconds IS NULL THEN NULL
             ELSE ROUND(i.duration_seconds / 60.0)::int END AS duration_minutes,
        i.duration_seconds,
        (c.is_mapped IS NOT TRUE) AS is_lead
      FROM interactions i
      LEFT JOIN clients c ON i.ucc = c.ucc
      WHERE i.rm_id = $1
        ${uccFilter}
        AND (i.notes IS NULL OR (i.notes NOT LIKE '%from alert@navia.co.in%' AND i.notes NOT LIKE '%sent to 9%'))
      ORDER BY i.ucc, i.interaction_type,
               DATE(COALESCE(i.interaction_date, i.created_at)),
               COALESCE(SUBSTRING(i.notes FROM 'Subject: (.+)'), i.notes),
               COALESCE(i.interaction_date, i.created_at) DESC
      LIMIT $${limitIdx}
    `, params);

    // DISTINCT ON forces its own ordering; re-sort newest-first for display.
    const rows = result.rows.sort((a, b) =>
      new Date(b.interaction_date) - new Date(a.interaction_date));

    res.json(rows);
  } catch (err) {
    console.error('contact-logs GET error:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// POST /api/contact-logs — log an interaction.
// Accepts either {type,...} (Contact Log page) or {interaction_type,...} (other callers).
router.post('/', auth, async (req, res) => {
  const {
    ucc, type, interaction_type, channel, outcome, notes,
    duration, duration_seconds, datetime, follow_up_date, follow_up_time
  } = req.body;

  const finalType = type || interaction_type || channel || 'Note';

  // Duration may arrive as minutes (`duration`) or seconds (`duration_seconds`).
  let durSecs = null;
  if (duration_seconds != null && duration_seconds !== '') durSecs = parseInt(duration_seconds);
  else if (duration != null && duration !== '')            durSecs = Math.round(parseFloat(duration) * 60);
  if (durSecs != null && Number.isNaN(durSecs)) durSecs = null;

  // interaction_date from the form's datetime, else now.
  let interactionDate = null;
  if (datetime) { const d = new Date(datetime); if (!isNaN(d)) interactionDate = d.toISOString(); }

  try {
    const clientRes  = await pool.query('SELECT name FROM clients WHERE ucc = $1 LIMIT 1', [ucc]);
    const clientName = clientRes.rows[0]?.name || null;

    let cols = 'ucc, rm_id, interaction_type, outcome, notes, duration_seconds, follow_up_date, client_name, interaction_date, created_at';
    let vals = '$1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), NOW()';
    const params = [ucc, req.user.id, finalType, outcome, notes, durSecs,
                    follow_up_date || null, clientName, interactionDate];
    // Only include the time column once the migration has added it.
    if (await followUpTimeExists()) {
      cols += ', follow_up_time';
      vals += ', $10::time';
      params.push(follow_up_time || null);
    }

    const result = await pool.query(
      `INSERT INTO interactions (${cols}) VALUES (${vals}) RETURNING *`, params);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('contact-logs POST error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;