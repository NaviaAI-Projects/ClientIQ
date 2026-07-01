const pool = require('./db');
pool.query("SELECT mobile FROM clients WHERE ucc = '91760205'").then(r => {
  console.log('Mobile:', JSON.stringify(r.rows[0]));
  console.log('Length:', r.rows[0]?.mobile?.length);
  process.exit();
}).catch(e => { console.log('Error:', e.message); process.exit(); });