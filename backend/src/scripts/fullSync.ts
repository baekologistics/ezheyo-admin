import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'
import { runSyncCustomers, runSyncOrders, OrderSyncResult } from '../services/syncService'

const FULL_START = '2023-01-01'
const MAX_RETRY  = 2
const RETRY_DELAY_MS = 3000

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  return { start, end }
}

function monthsBetween(fromDate: string, toDate: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = []
  const from = new Date(fromDate)
  const to   = new Date(toDate)
  let cur = new Date(from.getFullYear(), from.getMonth(), 1)

  while (cur <= to) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return months
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sep(title: string) {
  console.log('\n' + '═'.repeat(65))
  console.log(`  ${title}`)
  console.log('═'.repeat(65))
}

interface MonthResult {
  label:   string
  start:   string
  end:     string
  result:  OrderSyncResult | null
  error:   string | null
  elapsed: number
}

async function main() {
  const runAt  = new Date()
  const today  = runAt.toISOString().slice(0, 10)
  const months = monthsBetween(FULL_START, today)

  sep(`Full Sync  —  ${FULL_START} → ${today}  (${months.length} months)`)

  // ── Step 1: Sync customers ──────────────────────────────────
  console.log('\n[Step 1] Syncing customers...')
  try {
    const t0 = Date.now()
    const r  = await runSyncCustomers()
    console.log(`✅ Customers: synced=${r.synced}  created=${r.created}  updated=${r.updated}  (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (err) {
    console.error(`❌ Customer sync failed: ${(err as Error).message}`)
    console.error('Cannot continue without customers — aborting.')
    await pool.end()
    process.exit(1)
  }

  // ── Step 2: Monthly order sync ──────────────────────────────
  console.log('\n[Step 2] Syncing orders by month...\n')

  const results: MonthResult[] = []
  let totalCreated   = 0
  let totalUpdated   = 0
  let totalUnmatched = 0
  let totalFailed    = 0

  for (const { year, month } of months) {
    const label = `${year}-${String(month).padStart(2, '0')}`
    const { start, end } = monthRange(year, month)
    let attempt = 0
    let success = false
    let lastErr = ''
    let elapsed = 0
    let syncResult: OrderSyncResult | null = null

    while (attempt <= MAX_RETRY && !success) {
      if (attempt > 0) {
        process.stdout.write(`  ↻ Retry ${attempt}/${MAX_RETRY} after ${RETRY_DELAY_MS/1000}s... `)
        await sleep(RETRY_DELAY_MS)
      }

      try {
        const t0 = Date.now()
        syncResult = await runSyncOrders(start, end)
        elapsed    = Date.now() - t0
        success    = true
      } catch (err) {
        lastErr = (err as Error).message
        attempt++
      }
    }

    if (success && syncResult) {
      totalCreated   += syncResult.created
      totalUpdated   += syncResult.updated
      totalUnmatched += syncResult.unmatched

      const tag  = syncResult.synced === 0 ? '·' : '✅'
      const line = `  ${tag} ${label}  synced=${String(syncResult.synced).padStart(4)}  ` +
                   `created=${String(syncResult.created).padStart(4)}  ` +
                   `updated=${String(syncResult.updated).padStart(4)}  ` +
                   `unmatched=${syncResult.unmatched}` +
                   (elapsed > 0 ? `  (${(elapsed/1000).toFixed(1)}s)` : '')
      console.log(line)

      results.push({ label, start, end, result: syncResult, error: null, elapsed })
    } else {
      totalFailed++
      console.log(`  ❌ ${label}  FAILED after ${attempt} attempt(s): ${lastErr}`)
      results.push({ label, start, end, result: null, error: lastErr, elapsed: 0 })
    }
  }

  // ── Step 3: Final stats ─────────────────────────────────────
  sep('Summary')

  const dbOrders    = await pool.query('SELECT COUNT(*) FROM orders')
  const dbCustomers = await pool.query('SELECT COUNT(*) FROM customers')
  const duration    = ((Date.now() - runAt.getTime()) / 1000).toFixed(1)

  console.log(`\nRange   : ${FULL_START} → ${today}  (${months.length} months)`)
  console.log(`Duration: ${duration}s`)
  console.log(`\nOrders`)
  console.log(`  Created   : ${totalCreated}`)
  console.log(`  Updated   : ${totalUpdated}`)
  console.log(`  Unmatched : ${totalUnmatched}  (userid with no matching customer)`)
  console.log(`  DB total  : ${dbOrders.rows[0].count}`)
  console.log(`\nCustomers`)
  console.log(`  DB total  : ${dbCustomers.rows[0].count}`)

  if (totalFailed > 0) {
    console.log(`\n⚠️  Failed months (${totalFailed}):`)
    results.filter(r => r.error).forEach(r => {
      console.log(`  - ${r.label}  (${r.start} ~ ${r.end}): ${r.error}`)
    })
  } else {
    console.log('\n✅ All months synced successfully')
  }

  await pool.end()
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err)
  pool.end()
  process.exit(1)
})
