const { Pool } = require('pg');
require('dotenv').config();

const useSsl = process.env.DB_SSL === 'true';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,   // keep the TCP socket alive so idle connections aren't silently dropped
});

pool.on('connect', client => {
  // A client checked out via pool.connect() (used for the long import transactions) emits
  // 'error' on ITSELF — not on the pool — if its connection drops mid-query. Without this
  // listener that becomes an unhandled 'error' event and crashes the whole server. Log it
  // instead; the awaiting query still rejects and is handled by each route's try/catch.
  client.on('error', err => console.error('PostgreSQL client error:', err.message));
  client.query("SET TIME ZONE 'Asia/Kolkata'");
  console.log('Connected to PostgreSQL database');
});

// Errors on idle clients still sitting in the pool.
pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
