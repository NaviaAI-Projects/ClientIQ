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

// DELETE — permanently remove a user account.
// Guards: an admin cannot delete their own account, and the last remaining active
// admin cannot be deleted (that would lock everyone out). If the account is still
// referenced by other records (foreign keys), we surface a clear message telling
// the admin to deactivate it instead of leaving a confusing 500.
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user id.' });
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const target = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    const user = target.rows[0];

    // Don't allow removing the last active admin.
    if (user.role === 'admin') {
      const admins = await pool.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true AND id <> $1`,
        [id]
      );
      if ((admins.rows[0]?.n || 0) === 0) {
        return res.status(400).json({ message: 'Cannot delete the last active admin. Create another admin first.' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ success: true, message: `User ${user.name} deleted.` });
    await audit(req, 'USER_DELETED', `User ${user.name} (id ${id}, role ${user.role}) deleted`, null, 'success', 'users');
  } catch (err) {
    // 23503 = foreign_key_violation — the user is still referenced elsewhere.
    if (err.code === '23503') {
      return res.status(409).json({
        message: 'This account has linked records and cannot be permanently deleted. Please deactivate it instead.'
      });
    }
    console.log('USER-DELETE ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;