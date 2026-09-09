const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendEmail } = require('./emailTriggers');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');

const OTP_TTL_MIN = 10;      // OTP valid for 10 minutes
const OTP_MAX_TRIES = 5;     // wrong-code attempts before the code is burned

// Normalise an email for lookup: trim surrounding whitespace and lowercase it,
// so "  Praveen@Navia.co.in " matches the stored "praveen@navia.co.in".
const normEmail = (e) => String(e || '').trim().toLowerCase();

// One-time: make sure the OTP columns exist on `users`.
// IMPORTANT: `ALTER TABLE` takes an ACCESS EXCLUSIVE lock, so running it in the
// login path can block for minutes if any other session is touching `users`
// (an open pgAdmin query, the live sync, etc.). So we first do a cheap, lock-free
// existence check via information_schema and only ALTER when something is truly
// missing — and even then with a short lock_timeout so login can never hang.
const OTP_COLS = ['otp_hash', 'otp_expires_at', 'otp_attempts'];
let _otpColsReady = false;
async function ensureOtpColumns() {
  if (_otpColsReady) return;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = ANY($1)`,
    [OTP_COLS]
  );
  const have = new Set(rows.map(r => r.column_name));
  if (OTP_COLS.every(c => have.has(c))) { _otpColsReady = true; return; }

  // Some column is missing — add it on a dedicated connection with a short
  // lock_timeout so a busy `users` table can't stall the request.
  const client = await pool.connect();
  try {
    await client.query(`SET lock_timeout = '5s'`);
    if (!have.has('otp_hash'))       await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_hash TEXT`);
    if (!have.has('otp_expires_at')) await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`);
    if (!have.has('otp_attempts'))   await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INT DEFAULT 0`);
    _otpColsReady = true;
  } finally {
    client.release();
  }
}

function issueToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, sub_role: user.supervisor_sub_role || null },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    supervisor_sub_role: user.supervisor_sub_role || null,
    permissions: user.permissions || null
  };
}

// Local dev bypass: when OTP_DEV_MODE=true the code is printed to the server
// console (and returned in the /login response) and email failures are ignored,
// so you can test login without a reachable SMTP host. NEVER set this in prod.
const OTP_DEV_MODE = process.env.OTP_DEV_MODE === 'true';

// Generate a 6-digit OTP, store its hash on the user, and email it.
// Returns { otp, devMode } so the caller can surface the code in dev mode.
async function generateAndSendOtp(user) {
  const otp = String(crypto.randomInt(100000, 1000000));   // 100000–999999
  const otpHash = await bcrypt.hash(otp, 10);
  await pool.query(
    `UPDATE users SET otp_hash = $1, otp_expires_at = NOW() + INTERVAL '${OTP_TTL_MIN} minutes', otp_attempts = 0 WHERE id = $2`,
    [otpHash, user.id]
  );

  const body =
    `Hi ${user.name || ''},\n\n` +
    `Your Navia ClientIQ login verification code is:\n\n` +
    `${otp}\n\n` +
    `This code is valid for ${OTP_TTL_MIN} minutes. Do not share it with anyone.\n\n` +
    `If you did not try to sign in, please ignore this email or contact your administrator.`;

  if (OTP_DEV_MODE) {
    console.log(`\n=======================================\n[DEV OTP] Login code for ${user.email}: ${otp}\n=======================================\n`);
  }

  // Send the email in the BACKGROUND (no await) so login responds in milliseconds
  // regardless of how long the SMTP handshake takes. The OTP is already stored, so
  // the user can verify as soon as the code arrives; if delivery is slow or fails,
  // the "Resend code" button re-triggers it (and in dev mode the on-screen/console
  // code is used instead of email).
  sendEmail(user.email, 'Your Navia ClientIQ login code', body, 'otp', 'Navia ClientIQ')
    .then(() => console.log(`OTP email sent to ${user.email}`))
    .catch((mailErr) => console.log('OTP email send failed for ' + user.email + ':', mailErr.message));

  return { otp, devMode: OTP_DEV_MODE };
}

