/**
 * MkekaBOT — Database Connection Pool
 * lib/db.js
 */

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === "production" && process.env.DB_SSL !== "false") ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (Date.now() - start > 1000) console.warn(`[DB] Slow query (${Date.now() - start}ms)`);
    return res;
  } catch (err) {
    console.error("[DB] Query error:", err.message);
    throw err;
  }
}

export async function getClient() {
  return pool.connect();
}

export default pool;
