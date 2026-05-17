/**
 * syncMay2026Early.ts
 * Sync 2026-05-01 ~ 2026-05-11 day by day.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncOrders } from '../services/syncService'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('Sync 2026-05-01 ~ 2026-05-11\n')

  const dates: string[] = []
  for (let d = 1; d <= 11; d++)
    dates.push(`2026-05-${String(d).padStart(2, '0')}`)

  let totalInserted = 0, totalUpdated = 0
  const zeroDays: string[] = []

  for (const date of dates) {
    const r   = await runSyncOrders(date, date)
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date + 'T12:00:00Z').getUTCDay()]
    const warn = r.created === 0 ? ' ⚠' : ''
    if (r.created === 0) zeroDays.push(date)
    totalInserted += r.created
    totalUpdated  += r.updated
    console.log(
      `${date} (${dow})  synced=${String(r.synced).padStart(3)}` +
      `  ins=${String(r.created).padStart(3)}  upd=${String(r.updated).padStart(3)}${warn}`
    )
    await sleep(300)
  }

  console.log(`\n── Summary ──`)
  console.log(`  Inserted: ${totalInserted} | Updated: ${totalUpdated}`)
  if (zeroDays.length > 0)
    console.log(`  ⚠ 0-insert days (${zeroDays.length}): ${zeroDays.join(', ')}`)

  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt
    FROM orders WHERE date >= '2026-05-01' AND date <= '2026-05-11'
    GROUP BY date ORDER BY date`)

  console.log('\n── DB counts (2026-05-01 ~ 2026-05-11) ──')
  let total = 0
  for (const row of res.rows as Array<{date:string;cnt:string}>) {
    console.log(`  ${row.date}: ${row.cnt}`)
    total += parseInt(row.cnt)
  }
  console.log(`  Total: ${total}`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
