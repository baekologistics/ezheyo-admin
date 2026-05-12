import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncCustomers, runSyncOrders } from '../services/syncService'
import { WindowProgress } from '../services/shipmeyoService'

const START_DATE = '2026-05-01'
const END_DATE   = '2026-05-08'

function sep(title: string) {
  console.log('\n' + '─'.repeat(65))
  console.log(`  ${title}`)
  console.log('─'.repeat(65))
}

async function clearData() {
  sep('STEP 0: Clear existing data')
  await pool.query('DELETE FROM orders')
  await pool.query('DELETE FROM customers')
  const oc = await pool.query('SELECT COUNT(*) FROM orders')
  const cc = await pool.query('SELECT COUNT(*) FROM customers')
  console.log(`orders    after clear: ${oc.rows[0].count}`)
  console.log(`customers after clear: ${cc.rows[0].count}`)
}

async function syncCustomers() {
  sep('STEP 1: Sync Customers')
  const t0 = Date.now()
  const result = await runSyncCustomers()
  console.log(`Elapsed  : ${((Date.now()-t0)/1000).toFixed(1)}s`)
  console.log(`Synced   : ${result.synced}  created=${result.created}  updated=${result.updated}`)

  const count = await pool.query('SELECT COUNT(*) FROM customers')
  console.log(`DB customers: ${count.rows[0].count}`)

  // Show sample customers to verify email normalization
  const sample = await pool.query('SELECT email, name FROM customers ORDER BY email LIMIT 5')
  console.log('\nSample customers (email / name):')
  sample.rows.forEach((r: { email: string; name: string }) =>
    console.log(`  ${r.email.padEnd(35)} ${r.name}`)
  )
}

async function syncOrders() {
  sep(`STEP 2: Sync Orders (${START_DATE} ~ ${END_DATE})`)
  console.log('Strategy: 2-day sliding windows, page=1 + pagenum=1 per window\n')

  console.log('  Window              page1  page2  added  totalorder  totalpage')
  console.log('  ' + '─'.repeat(62))

  const t0 = Date.now()
  const windows: WindowProgress[] = []

  const result = await runSyncOrders(START_DATE, END_DATE, (info: WindowProgress) => {
    windows.push(info)
    const warn = info.totalpage > 2 ? ' ⚠ >2 pages' : ''
    console.log(
      `  ${info.window.padEnd(20)}` +
      `${String(info.page1).padStart(5)}  ` +
      `${String(info.page2).padStart(5)}  ` +
      `${String(info.added).padStart(5)}  ` +
      `${String(info.totalorder).padStart(10)}  ` +
      `${String(info.totalpage).padStart(9)}` +
      warn
    )
  })

  console.log('  ' + '─'.repeat(62))
  const totalAdded = windows.reduce((s, w) => s + w.added, 0)
  console.log(`  ${'TOTAL'.padEnd(20)}${''.padStart(5)}  ${''.padStart(5)}  ${String(totalAdded).padStart(5)}`)

  console.log(`\nElapsed          : ${((Date.now()-t0)/1000).toFixed(1)}s`)
  console.log(`Synced (packages): ${result.synced}`)
  console.log(`Created          : ${result.created}`)
  console.log(`Updated          : ${result.updated}`)
  console.log(`Unmatched        : ${result.unmatched}  (customer_id=null)`)

  const orderCount = await pool.query('SELECT COUNT(*) FROM orders')
  const matchCount = await pool.query('SELECT COUNT(*) FROM orders WHERE customer_id IS NOT NULL')
  const nullEmail  = await pool.query('SELECT COUNT(*) FROM orders WHERE customer_email IS NULL')
  console.log(`\nDB orders total          : ${orderCount.rows[0].count}`)
  console.log(`DB orders matched        : ${matchCount.rows[0].count}  (customer_id NOT NULL)`)
  console.log(`DB orders email null     : ${nullEmail.rows[0].count}  (goal: 0)`)

  if (result.unmatched_emails.length > 0) {
    console.log('\nUnmatched userids (no customer record):')
    result.unmatched_emails.forEach(e => console.log(`  - ${e}`))
  }

  // Service type breakdown
  const svc = await pool.query(
    'SELECT service_type, COUNT(*) AS cnt FROM orders GROUP BY service_type ORDER BY cnt DESC'
  )
  console.log('\nBy service type:')
  svc.rows.forEach((r: Record<string, unknown>) =>
    console.log(`  ${String(r.service_type).padEnd(22)} ${r.cnt}`)
  )

  // Date distribution
  const dates = await pool.query(
    'SELECT date, COUNT(*) AS cnt FROM orders GROUP BY date ORDER BY date'
  )
  console.log('\nBy date:')
  dates.rows.forEach((r: Record<string, unknown>) =>
    console.log(`  ${r.date}  ${r.cnt} orders`)
  )
}

async function finalCheck() {
  sep('STEP 3: Final Verification')

  const cc = await pool.query('SELECT COUNT(*) FROM customers')
  const oc = await pool.query('SELECT COUNT(*) FROM orders')
  console.log(`customers : ${cc.rows[0].count}`)
  console.log(`orders    : ${oc.rows[0].count}`)

  console.log('\nLatest 10 orders:')
  const rows = await pool.query(`
    SELECT
      tracking_no,
      date,
      customer_email,
      customer_name,
      service_type,
      ups_cost,
      customer_charge
    FROM orders
    ORDER BY date DESC, created_at DESC
    LIMIT 10
  `)
  rows.rows.forEach((r: Record<string, unknown>) =>
    console.log(
      `  ${r.date}  ${String(r.tracking_no).padEnd(22)}` +
      `  ${String(r.customer_name).padEnd(28)}` +
      `  $${r.ups_cost} → $${r.customer_charge}`
    )
  )
}

async function main() {
  console.log('=== SHIPHEYO Sync Test ===')
  console.log(`Range: ${START_DATE} ~ ${END_DATE}`)
  console.log('API: form-encoded POST, page=1 + pagenum=1 per window')

  try {
    const r = await pool.query('SELECT NOW() AS now')
    console.log(`DB connected: ${r.rows[0].now}`)
  } catch (err) {
    console.error('❌ DB failed:', (err as Error).message)
    process.exit(1)
  }

  try { await clearData()     } catch (err) { console.error('❌ Clear:', (err as Error).message) }
  try { await syncCustomers() } catch (err) { console.error('❌ Customers:', (err as Error).message) }
  try { await syncOrders()    } catch (err) { console.error('❌ Orders:', (err as Error).message) }
  try { await finalCheck()    } catch (err) { console.error('❌ Check:', (err as Error).message) }

  await pool.end()
}

main()
