const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/auth');
let audit; try { audit = require('../utils/audit'); } catch (e) { audit = async () => {}; }

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

// GET all users — includes permissions, agent_number, phone
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, supervisor_sub_role, permissions,
              agent_number, phone, is_active, created_at 
       FROM users 
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST — create user
router.post('/', auth, adminOnly, async (req, res) => {
  const { name, email, password, role, supervisor_sub_role, agent_number, phone, dual_supervisor } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    // Admin + Supervisor dual access is stored as a small flag in permissions.
    const permissions = (role === 'admin' && dual_supervisor) ? JSON.stringify({ dual_supervisor: true }) : null;
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, supervisor_sub_role, agent_number, phone, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, email, role`,
      [name, email, hash, role, supervisor_sub_role || null, agent_number || null, phone || null, permissions]
    );

    if (role === 'rm' || role === 'team_leader') {
      await pool.query(
        `INSERT INTO rm_master (rm_name, capacity, status)
         VALUES ($1, 100, 'active')
         ON CONFLICT DO NOTHING`,
        [name]
      );
    }

    res.json(result.rows[0]);
    await audit(req, 'USER_CREATED', `New user ${name} created with role ${role}`, null, 'success', 'users');
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT — update user including permissions, agent_number, phone
router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name, email, role, supervisor_sub_role, is_active, permissions, agent_number, phone } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET name=$1, email=$2, role=$3, supervisor_sub_role=$4, 
           is_active=$5, permissions=$6, agent_number=$7, phone=$8,
           updated_at=NOW() 
       WHERE id=$9 
       RETURNING id, name, email, role, supervisor_sub_role, permissions, agent_number, phone, is_active`,
      [
        name, email, role,
        supervisor_sub_role || null,
        is_active,
        permissions ? JSON.stringify(permissions) : null,
        agent_number || null,
        phone || null,
        req.params.id
      ]
    );

    if (role === 'rm' || role === 'team_leader') {
      await pool.query(
        `INSERT INTO rm_master (rm_name, capacity, status)
         VALUES ($1, 100, 'active')
         ON CONFLICT DO NOTHING`,
        [name]
      );
    }

    res.json(result.rows[0]);
    await audit(req, 'USER_UPDATED', `User ${req.params.id} updated`, null, 'success', 'users');
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE — permanently remove a user account, KEEPING their logs.
// Guards: an admin cannot delete their own account, and the last remaining active
// admin cannot be deleted (that would lock everyone out).
//
// The old behaviour hit a foreign-key violation (interaction logs, audit trail, etc.
// still reference the user) and told the admin to deactivate instead. Instead we now
// DETACH the log rows — for every table.column that references users(id) and is
// nullable, set it NULL so the rows survive without the account — then delete the
// user. A NOT NULL reference can't be detached without destroying the row, so if any
// such rows exist we stop and report them rather than delete data silently.
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user id.' });
  if (String(req.user.id) === String(id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const qIdent = (s) => '"' + String(s).replace(/"/g, '""') + '"';   // safe-quote a catalog identifier
  const client = await pool.connect();
  try {
    const target = await client.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    const user = target.rows[0];

    // Don't allow removing the last active admin.
    if (user.role === 'admin') {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true AND id <> $1`, [id]);
      if ((admins.rows[0]?.n || 0) === 0) {
        return res.status(400).json({ message: 'Cannot delete the last active admin. Create another admin first.' });
      }
    }

    await client.query('BEGIN');

    // Every table.column that has a foreign key to users(id), with its nullability.
    const refs = await client.query(`
      SELECT kcu.table_name AS child_table, kcu.column_name AS child_column, col.is_nullable
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.constraint_name AND ccu.constraint_schema = rc.constraint_schema
      JOIN information_schema.columns col
        ON col.table_schema = kcu.table_schema AND col.table_name = kcu.table_name AND col.column_name = kcu.column_name
      WHERE ccu.table_name = 'users' AND ccu.column_name = 'id'
    `);

    const blocking = [];
    for (const r of refs.rows) {
      if (r.is_nullable === 'YES') {
        // Keep the log rows; just detach them from the deleted account.
        await client.query(
          `UPDATE ${qIdent(r.child_table)} SET ${qIdent(r.child_column)} = NULL WHERE ${qIdent(r.child_column)} = $1`, [id]);
      } else {
        const c = await client.query(
          `SELECT COUNT(*)::int AS n FROM ${qIdent(r.child_table)} WHERE ${qIdent(r.child_column)} = $1`, [id]);
        if ((c.rows[0]?.n || 0) > 0) blocking.push(`${r.child_table}.${r.child_column} (${c.rows[0].n} rows)`);
      }
    }

    if (blocking.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `This account is required by ${blocking.join(', ')} and can't be removed without deleting those records. Deactivate it instead.`
      });
    }

    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');

    try { await audit(req, 'USER_DELETED', `User ${user.name} (id ${id}, role ${user.role}) deleted; linked logs kept and detached`, null, 'success', 'users'); } catch (_) {}
    res.json({ success: true, message: `User ${user.name} deleted. Their logs were kept and detached from the account.` });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    // 23503 = foreign_key_violation — a reference we couldn't detach (should be rare now).
    if (err.code === '23503') {
      return res.status(409).json({
        message: 'This account has linked records that could not be detached. Please deactivate it instead.'
      });
    }
    console.log('USER-DELETE ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;