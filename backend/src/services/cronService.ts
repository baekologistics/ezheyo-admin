import cron from 'node-cron'
import { runSyncOrders, runVoidCheck } from './syncService'
import { pool } from '../config/database'
import { getMemberList, parseShipheyoDate } from './shipmeyoService'

// ── Helpers ──────────────────────────────────────────────────

function etNow(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
}

async function upsertCustomers(): Promise<{ inserted: number; updated: number }> {
  const members = await getMemberList()
  let inserted = 0, updated = 0

  for (const m of members) {
    const email       = (m.userid || '').trim().toLowerCase()
    const name        = (m.ename  || '').trim()
    const phone       = (m.mobile || '').trim() || null
    const joinedDate  = parseShipheyoDate(m.createdate ?? '')
    const marginRate  = parseFloat(m['marginrate '] ?? '0') || 0
    const paymentType = m.payment === 'Monthly' ? 'Monthly' : 'Prepay'

    if (!email) continue
    try {
      const result = await pool.query(
        `INSERT INTO customers
           (id, shipheyo_userid, name, email, phone, created_date, margin_rate, payment_type, last_synced_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (shipheyo_userid) DO UPDATE SET
           name           = EXCLUDED.name,
           email          = EXCLUDED.email,
           phone          = COALESCE(EXCLUDED.phone, customers.phone),
           created_date   = COALESCE(customers.created_date, EXCLUDED.created_date),
           margin_rate    = EXCLUDED.margin_rate,
           payment_type   = EXCLUDED.payment_type,
           last_synced_at = NOW(),
           updated_at     = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [email, name, email, phone, joinedDate, marginRate, paymentType]
      )
      if (result.rows[0]?.inserted) inserted++
      else updated++
    } catch {
      // skip individual failures
    }
  }

  return { inserted, updated }
}

// ── Daily sync at 23:50 America/New_York ────────────────────
// Runs at 11:50 PM ET — syncs customers + yesterday's orders.
// "Yesterday" is computed in ET so the date is correct even when
// the server clock is in UTC.
cron.schedule(
  '50 23 * * *',
  async () => {
    const stamp = etNow()
    console.log(`\n[CRON] Daily sync started — ${stamp}`)

    try {
      // 1. Sync customers from SHIPHEYO
      const { inserted, updated } = await upsertCustomers()
      console.log(`[CRON] Customers — inserted: ${inserted}, updated: ${updated}`)

      // 2. Sync today's orders (ET-based date)
      const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

      const todayResult = await runSyncOrders(etToday, etToday)
      console.log(
        `[CRON] Orders(${etToday}) — inserted: ${todayResult.created}, updated: ${todayResult.updated}`
      )

      // 3. Void check: re-fetch last 7 days, update charge changes
      const voidResult = await runVoidCheck(7)
      console.log(
        `[CRON] Void check (${voidResult.dates_checked} days) — ` +
        `new: ${voidResult.inserted}, void_updated: ${voidResult.updated}`
      )
    } catch (err) {
      console.error('[CRON] Daily sync failed:', (err as Error).message)
    }

    console.log(`[CRON] Daily sync complete — ${etNow()}`)
  },
  { timezone: 'America/New_York' }
)

console.log('⏰  Cron: daily sync scheduled at 23:50 America/New_York')
