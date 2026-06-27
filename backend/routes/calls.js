const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/auth');
const axios    = require('axios');
const { getClientMobile } = require('./sharepro');

const SMARTFLO_URL   = 'https://api-smartflo.tatateleservices.com/v1/click_to_call';
const SMARTFLO_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3MDEyMTgiLCJjciI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vY2xvdWRwaG9uZS50YXRhdGVsZXNlcnZpY2VzLmNvbS90b2tlbi9nZW5lcmF0ZSIsImlhdCI6MTc2NTM2NzYxMCwiZXhwIjoyMDY1MzY3NjEwLCJuYmYiOjE3NjUzNjc2MTAsImp0aSI6IktPOTRqM05adDYwZU1kclQifQ.ArnjuD6Qi29KpkSoCEZQI8fo4JpzP7XxuBaadVG20M0';
const CALLER_ID      = '9240202965';

router.post('/click-to-call', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });

  try {
    const userResult = await pool.query(
      'SELECT name, agent_number FROM users WHERE id = $1', [req.user.id]
    );
    const rmUser = userResult.rows[0];

    if (!rmUser?.agent_number) {
      return res.status(400).json({
        message: 'Your Smartflo agent number is not set. Ask admin to add it in Users & Roles → Edit.'
      });
    }

    const clientMobile = await getClientMobile(ucc);
    if (!clientMobile) {
      return res.status(400).json({ message: `Could not fetch mobile for UCC ${ucc} from Sharepro.` });
    }

    console.log(`Smartflo call: agent=${rmUser.agent_number} destination=${clientMobile} caller_id=${CALLER_ID}`);

    const smartfloRes = await axios.post(SMARTFLO_URL, {
      async:              1,
      agent_number:       rmUser.agent_number,
      destination_number: clientMobile,
      caller_id:          CALLER_ID
    }, {
      headers: {
        Authorization: `Bearer ${SMARTFLO_TOKEN}`,
        'accept':       'application/json',
        'content-type': 'application/json'
      },
      timeout: 10000
    });

    await pool.query(
      `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
       VALUES ($1, $2, 'call', $3, 'initiated', NOW())`,
      [ucc, req.user.id, `Smartflo click-to-call. Agent: ${rmUser.agent_number}, Client: ${clientMobile}`]
    );

    res.json({ success: true, message: `Call initiated to ${clientMobile}. Your phone will ring first.`, data: smartfloRes.data });

  } catch (err) {
    console.error('Smartflo error:', { status: err.response?.status, data: err.response?.data, message: err.message });
    res.status(500).json({ message: 'Call failed', error: err.response?.data || err.message });
  }
});

router.get('/test', auth, async (req, res) => {
  res.json({ success: true, message: `✓ Smartflo configured. Caller ID: ${CALLER_ID}` });
});

module.exports = router;
