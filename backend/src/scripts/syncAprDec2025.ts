/**
 * syncAprDec2025.ts
 * Sync 2025-04 ~ 2025-12 orders day by day (sdate == edate), month by month.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncOrders } from '../services/syncService'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

const MONTHS = [4,5,6,7,8,9,10,11,12]

async function syncMonth(year: number, month: number) {
  const mm = String(month).padStart(2, '0')
  const days = daysInMonth(year, month)
  const label = `${year}-${mm}`

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`▶  ${label}  (${days} days)`)
  console.log(`${'═'.repeat(65)}`)

  let monthInserted = 0, monthUpdated = 0
  const zeroDays: string[] = []

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    const r = await runSyncOrders(date, date)
    monthInserted += r.created
    monthUpdated  += r.updated

    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date + 'T12:00:00Z').getUTCDay()]
    const warn = r.created === 0 ? ' ⚠' : ''
    if (r.created === 0) zeroDays.push(date)

    console.log(
      `${date} (${dow})  synced=${String(r.synced).padStart(3)}` +
      `  ins=${String(r.created).padStart(3)}  upd=${String(r.updated).padStart(3)}${warn}`
    )

    await sleep(300)
  }

  const cnt = await pool.query(
    `SELECT COUNT(*) FROM orders WHERE date >= $1 AND date <= $2`,
    [`${label}-01`, `${label}-${String(days).padStart(2,'0')}`]
  )

  console.log(`\n── ${label} summary ──`)
  console.log(`  Inserted: ${monthInserted} | Updated: ${monthUpdated}`)
  console.log(`  DB total for ${label}: ${cnt.rows[0].count}`)
  if (zeroDays.length > 0) {
    console.log(`  ⚠ 0-insert days (${zeroDays.length}): ${zeroDays.join(', ')}`)
  }

  return { monthInserted, monthUpdated }
}

async function main() {
  console.log('Sync 2025-04 ~ 2025-12 (day by day)\n')

  let grandTotal = 0

  for (const month of MONTHS) {
    const { monthInserted } = await syncMonth(2025, month)
    grandTotal += monthInserted
  }

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`Grand total inserted: ${grandTotal}`)

  // Final monthly breakdown
  const res = await pool.query(`
    SELECT
      EXTRACT(MONTH FROM date)::int AS month,
      COUNT(*) AS orders
    FROM orders
    WHERE date >= '2025-04-01' AND date <= '2025-12-31'
    GROUP BY month ORDER BY month`)

  console.log('\n=== 2025 Apr~Dec monthly totals ===')
  const MON = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  for (const row of res.rows as Array<{month:number;orders:string}>) {
    console.log(`  ${MON[row.month]} (${row.month}): ${row.orders}`)
  }

  const total = await pool.query(
    `SELECT COUNT(*) FROM orders WHERE date >= '2025-04-01' AND date <= '2025-12-31'`
  )
  console.log(`\ntotal_apr_dec_2025: ${total.rows[0].count}`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
