import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const here = path.dirname(fileURLToPath(import.meta.url));

export async function initializeDatabase() {
  await pool.query(fs.readFileSync(path.join(here, '../sql/init.sql'), 'utf8'));
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (!exists.rowCount) {
    await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2)', [email, await bcrypt.hash(password, 12)]);
    console.log(`Initialized administrator: ${email}`);
  }
}
