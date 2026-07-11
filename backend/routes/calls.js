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

// ══════════════════════════════════════════════
// POST /api/calls/click-to-call
// ══════════════════════════════════════════════
router.post('/click-to-call', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });

  try {
    // 1. Get RM's smartflo api key
    const userResult = await pool.query(
      'SELECT name, smartflo_api_key FROM users WHERE id = $1',
      [req.user.id]
    );
    const rmUser = userResult.rows[0];

    if (!rmUser?.smartflo_api_key) {
      return res.status(400).json({
        message: 'Smartflo API key not configured for your account. Contact admin.'
      });
    }

    // 2. Get client mobile
    const rawMobile = await getClientMobile(ucc);
    if (!rawMobile) {
      return res.status(400).json({
        message: `Could not fetch mobile number for UCC ${ucc}.`
      });
    }

    const destinationNumber = cleanMobile(rawMobile);

    if (destinationNumber.length !== 10) {
      return res.status(400).json({
        message: `Invalid client mobile number: ${rawMobile}`
      });
    }

    console.log(`Smartflo click-to-call: rm=${rmUser.name} customer=${destinationNumber}`);

    // 3. Call Smartflo - client gets called first
    const smartfloRes = await axios.post(SMARTFLO_INBOUND_URL, {
      async:                 1,
      customer_number:       destinationNumber,
      customer_ring_timeout: 30,
      caller_id:             CALLER_ID_WITH_CODE,
      api_key:               rmUser.smartflo_api_key
    }, {
      headers: {
        accept:         'application/json',
        'content-type': 'application/json'
      },
      timeout: 10000
    });

    console.log('Smartflo response:', JSON.stringify(smartfloRes.data));

    // 4. Log interaction
    try {
  await pool.query(
    `INSERT INTO interactions
     (ucc, rm_id, interaction_type, notes, outcome, call_ref_id, call_status, interaction_date, created_at)
     VALUES ($1, $2, 'CALL', $3, 'INITIATED', $4, 'INITIATED', NOW(), NOW())`,
    [
      ucc,
      req.user.id,
      `Click-to-call to client: ${destinationNumber}`,
      smartfloRes.data.ref_id || smartfloRes.data.uuid || null
    ]
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
  res.json({
    success:  true,
    message:  'Smartflo configured correctly',
    endpoint: SMARTFLO_INBOUND_URL
  });
});

// ══════════════════════════════════════════════
// POST /api/calls/webhook
// Smartflo calls this when call ends
// ══════════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    console.log('Smartflo webhook received:', JSON.stringify(req.body));

    const {
  uuid,
  ref_id,
  call_id, 
  call_status,
  duration,
  recording_url,
} = req.body;

const callId = ref_id || uuid || call_id;

if (!callId) {
  return res.status(200).json({ success: true, message: 'No call ID' });
}

console.log(`Attempting to update call_ref_id: ${callId}`);
const result = await pool.query(
  `UPDATE interactions 
   SET call_status = $1, duration_seconds = $2, recording_url = $3, outcome = $4
   WHERE call_ref_id = $5`,
  [
    call_status || 'COMPLETED',
    parseInt(duration) || 0,
    recording_url || null,
    call_status === 'answered' ? 'CONNECTED' : 'MISSED',
    callId
  ]
);
console.log(`Rows updated: ${result.rowCount}`);

    // Update the interaction row that was created on call initiation
    await pool.query(
  `UPDATE interactions 
   SET call_status      = $1,
       duration_seconds = $2,
       recording_url    = $3,
       outcome          = $4
   WHERE call_ref_id = $5`,
  [
    call_status || 'COMPLETED',
    parseInt(duration) || 0,
    recording_url || null,
    call_status === 'answered' ? 'CONNECTED' : 'MISSED',
    callId  // ← changed from ref_id
  ]
);

    console.log(`Webhook processed: ref_id=${ref_id} status=${call_status} duration=${duration}`);
    res.status(200).json({ success: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ success: true }); // Always return 200 to Smartflo
  }
});
module.exports = router;