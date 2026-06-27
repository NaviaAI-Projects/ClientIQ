const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/auth');

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
  const { name, email, password, role, supervisor_sub_role, agent_number, phone } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, supervisor_sub_role, agent_number, phone) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, email, role`,
      [name, email, hash, role, supervisor_sub_role || null, agent_number || null, phone || null]
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
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;