// ── STEP 1: email + password → sends OTP (no token yet) ─────────────────────
router.post('/login', async (req, res) => {
  const email = normEmail(req.body.email);
  const password = req.body.password;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    await ensureOtpColumns();
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash || '');
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.email) {
      return res.status(400).json({ message: 'No email on file for this account — ask an administrator to add one for OTP login.' });
    }
    // Email is sent in the background inside generateAndSendOtp — this returns
    // immediately, so the OTP page appears in milliseconds.
    const gen = await generateAndSendOtp(user);
    const payload = { otpRequired: true, email: user.email, message: `A 6-digit code was sent to ${user.email}.` };
    if (gen.devMode) {
      payload.devOtp = gen.otp;
      payload.message = `DEV MODE: your code is ${gen.otp} (also printed in the backend console).`;
    }
    res.json(payload);
  } catch (err) {
    console.log('LOGIN ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── STEP 2: email + OTP → issues the JWT ────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const email = normEmail(req.body.email);
  const otp = req.body.otp;
  try {
    if (!email || !otp) return res.status(400).json({ message: 'Email and code are required.' });
    await ensureOtpColumns();
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true',
      [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid request' });
    const user = result.rows[0];

    if (!user.otp_hash || !user.otp_expires_at) {
      return res.status(400).json({ message: 'No active code. Please sign in again.' });
    }
    if (new Date(user.otp_expires_at) < new Date()) {
      await pool.query('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1', [user.id]);
      return res.status(400).json({ message: 'This code has expired. Please sign in again.' });
    }
    if ((user.otp_attempts || 0) >= OTP_MAX_TRIES) {
      await pool.query('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1', [user.id]);
      return res.status(429).json({ message: 'Too many incorrect attempts. Please sign in again.' });
    }

    const ok = await bcrypt.compare(String(otp || ''), user.otp_hash);
    if (!ok) {
      await pool.query('UPDATE users SET otp_attempts = COALESCE(otp_attempts,0) + 1 WHERE id = $1', [user.id]);
      const left = OTP_MAX_TRIES - ((user.otp_attempts || 0) + 1);
      return res.status(401).json({ message: `Incorrect code.${left > 0 ? ` ${left} attempt(s) left.` : ' Please sign in again.'}` });
    }

    // Success — burn the OTP and issue the token.
    await pool.query('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1', [user.id]);
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    console.log('VERIFY-OTP ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Resend the code for an in-progress login ────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  const email = normEmail(req.body.email);
  try {
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    await ensureOtpColumns();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) return res.status(200).json({ message: 'If the account exists, a new code has been sent.' });
    const user = result.rows[0];
    // Only resend when a login was actually started (an OTP is/was pending).
    if (!user.otp_expires_at) return res.status(400).json({ message: 'Please sign in again first.' });
    const gen = await generateAndSendOtp(user);   // email sent in background
    const payload = { message: `A new code was sent to ${user.email}.` };
    if (gen.devMode) {
      payload.devOtp = gen.otp;
      payload.message = `DEV MODE: your code is ${gen.otp} (also printed in the backend console).`;
    }
    res.json(payload);
  } catch (err) {
    console.log('RESEND-OTP ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Shared OTP verification against a user's stored code.
// Returns { ok: true } on success, or { status, message } describing the failure.
// Side effects mirror verify-otp: burns the code on expiry/too-many-tries, and
// increments the attempt counter on a wrong code.
async function checkOtp(user, otp) {
  if (!user.otp_hash || !user.otp_expires_at) {
    return { status: 400, message: 'No active code. Please request a new one.' };
  }
  if (new Date(user.otp_expires_at) < new Date()) {
    await pool.query('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1', [user.id]);
    return { status: 400, message: 'This code has expired. Please request a new one.' };
  }
  if ((user.otp_attempts || 0) >= OTP_MAX_TRIES) {
    await pool.query('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1', [user.id]);
    return { status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
  }
  const ok = await bcrypt.compare(String(otp || ''), user.otp_hash);
  if (!ok) {
    await pool.query('UPDATE users SET otp_attempts = COALESCE(otp_attempts,0) + 1 WHERE id = $1', [user.id]);
    const left = OTP_MAX_TRIES - ((user.otp_attempts || 0) + 1);
    return { status: 401, message: `Incorrect code.${left > 0 ? ` ${left} attempt(s) left.` : ' Please request a new code.'}` };
  }
  return { ok: true };
}

// ── Forgot password: STEP 1 — email → send a reset OTP to that account ───────
router.post('/forgot-password', async (req, res) => {
  const email = normEmail(req.body.email);
  try {
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    await ensureOtpColumns();
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true', [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No active account found for that email.' });
    }
    const user = result.rows[0];
    const gen = await generateAndSendOtp(user);   // email sent in background
    const payload = { otpSent: true, email: user.email, message: `A 6-digit code was sent to ${user.email}.` };
    if (gen.devMode) {
      payload.devOtp = gen.otp;
      payload.message = `DEV MODE: your code is ${gen.otp} (also printed in the backend console).`;
    }
    res.json(payload);
  } catch (err) {
    console.log('FORGOT-PASSWORD ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Forgot password: STEP 2 — email + OTP + new password → change it ─────────
router.post('/reset-password', async (req, res) => {
  const email = normEmail(req.body.email);
  const { otp, new_password } = req.body;
  try {
    if (!email || !otp || !new_password) {
      return res.status(400).json({ message: 'Email, code and new password are required.' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }
    await ensureOtpColumns();
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND is_active = true', [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid request' });
    const user = result.rows[0];

    const check = await checkOtp(user, otp);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    // Code verified — set the new password and burn the OTP.
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0, updated_at = NOW() WHERE id = $2',
      [hash, user.id]
    );
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.log('RESET-PASSWORD ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Change password (any logged-in user) ────────────────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }
    const result = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    const user = result.rows[0];

    const ok = await bcrypt.compare(current_password, user.password_hash || '');
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' });

    const same = await bcrypt.compare(new_password, user.password_hash || '');
    if (same) return res.status(400).json({ message: 'New password must be different from the current one.' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.log('CHANGE-PASSWORD ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    // SELECT * (not a named column list) so a users table missing an OPTIONAL
    // column — supervisor_sub_role or permissions — doesn't 500 this endpoint.
    // Login/verify-otp already read these defensively; /me now matches them, and
    // we return a fixed, safe shape regardless of which columns the table has.
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const u = result.rows[0];
    if (!u) return res.status(404).json({ message: 'User not found' });
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      supervisor_sub_role: u.supervisor_sub_role || null,
      permissions: u.permissions || null
    });
  } catch (err) {
    console.log('ME ERROR:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
