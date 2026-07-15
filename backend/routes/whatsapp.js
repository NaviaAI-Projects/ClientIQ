const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/auth');
const axios    = require('axios');
const { getClientMobile } = require('./sharepro');

const WABA_URL     = 'https://waba-v2.360dialog.io/messages';
const WABA_API_KEY = 'fMEhZfQoSD1T80Q7a8Dez1OpAK';

router.post('/send', auth, async (req, res) => {
  const { ucc, template_name, language_code, components } = req.body;
  if (!ucc)           return res.status(400).json({ message: 'UCC is required' });
  if (!template_name) return res.status(400).json({ message: 'template_name is required' });

  try {
    const clientMobile = await getClientMobile(ucc);
    if (!clientMobile) {
      return res.status(400).json({ message: `Could not fetch mobile for UCC ${ucc} from Sharepro.` });
    }

    const toNumber = clientMobile.startsWith('91') ? clientMobile : `91${clientMobile}`;
    console.log(`WhatsApp: template=${template_name} to=${toNumber}`);

    const waRes = await axios.post(WABA_URL, {
      messaging_product: 'whatsapp',
      to:   toNumber,
      type: 'template',
      template: {
        language: { policy: 'deterministic', code: language_code || 'en' },
        name: template_name,
        ...(components ? { components } : {})
      }
    }, {
      headers: { 'D360-API-KEY': WABA_API_KEY, 'Content-Type': 'application/json' },
      timeout: 10000
    });

    await pool.query(
      `INSERT INTO interactions (ucc, rm_id, interaction_type, notes, outcome, created_at)
       VALUES ($1, $2, 'whatsapp', $3, 'sent', NOW())`,
      [ucc, req.user.id, `WhatsApp template "${template_name}" sent to ${toNumber}`]
    );

    res.json({ success: true, message: `WhatsApp sent to ${toNumber}`, data: waRes.data });

  } catch (err) {
    console.error('WhatsApp error:', { status: err.response?.status, data: err.response?.data });
    res.status(500).json({ message: 'WhatsApp send failed', error: err.response?.data || err.message });
  }
});

router.get('/templates', auth, async (req, res) => {
  try {
    const tmplRes = await axios.get('https://waba-v2.360dialog.io/configs/templates', {
      headers: { 'D360-API-KEY': WABA_API_KEY }, timeout: 10000
    });
    res.json({ success: true, templates: tmplRes.data?.waba_templates || [] });
  } catch {
    res.json({ success: true, templates: [
      { name: 'aadhar_nc',           label: 'Aadhaar KYC Reminder' },
      { name: 'optin_lead',          label: 'Lead Opt-in Message' },
      { name: 'dormant_reactivate',  label: 'Dormant Reactivation' },
    ]});
  }
});

router.get('/test', auth, async (req, res) => {
  res.json({ success: true, message: `✓ 360dialog WhatsApp configured. URL: ${WABA_URL}` });
});

module.exports = router;
