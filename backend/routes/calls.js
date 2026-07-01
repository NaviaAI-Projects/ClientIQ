const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/auth');
const axios    = require('axios');

const SMARTFLO_URL   = 'https://api-smartflo.tatateleservices.com/v1/click_to_call';
const SMARTFLO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3MDEyMTgiLCJjciI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vY2xvdWRwaG9uZS50YXRhdGVsZXNlcnZpY2VzLmNvbS90b2tlbi9nZW5lcmF0ZSIsImlhdCI6MTc2NDE1NjIxOCwiZXhwIjoyMDY0MTU2MjE4LCJuYmYiOjE3NjQxNTYyMTgsImp0aSI6Ind6MmdGeVFScmY3VHROVGgifQ.1AypWFZfEtJvLnhu6Qvs-hU03toPbBBKcrdtOnY2i0U';
const CALLER_ID      = '919240202965';
const SHAREPRO_URL   = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const SHAREPRO_KEY   = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';

// Fetch mobile — first try DB, then Sharepro
async function getClientMobile(ucc) {
  try {
    const result = await pool.query('SELECT mobile FROM clients WHERE ucc = $1', [ucc]);
    const mobile = result.rows[0]?.mobile;
    if (mobile) {
      console.log(`Mobile from DB: ${mobile}`);
      return mobile.trim().replace(/\D/g, '');
    }
  } catch (e) {
    console.log('DB mobile fetch failed:', e.message);
  }

  try {
    console.log(`Fetching mobile from Sharepro for UCC: ${ucc}`);
    const response = await axios.post(SHAREPRO_URL,
      { key: SHAREPRO_KEY, ucc: String(ucc) },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const data   = response.data;
    const client = Array.isArray(data) ? data[0] : data;
    if (!client) {
      console.log('Sharepro returned no data for UCC:', ucc);
      return null;
    }
    const mobile = client.MobileNumber || client.mobileNumber || client.mobile;
    if (!mobile) {
      console.log('No mobile in Sharepro response:', JSON.stringify(client));
      return null;
    }
    let cleaned = String(mobile).trim().replace(/\D/g, '');
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      cleaned = cleaned.slice(2);
    }
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }

    try {
      await pool.query('UPDATE clients SET mobile = $1 WHERE ucc = $2', [cleaned, ucc]);
      console.log(`Saved mobile ${cleaned} to DB for UCC ${ucc}`);
    } catch (e) { /* ignore if mobile column doesn't exist yet */ }

    return cleaned;
  } catch (err) {
    console.error('Sharepro error:', err.message);
    return null;
  }
}

router.post('/click-to-call', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });

  try {
    const userResult = await pool.query('SELECT name, agent_number FROM users WHERE id = $1', [req.user.id]);
    const rmUser = userResult.rows[0];

    if (!rmUser?.agent_number) {
      return res.status(400).json({ message: 'Your Smartflo agent number is not set. Ask admin to add it in Users & Roles → Edit.' });
    }

    const clientMobile = await getClientMobile(ucc);
    if (!clientMobile) {
      return res.status(400).json({ message: `Could not fetch mobile number for UCC ${ucc}.` });
    }

    // Always use exactly 10 digits — take last 10 digits of cleaned number
    let destinationNumber = String(clientMobile).replace(/\D/g, '');
    destinationNumber = destinationNumber.slice(-10);

    console.log(`Smartflo call: agent=${rmUser.agent_number} destination=${destinationNumber} caller_id=${CALLER_ID}`);

    if (destinationNumber.length !== 10) {
      return res.status(400).json({ message: `Invalid mobile number format for UCC ${ucc}: ${clientMobile}` });
    }

    const smartfloRes = await axios.post(SMARTFLO_URL, {
      async:              1,
      agent_number:       rmUser.agent_number,
      destination_number: destinationNumber,
      caller_id:          CALLER_ID
    }, {
      headers: {
        Authorization: `Bearer ${SMARTFLO_TOKEN}`,
        'accept':       'application/json',
        'content-type': 'application/json'
      },
      timeout: 10000
    });

    console.log('Smartflo response:', JSON.stringify(smartfloRes.data));

    await pool.query(
      `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
       VALUES ($1, $2, 'call', $3, 'initiated', NOW())`,
      [ucc, req.user.id, `Smartflo click-to-call. Agent: ${rmUser.agent_number}, Client: ${destinationNumber}`]
    );

    res.json({
      success: true,
      message: `Call initiated to ${destinationNumber}. Your phone will ring first.`,
      data:    smartfloRes.data
    });

  } catch (err) {
    console.error('Smartflo call error:', { status: err.response?.status, data: JSON.stringify(err.response?.data), message: err.message });
    res.status(500).json({
      message: err.response?.data?.message || err.message || 'Call failed',
      error:   err.response?.data || err.message,
      status:  err.response?.status
    });
  }
});

router.get('/test', auth, async (req, res) => {
  res.json({ success: true, message: `✓ Smartflo configured. Caller ID: ${CALLER_ID}` });
});

module.exports = router;