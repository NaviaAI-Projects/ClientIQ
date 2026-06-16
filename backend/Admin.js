const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'navia_clientiq',
  user: 'postgres',
  password: 'Navia@123'
});

bcrypt.hash('Admin@123', 10).then(hash => {
  pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    ['Admin', 'admin@navia.com', hash, 'admin']
  ).then(() => {
    console.log('Admin user created!');
    pool.end();
  }).catch(e => {
    console.log('Error:', e.message);
    pool.end();
  });
});