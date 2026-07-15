const pool = require('../db');

const audit = async (req, action, details = '', target_ucc = null, status = 'success', module = '') => {
  try {
    const user_id  = req.user?.id || null;
    const ip       = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    await pool.query(`
      INSERT INTO audit_log (action, module, performed_by, target_ucc, details, ip_address, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() AT TIME ZONE 'Asia/Kolkata')
    `, [action, module, user_id, target_ucc, details, ip, status]);
  } catch (err) {
    console.warn('Audit log error:', err.message);
  }
};

module.exports = audit;