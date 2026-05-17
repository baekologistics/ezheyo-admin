/**
 * syncJune2024.ts
 * Re-sync June 2024 orders with ±1 day expanded date ranges.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncOrders } from '../services/syncService'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// June 2024 working days (Mon–Fri)
const JUNE_DAYS: string[] = []
for (let day = 1; day <= 30; day++) {
  const d = new Date(`2024-06-${String(day).padStart(2,'0')}T12:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun, 6=Sat
  if (dow !== 0 && dow !== 6) JUNE_DAYS.push(`2024-06-${String(day).padStart(2,'0')}`)
}

async function main() {
  console.log(`June working days: ${JUNE_DAYS.length}`)

  // Baseline
  const base = await pool.query("SELECT COUNT(*) FROM orders WHERE date >= '2024-06-01' AND date <= '2024-06-30'")
  console.log(`Baseline June total: ${base.rows[0].count}`)
  console.log('')

  let totalInserted = 0

  for (const date of JUNE_DAYS) {
    const sdate = addDays(date, -1)
    const edate = addDays(date, +1)
    process.stdout.write(`[${date}] sdate=${sdate} edate=${edate} → `)

    try {
      const r = await runSyncOrders(sdate, edate)
      const cnt = await pool.query(`SELECT COUNT(*) FROM orders WHERE date = '${date}'`)
      console.log(`inserted=${r.created} | ${date} DB=${cnt.rows[0].count}`)
      totalInserted += r.created
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`)
    }

    await sleep(400)
  }

  console.log('')
  console.log(`Total inserted: ${totalInserted}`)

  // Final breakdown
  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date >= '2024-06-01' AND date <= '2024-06-30'
    GROUP BY date ORDER BY date`)
  console.log('\nJune 2024 final by date:')
  for (const r of res.rows as Array<{ date: string; cnt: string }>) {
    process.stdout.write(`  ${r.date.slice(0,10)}: ${r.cnt}\n`)
  }

  const total = await pool.query("SELECT COUNT(*) FROM orders WHERE date >= '2024-06-01' AND date <= '2024-06-30'")
  console.log(`\nJune 2024 total: ${total.rows[0].count} / 883`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
