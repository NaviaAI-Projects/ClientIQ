const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const axios   = require('axios');

const DOOCTI_URL   = 'https://api-naviasp.doocti.com/api/v2/call';
const DOOCTI_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3MDEyMTgiLCJjciI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vY2xvdWRwaG9uZS50YXRhdGVsZXNlcnZpY2VzLmNvbS90b2tlbi9nZW5lcmF0ZSIsImlhdCI6MTc2NTM2NzYxMCwiZXhwIjoyMDY1MzY3NjEwLCJuYmYiOjE3NjUzNjc2MTAsImp0aSI6IktPOTRqM05adDYwZU1kclQifQ.ArnjuD6Qi29KpkSoCEZQI8fo4JpzP7XxuBaadVG20M0';
const DOOCTI_CLI   = '8244784278';
const SHAREPRO_URL = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const SHAREPRO_KEY = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';

async function fetchClientMobile(ucc) {
  try {
    const response = await axios({
      method: 'GET',
      url: SHAREPRO_URL,
      headers: { 'Content-Type': 'application/json' },
      data: { key: SHAREPRO_KEY, ucc: String(ucc) },
      timeout: 8000
    });
    const data   = response.data;
    const client = Array.isArray(data) ? data[0] : data;
    if (!client) return null;
    const mobile = client.MobileNumber || client.mobileNumber || client.mobile;
    return mobile ? String(mobile).trim().replace(/\D/g, '') : null;
  } catch (err) {
    console.error('Sharepro fetch error:', err.message);
    return null;
  }
}

router.post('/click-to-call', auth, async (req, res) => {
  const { ucc } = req.body;
  if (!ucc) return res.status(400).json({ message: 'UCC is required' });

  try {
    // 1. Get RM agent number
    const userResult = await pool.query(
      'SELECT name, agent_number FROM users WHERE id = $1',
      [req.user.id]
    );
    const rmUser = userResult.rows[0];

    if (!rmUser?.agent_number) {
      return res.status(400).json({
        message: 'Your Doocti agent number is not set. Ask admin to add it in Users & Roles → Edit.'
      });
    }

    // 2. Fetch client mobile from Sharepro
    const clientMobile = await fetchClientMobile(ucc);
    if (!clientMobile) {
      return res.status(400).json({
        message: `Could not fetch mobile for UCC ${ucc} from Sharepro.`
      });
    }

    console.log(`Doocti call: agent=${rmUser.agent_number} customer=${clientMobile} cli=${DOOCTI_CLI}`);

    // 3. Call Doocti API
    // Based on Doocti call log fields: station=agent, phone_number=customer
    const requestBody = {
      phone_number: clientMobile,       // customer mobile
      station:      rmUser.agent_number, // RM mobile (agent station)
      cli:          DOOCTI_CLI          // caller ID
    };

    let dooctiRes;
    try {
      dooctiRes = await axios.post(DOOCTI_URL, requestBody, {
        headers: {
          Authorization: `Bearer ${DOOCTI_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      console.log('Doocti success:', dooctiRes.data);
    } catch (err) {
      // Log full error details for debugging
      console.error('Doocti error details:', {
        status:  err.response?.status,
        data:    JSON.stringify(err.response?.data),
        message: err.message
      });
      throw err;
    }

    // 4. Log interaction
    await pool.query(
      `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
       VALUES ($1, $2, 'call', $3, 'initiated', NOW())`,
      [ucc, req.user.id,
       `Doocti click-to-call. Agent: ${rmUser.agent_number}, Client: ${clientMobile}`]
    );

    res.json({
      success: true,
      message: `Call initiated to ${clientMobile}`,
      data:    dooctiRes.data
    });

  } catch (err) {
    res.status(500).json({
      message: 'Call failed',
      error:   err.response?.data || err.message,
      status:  err.response?.status
    });
  }
});

router.get('/test', auth, async (req, res) => {
  res.json({
    success: true,
    message: `✓ Doocti configured. CLI: ${DOOCTI_CLI}. URL: ${DOOCTI_URL}`
  });
});

module.exports = router;