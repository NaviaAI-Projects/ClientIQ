const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');

// Normalise interaction types for display — merge the two call kinds into "Call". (combine CLICK_TO_CALL + call)
const normType = (t) => {
  const s = String(t || '').toUpperCase();
  if (s === 'CLICK_TO_CALL' || s === 'CALL' || s === 'PHONE' || s === 'OUTBOUND_CALL') return 'Call';
  if (s === 'WHATSAPP' || s === 'WA') return 'WhatsApp';
  if (s === 'EMAIL' || s === 'MAIL') return 'Email';
  if (s === 'SMS') return 'SMS';
  return t || '—';
};

// Extract a data date from a Symphony-style filename (…20260703… or …08072026…)
const dateFromName = (name) => {
  if (!name) return null;
  const m = String(name).match(/(\d{8})/);
  if (!m) return null;
  const s = m[1];
  const y1 = +s.slice(0, 4), y2 = +s.slice(4, 8);
  if (y1 >= 2000 && y1 <= 2100) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; // YYYYMMDD
  if (y2 >= 2000 && y2 <= 2100) return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`; // DDMMYYYY
  return null;
};

// GET /api/audit-log
// Unified activity feed (#7/#32): file uploads (import_log) + RM conversations
// (interactions) + admin events (audit_log), merged and sorted newest-first.
// Each source is queried independently so one missing table can't blank the page.
router.get('/', auth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  const out = [];

  // ── Uploads ──────────────────────────────────────────────────
  try {
    await pool.query('ALTER TABLE import_log ADD COLUMN IF NOT EXISTS trade_date DATE');
    const r = await pool.query(`
      SELECT il.created_at, il.file_type, il.file_name, il.records_processed,
             il.records_failed, il.status, il.trade_date, u.name AS uname
      FROM import_log il LEFT JOIN users u ON il.imported_by = u.id
      ORDER BY il.created_at DESC LIMIT $1
    `, [limit]);
    r.rows.forEach(x => out.push({
      created_at: x.created_at, category: 'Upload', type: x.file_type,
      reference: x.file_name,
      detail: `${Number(x.records_processed || 0).toLocaleString('en-IN')} records${x.records_failed > 0 ? `, ${x.records_failed} failed` : ''}`,
      status: x.status, trade_date: x.trade_date || dateFromName(x.file_name), user: x.uname,
    }));
  } catch (e) { /* import_log may be absent */ }

  // ── RM conversations ─────────────────────────────────────────
  try {
    const r = await pool.query(`
      SELECT i.created_at, i.interaction_type, i.ucc,
             COALESCE(c.name, i.client_name) AS client_name,
             i.notes, i.outcome, u.name AS rm_name
      FROM interactions i
      LEFT JOIN users u   ON i.rm_id = u.id
      LEFT JOIN clients c ON i.ucc = c.ucc
      WHERE UPPER(COALESCE(i.interaction_type,'')) NOT IN ('CALL','PHONE','OUTBOUND_CALL','INBOUND_CALL','MANUAL_CALL')
      ORDER BY i.created_at DESC LIMIT $1
    `, [limit]);
    r.rows.forEach(x => out.push({
      created_at: x.created_at, category: 'RM Conversation', type: normType(x.interaction_type),
      reference: x.client_name || x.ucc, detail: x.notes, status: x.outcome,
      trade_date: null, user: x.rm_name,
    }));
  } catch (e) { /* interactions may be absent */ }

  // ── Admin events (exclude FILE_IMPORT — already shown as Upload) ─
  try {
    const r = await pool.query(`
      SELECT a.created_at, a.action, a.target_ucc, a.details, a.status, u.name AS uname
      FROM audit_log a LEFT JOIN users u ON a.performed_by = u.id
      WHERE a.action <> 'FILE_IMPORT'
      ORDER BY a.created_at DESC LIMIT $1
    `, [limit]);
    r.rows.forEach(x => out.push({
      created_at: x.created_at, category: 'Admin Event', type: x.action,
      reference: x.target_ucc, detail: x.details, status: x.status,
      trade_date: null, user: x.uname,
    }));
  } catch (e) { /* audit_log may be absent */ }

  out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(out.slice(0, limit));
});

module.exports = router;