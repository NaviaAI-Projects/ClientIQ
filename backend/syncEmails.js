const pool = require('./db');
const axios = require('axios');
const URL = 'https://backoffice.navia.co.in/shrdbms/dotnet/api/stansoft/GetClientDetails';
const KEY = 'e0JDQzRGQzRCLTU1QTEtNEM0Qi04M0E1LURGRjA0NERCNzgxRX0=';
async function sync() {
  const clients = await pool.query('SELECT ucc FROM clients');
  console.log('Found', clients.rows.length, 'clients');
  for (const c of clients.rows) {
    try {
      const r = await axios.post(URL, { key: KEY, ucc: String(c.ucc) }, { headers: {'Content-Type':'application/json'}, timeout: 8000 });
      const d = Array.isArray(r.data) ? r.data[0] : r.data;
      const email = (d.EmailAddress||'').trim() || null;
      const mobile = (d.MobileNumber||'').trim().replace(/\D/g,'') || null;
      const name = (d.ClientName||'').trim() || null;
      await pool.query('UPDATE clients SET email =  WHERE ucc = ', [email, c.ucc]);
      await pool.query('UPDATE clients SET mobile =  WHERE ucc = ', [mobile, c.ucc]);
      if (name) await pool.query('UPDATE clients SET name =  WHERE ucc = ', [name, c.ucc]);
      console.log('OK', c.ucc, name, email);
    } catch(e) { console.log('ERR', c.ucc, e.message); }
  }
  console.log('Done'); process.exit(0);
}
sync();
