import bcrypt from 'bcryptjs'
import { pool } from '../config/database'

async function main() {
  const initialPassword = 'Ezheyo2023!'
  const hash = await bcrypt.hash(initialPassword, 12)

  await pool.query('UPDATE admin_users SET password_hash = $1', [hash])
  console.log('✅ Passwords initialized for all admin_users (Ezheyo2023!)')

  const result = await pool.query('SELECT username, display_name, role FROM admin_users')
  console.table(result.rows)

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
