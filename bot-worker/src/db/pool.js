const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'biznesai',
  user: process.env.DB_USER || 'biznesai',
  password: process.env.DB_PASS || 'biznesai',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[BOT-DB] pool error:', err.message);
});

module.exports = pool;
