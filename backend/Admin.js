// Correct ✅
const bcrypt = require('bcryptjs');
const pool = require('./db'); // use the shared pool

bcrypt.hash('Admin@123', 10).then(hash => {
  pool.query(
    `INSERT INTO users (name, email, password_hash, role) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (email) DO NOTHING`,
    ['Admin', 'admin@navia.com', hash, 'admin']
  ).then(() => {
    console.log('Admin user created!');
    pool.end();
  }).catch(e => {
    console.log('Error:', e.message);
    pool.end();
  });
});