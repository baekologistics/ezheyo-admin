/**
 * syncMar2025.ts
 * Sync March 2025 orders day by day (sdate == edate).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncOrders } from '../services/syncService'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const dates: string[] = []
  for (let d = 1; d <= 31; d++) {
    dates.push(`2025-03-${String(d).padStart(2, '0')}`)
  }

  console.log(`Syncing ${dates.length} days (2025-03-01 ~ 2025-03-31)\n`)

  let totalInserted = 0, totalUpdated = 0
  const zeroDays: string[] = []

  for (const date of dates) {
    const r = await runSyncOrders(date, date)
    totalInserted += r.created
    totalUpdated  += r.updated

    const dayCnt = await pool.query(
      `SELECT COUNT(*) FROM orders WHERE date = $1`, [date]
    )

    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date + 'T12:00:00Z').getUTCDay()]
    const warn = r.created === 0 ? ' ⚠' : ''
    if (r.created === 0) zeroDays.push(date)

    console.log(
      `${date} (${dow})  synced=${String(r.synced).padStart(3)}` +
      `  ins=${String(r.created).padStart(3)}  upd=${String(r.updated).padStart(3)}` +
      `  day=${String(dayCnt.rows[0].count).padStart(3)}${warn}`
    )

    await sleep(300)
  }

  console.log(`\n${'─'.repeat(65)}`)
  console.log(`Total inserted: ${totalInserted} | updated: ${totalUpdated}`)
  if (zeroDays.length > 0) {
    console.log(`\n⚠ 0-insert days (${zeroDays.length}):`)
    zeroDays.forEach(d => console.log(`  ${d}`))
  }

  // Final breakdown
  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt
    FROM orders WHERE date >= '2025-03-01' AND date <= '2025-03-31'
    GROUP BY date ORDER BY date`)

  console.log('\n=== March 2025 by date ===')
  for (const row of res.rows as Array<{ date: string; cnt: string }>) {
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(row.date + 'T12:00:00Z').getUTCDay()]
    console.log(`  ${row.date} (${dow}): ${row.cnt}`)
  }

  const total = await pool.query(
    `SELECT COUNT(*) FROM orders WHERE date >= '2025-03-01' AND date <= '2025-03-31'`
  )
  console.log(`\ntotal_mar2025: ${total.rows[0].count}`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
