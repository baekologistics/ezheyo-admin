import cron from 'node-cron'
import { runSyncOrders } from './syncService'
import { pool } from '../config/database'
import { getMemberList } from './shipmeyoService'

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
    const phone       = (m.mobile || '').trim()
    const marginRate  = parseFloat(m['marginrate '] ?? '0') || 0
    const paymentType = m.payment === 'Monthly' ? 'Monthly' : 'Prepay'

    if (!email) continue
    try {
      const result = await pool.query(
        `INSERT INTO customers
           (id, shipheyo_userid, name, email, phone, margin_rate, payment_type, last_synced_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (shipheyo_userid) DO UPDATE SET
           name           = EXCLUDED.name,
           email          = EXCLUDED.email,
           phone          = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone),
           margin_rate    = EXCLUDED.margin_rate,
           payment_type   = EXCLUDED.payment_type,
           last_synced_at = NOW(),
           updated_at     = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [email, name, email, phone, marginRate, paymentType]
      )
      if (result.rows[0]?.inserted) inserted++
      else updated++
    } catch {
      // skip individual failures
    }
  }

  return { inserted, updated }
}

// ── Daily sync at 00:00 America/New_York ────────────────────
// node-cron uses server local time. We schedule at midnight ET.
// If the server runs in UTC, midnight ET = 05:00 UTC (EST) or 04:00 UTC (EDT).
// To be robust we use a timezone option (node-cron v3+ supports it).
cron.schedule(
  '0 0 * * *',
  async () => {
    const stamp = etNow()
    console.log(`\n[CRON] Daily sync started — ${stamp}`)

    try {
      // 1. Sync customers from SHIPHEYO
      const { inserted, updated } = await upsertCustomers()
      console.log(`[CRON] Customers — inserted: ${inserted}, updated: ${updated}`)

      // 2. Sync today's orders (yesterday → today window)
      const today     = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const fmt = (d: Date) => d.toISOString().slice(0, 10)

      const result = await runSyncOrders(fmt(yesterday), fmt(today))
      console.log(
        `[CRON] Orders — created: ${result.created}, updated: ${result.updated}, ` +
        `unmatched: ${result.unmatched}`
      )
    } catch (err) {
      console.error('[CRON] Daily sync failed:', (err as Error).message)
    }

    console.log(`[CRON] Daily sync complete — ${etNow()}`)
  },
  { timezone: 'America/New_York' }
)

console.log('⏰  Cron: daily sync scheduled at 00:00 America/New_York')
