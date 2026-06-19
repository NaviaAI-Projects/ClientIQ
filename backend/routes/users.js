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

router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, supervisor_sub_role, is_active, created_at FROM users ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name, email, password, role, supervisor_sub_role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, supervisor_sub_role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role',
      [name, email, hash, role, supervisor_sub_role || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name, email, role, supervisor_sub_role, is_active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET name=$1, email=$2, role=$3, supervisor_sub_role=$4, is_active=$5, updated_at=NOW() WHERE id=$6 RETURNING id, name, email, role',
      [name, email, role, supervisor_sub_role || null, is_active, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;