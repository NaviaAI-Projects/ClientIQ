const pool = require('./db');
const axios = require('axios');

const URL = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const KEY = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';

async function sync() {
  const clients = await pool.query('SELECT TRIM(ucc) as ucc FROM clients');
  console.log('Found', clients.rows.length, 'clients');

  for (const c of clients.rows) {
    const ucc = c.ucc.trim();
    console.log('Processing UCC:', JSON.stringify(ucc));
    try {
      const r = await axios.post(URL,
        { key: KEY, ucc: ucc },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      const d      = Array.isArray(r.data) ? r.data[0] : r.data;
      const email  = (d.EmailAddress  || '').trim() || null;
      const mobile = (d.MobileNumber  || '').trim().replace(/\D/g, '') || null;
      console.log('Sharepro:', email, mobile);

      await pool.query('UPDATE clients SET email = $1 WHERE TRIM(ucc) = $2', [email, ucc]);
      await pool.query('UPDATE clients SET mobile = $1 WHERE TRIM(ucc) = $2', [mobile, ucc]);
      console.log('OK', ucc, email, mobile);
    } catch (e) {
      console.log('ERR', ucc, e.message);
    }
  }

  console.log('Done');
  process.exit(0);
}

sync();