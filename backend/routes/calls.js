const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/auth');
const axios    = require('axios');

const SMARTFLO_INBOUND_URL  = 'https://api-smartflo.tatateleservices.com/v1/click_to_call_support';
const CALLER_ID_WITH_CODE   = '919240202965';
const SHAREPRO_URL          = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const SHAREPRO_KEY          = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';

// ── Helper: Get client mobile
async function getClientMobile(ucc) {
  try {
    const result = await pool.query(
      'SELECT mobile FROM clients WHERE ucc = $1', [ucc]
    );
    const mobile = result.rows[0]?.mobile;
    if (mobile) return String(mobile).trim().replace(/\D/g, '');
  } catch (e) {
    console.log('DB mobile fetch failed:', e.message);
  }

  try {
    const response = await axios.post(SHAREPRO_URL,
      { key: SHAREPRO_KEY, ucc: String(ucc) },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const data   = response.data;
    const client = Array.isArray(data) ? data[0] : data;
    if (!client) return null;

    const mobile = client.MobileNumber || client.mobileNumber || client.mobile;
    if (!mobile) return null;

    const cleaned = String(mobile).trim().replace(/\D/g, '');

    try {
      await pool.query(
        'UPDATE clients SET mobile = $1 WHERE ucc = $2',
        [cleaned, ucc]
      );
    } catch (e) { /* ignore */ }

    return cleaned;
  } catch (err) {
    console.error('Sharepro error:', err.message);
    return null;
  }
}

// ── Helper: Clean to 10-digit Indian mobile
function cleanMobile(number) {
  let num = String(number).replace(/\D/g, '');
  if (num.startsWith('91') && num.length === 12) num = num.slice(2);
  if (num.startsWith('0')  && num.length === 11) num = num.slice(1);
  return num.slice(-10);
}

// ── Helper: org-wide click-to-call config from Admin → API Integrations (settings table).
// Falls back to the hardcoded SmartFlo endpoint / caller ID when a field is left blank.
async function getCallConfig() {
  const s = {};
  try {
    const r = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('click_to_call_url','click_to_call_key','caller_id')"
    );
    r.rows.forEach(row => { s[row.key] = row.value; });
  } catch (e) { console.log('call config fetch failed:', e.message); }
  return {
    url:      (s.click_to_call_url || '').trim() || SMARTFLO_INBOUND_URL,
    apiKey:   (s.click_to_call_key || '').trim(),
    callerId: (s.caller_id || '').trim() || CALLER_ID_WITH_CODE,
  };
}

// ══════════════════════════════════════════════
// POST /api/calls/click-to-call
// ══════════════════════════════════════════════
router.post('/click-to-call', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });

  try {
    // 1. Resolve the click-to-call API key. Prefer the org-wide key configured in
    //    Admin → API Integrations (settings.click_to_call_key); fall back to a per-RM
    //    key (users.smartflo_api_key) only if the global one is not set.
    const cfg = await getCallConfig();
    const userResult = await pool.query(
      'SELECT name, phone, smartflo_api_key FROM users WHERE id = $1',
      [req.user.id]
    );
    const rmUser = userResult.rows[0] || {};
    const apiKey = cfg.apiKey || rmUser.smartflo_api_key;

    if (!apiKey) {
      return res.status(400).json({
        message: 'Click-to-call API key not configured. Set it in Admin → API Integrations (Click-to-call → API Key).'
      });
    }

    // 2. Agent number = the RM's phone / SmartFlo extension (SmartFlo dials the agent to bridge).
    //    Digits only, no truncation (an extension can be longer than 10 digits).
    const agentNumber = String(rmUser.phone || '').replace(/\D/g, '');
    if (!agentNumber) {
      return res.status(400).json({
        message: 'Your agent phone number is not set. Add a phone number to your user profile to place calls.'
      });
    }

    // 3. Get client mobile → SmartFlo wants the destination with the 91 country code (e.g. 918248652721)
    const rawMobile = await getClientMobile(ucc);
    if (!rawMobile) {
      return res.status(400).json({
        message: `Could not fetch mobile number for UCC ${ucc}.`
      });
    }

    const clientTen = cleanMobile(rawMobile);
    if (clientTen.length !== 10) {
      return res.status(400).json({
        message: `Invalid client mobile number: ${rawMobile}`
      });
    }
    const destinationNumber = '91' + clientTen;
    const callerId = cleanMobile(cfg.callerId);   // SmartFlo caller_id is the 10-digit DID

    console.log(`Smartflo click-to-call: rm=${rmUser.name} agent=${agentNumber} destination=${destinationNumber} caller_id=${callerId}`);

    // 4. Call SmartFlo — body shape per Tata SmartFlo click_to_call API
    const smartfloRes = await axios.post(cfg.url, {
      async:              1,
      agent_number:       agentNumber,
      destination_number: destinationNumber,
      caller_id:          callerId
    }, {
      headers: {
        accept:         'application/json',
        'content-type': 'application/json',
        // Tata SmartFlo authenticates via the Authorization header, not the body api_key.
        Authorization:  apiKey
      },
      timeout: 10000
    });

    console.log('Smartflo response:', JSON.stringify(smartfloRes.data));

    // 4. Log interaction
    try {
      await pool.query(
        `INSERT INTO interactions
         (ucc, rm_id, interaction_type, notes, outcome, interaction_date)
         VALUES ($1, $2, 'CLICK_TO_CALL', $3, 'INITIATED', NOW())`,
        [ucc, req.user.id,
         `Call initiated to client: ${destinationNumber}`]
      );
    } catch (e) {
      console.log('Interaction log failed:', e.message);
    }

    res.json({
      success: true,
      message: `Call initiated. Client (${destinationNumber}) will receive the call first, then you will be connected.`,
      data:    smartfloRes.data
    });

  } catch (err) {
    console.error('Click to call error:', err.response?.data || err.message);
    res.status(500).json({
      message: err.response?.data?.message || err.message || 'Call failed',
      error:   err.response?.data || err.message
    });
  }
});

// ══════════════════════════════════════════════
// GET /api/calls/test
// ══════════════════════════════════════════════
router.get('/test', auth, async (req, res) => {
  try {
    const cfg = await getCallConfig();
    const u = await pool.query('SELECT smartflo_api_key FROM users WHERE id = $1', [req.user.id]);
    const apiKey = cfg.apiKey || u.rows[0]?.smartflo_api_key;
    res.json({
      success:        !!apiKey,
      message:        apiKey
        ? 'Click-to-call is configured.'
        : 'Click-to-call API key not set. Configure it in Admin → API Integrations.',
      endpoint:       cfg.url,
      caller_id:      cfg.callerId,
      key_configured: !!apiKey,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;