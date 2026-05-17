/**
 * syncJanApr2026.ts
 * Sync 2026-01 ~ 2026-04 orders day by day, month by month.
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

const MON = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS = [1, 2, 3, 4]

async function syncMonth(year: number, month: number) {
  const mm   = String(month).padStart(2, '0')
  const days = daysInMonth(year, month)
  const label     = `${year}-${mm}`
  const dateStart = `${label}-01`
  const dateEnd   = `${label}-${String(days).padStart(2, '0')}`

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`▶  ${label}  (${days} days)`)
  console.log(`${'═'.repeat(65)}`)

  let monthInserted = 0
  let monthUpdated  = 0
  const zeroDays: string[] = []

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    const r    = await runSyncOrders(date, date)

    monthInserted += r.created
    monthUpdated  += r.updated

    const dow  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date + 'T12:00:00Z').getUTCDay()]
    const warn = r.created === 0 ? ' ⚠' : ''
    if (r.created === 0) zeroDays.push(date)

    console.log(
      `${date} (${dow})  synced=${String(r.synced).padStart(3)}` +
      `  ins=${String(r.created).padStart(3)}  upd=${String(r.updated).padStart(3)}${warn}`
    )

    await sleep(300)
  }

  // ── Monthly DB breakdown ────────────────────────────────
  const byDate = await pool.query(
    `SELECT date::text, COUNT(*) AS orders
     FROM orders WHERE date >= $1 AND date <= $2
     GROUP BY date ORDER BY date`,
    [dateStart, dateEnd]
  )

  console.log(`\n── ${label} daily counts ──`)
  for (const row of byDate.rows as Array<{date:string;orders:string}>) {
    console.log(`  ${row.date}: ${row.orders}`)
  }

  const total = await pool.query(
    `SELECT COUNT(*) AS total FROM orders WHERE date >= $1 AND date <= $2`,
    [dateStart, dateEnd]
  )

  console.log(`\n── ${label} summary ──`)
  console.log(`  Inserted: ${monthInserted} | Updated: ${monthUpdated}`)
  console.log(`  DB total for ${label}: ${total.rows[0].total}`)
  if (zeroDays.length > 0) {
    console.log(`  ⚠ 0-insert days (${zeroDays.length}): ${zeroDays.join(', ')}`)
  }

  return { monthInserted, monthUpdated, dbTotal: parseInt(total.rows[0].total) }
}

async function main() {
  console.log('Sync 2026-01 ~ 2026-04 (day by day)\n')

  let grandInserted = 0
  const summary: Array<{month:number; inserted:number; dbTotal:number}> = []

  for (const month of MONTHS) {
    const { monthInserted, dbTotal } = await syncMonth(2026, month)
    grandInserted += monthInserted
    summary.push({ month, inserted: monthInserted, dbTotal })
  }

  // ── Grand total ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(65)}`)
  console.log(`Grand total inserted: ${grandInserted}`)

  console.log('\n=== 2026 Jan~Apr summary ===')
  for (const s of summary) {
    console.log(`  ${MON[s.month]} (${s.month}): inserted=${s.inserted}  DB total=${s.dbTotal}`)
  }

  const res = await pool.query(
    `SELECT COUNT(*) AS total FROM orders
     WHERE date >= '2026-01-01' AND date <= '2026-04-30'`
  )
  console.log(`\ntotal_jan_apr_2026: ${res.rows[0].total}`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
