// Shared Sharepro utility — used by calls.js, whatsapp.js, email routes
const axios = require('axios');

const SHAREPRO_URL = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const SHAREPRO_KEY = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';

// Fetch full client details from Sharepro by UCC
async function getClientDetails(ucc) {
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
    return client || null;
  } catch (err) {
    console.error('Sharepro getClientDetails error:', err.message);
    return null;
  }
}

// Get client mobile number
async function getClientMobile(ucc) {
  const client = await getClientDetails(ucc);
  if (!client) return null;
  const mobile = client.MobileNumber || client.mobileNumber || client.mobile;
  return mobile ? String(mobile).trim().replace(/\D/g, '') : null;
}

// Get client email address
async function getClientEmail(ucc) {
  const client = await getClientDetails(ucc);
  if (!client) return null;
  const email = client.EmailAddress || client.emailAddress || client.email;
  return email ? String(email).trim() : null;
}

// Get both mobile and email together (single API call)
async function getClientContact(ucc) {
  const client = await getClientDetails(ucc);
  if (!client) return { mobile: null, email: null };

  const mobile = client.MobileNumber || client.mobileNumber || client.mobile;
  const email  = client.EmailAddress || client.emailAddress || client.email;

  return {
    mobile: mobile ? String(mobile).trim().replace(/\D/g, '') : null,
    email:  email  ? String(email).trim() : null,
    name:   client.ClientName ? String(client.ClientName).trim() : null,
    status: client.cStatus || null
  };
}

module.exports = { getClientDetails, getClientMobile, getClientEmail, getClientContact };
