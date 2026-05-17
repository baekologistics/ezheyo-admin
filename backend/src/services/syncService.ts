import { pool } from '../config/database'
import { getMemberList, getAllOrders, SERVICE_CODE_MAP, WindowProgress, ShipheyoOrder, parseShipheyoDate } from './shipmeyoService'

export interface CustomerSyncResult {
  synced: number; created: number; updated: number
}

export interface OrderSyncResult {
  synced: number; created: number; updated: number
  unmatched: number; unmatched_emails: string[]
}

export interface VoidCheckResult {
  dates_checked: number
  inserted: number   // new orders discovered
  updated:  number   // charge changes (including → 0 voids)
}

// ── runVoidCheck ──────────────────────────────────────────────
// Re-fetches the last `days` days from the API and:
//   • Updates customer_charge / ups_cost for existing orders
//   • Inserts any newly discovered orders
// Called nightly and on manual Sync button.

export async function runVoidCheck(days = 7): Promise<VoidCheckResult> {
  const UPS_MARKUP_DATE = '2025-07-29'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Build date list: [today-days … today-1]
  const dates: string[] = []
  for (let i = days; i >= 1; i--) {
    const d = new Date(today + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  // Customer map
  const custResult = await pool.query('SELECT id, email, name FROM customers')
  const emailToCustomer = new Map<string, { id: string; name: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string }>)
      .map(r => [r.email.trim().toLowerCase(), { id: r.id, name: r.name }])
  )

  let totalInserted = 0, totalUpdated = 0

  for (const date of dates) {
    const apiOrders = await getAllOrders(date, date)
    if (apiOrders.length === 0) continue

    for (const o of apiOrders) {
      const userEmail   = o.userid.trim().toLowerCase()
      const rawUpsCost  = parseFloat(o.org_price)  || 0
      const custCharge  = parseFloat(o.sell_price) || 0
      const serviceType = SERVICE_CODE_MAP[o.service_code] ?? o.service_code
      const customer    = emailToCustomer.get(userEmail) ?? null

      const upsCost = custCharge === 0
        ? 0
        : date >= UPS_MARKUP_DATE
          ? Math.round(rawUpsCost * 1.15 * 100) / 100
          : rawUpsCost

      const result = await pool.query(
        `INSERT INTO orders
           (id, tracking_no, shipheyo_order_id, date,
            customer_id, customer_email, customer_name,
            service_type, ups_cost, customer_charge, cod_amount,
            sales_person, total_packages, packages, ref_no)
         VALUES
           (gen_random_uuid(), $1, $2, $3,
            $4, $5, $6,
            $7, $8, $9, $10,
            (SELECT sales_person FROM customers WHERE id = $4),
            $11, $12::jsonb, $13)
         ON CONFLICT (shipheyo_order_id) DO UPDATE SET
           ups_cost        = EXCLUDED.ups_cost,
           customer_charge = EXCLUDED.customer_charge,
           service_type    = EXCLUDED.service_type,
           updated_at      = NOW()
         WHERE
           orders.customer_charge IS DISTINCT FROM EXCLUDED.customer_charge
           OR orders.ups_cost     IS DISTINCT FROM EXCLUDED.ups_cost
         RETURNING (xmax = 0) AS inserted`,
        [
          o.tracking_no, o.shipheyo_order_id, o.order_date,
          customer?.id ?? null, userEmail, customer?.name ?? userEmail,
          serviceType, upsCost, custCharge, o.cod_amount,
          o.total_packages, JSON.stringify(o.packages), o.ref_no || null,
        ]
      )
      // rowCount=0 → conflict but no change (WHERE clause skipped update)
      // rowCount=1, inserted=true  → new row
      // rowCount=1, inserted=false → updated (charge changed)
      if ((result.rowCount ?? 0) > 0) {
        if (result.rows[0]?.inserted) totalInserted++
        else                          totalUpdated++
      }
    }
  }

  return { dates_checked: dates.length, inserted: totalInserted, updated: totalUpdated }
}

// ── runSyncCustomers ──────────────────────────────────────────

export async function runSyncCustomers(): Promise<CustomerSyncResult> {
  const members = await getMemberList()
  let created = 0, updated = 0

  for (const m of members) {
    const email       = m.userid.trim().toLowerCase()
    const name        = m.ename.trim()
    const phone       = (m.mobile || '').trim() || null
    const joinedDate  = parseShipheyoDate(m.createdate ?? '')   // YYYY-MM-DD or null
    const marginRate  = parseFloat(m['marginrate '] ?? '0') || 0
    const paymentType = m.payment === 'Monthly' ? 'Monthly' : 'Prepay'

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
    if (result.rows[0]?.inserted) created++; else updated++
  }
  return { synced: members.length, created, updated }
}

// ── runSyncOrders ─────────────────────────────────────────────
// One DB row per order (conflict on shipheyo_order_id).
// Stores packages JSONB, total_packages, ref_no.

export async function runSyncOrders(
  startDate?: string,
  endDate?:   string,
  onProgress?: (info: WindowProgress) => void
): Promise<OrderSyncResult> {
  const apiOrders = await getAllOrders(startDate, endDate, onProgress)
  if (apiOrders.length === 0)
    return { synced: 0, created: 0, updated: 0, unmatched: 0, unmatched_emails: [] }

  // email → { id, name } map
  const custResult = await pool.query('SELECT id, email, name FROM customers')
  const emailToCustomer = new Map<string, { id: string; name: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string }>).map(r => [
      r.email.trim().toLowerCase(),
      { id: r.id, name: r.name },
    ])
  )

  let created = 0, updated = 0, unmatched = 0
  const unmatchedEmails = new Set<string>()

  // UPS cost markup: ×1.15 for orders from 2025-07-29 onwards
  const UPS_MARKUP_DATE = '2025-07-29'

  for (const o of apiOrders) {
    const userEmail   = o.userid.trim().toLowerCase()
    const rawUpsCost  = parseFloat(o.org_price)  || 0
    const custCharge  = parseFloat(o.sell_price) || 0
    const serviceType = SERVICE_CODE_MAP[o.service_code] ?? o.service_code

    // Cancelled order: charge = 0 → force ups_cost = 0
    // Normal order from 2025-07-29+: apply 15% markup
    const upsCost = custCharge === 0
      ? 0
      : o.order_date >= UPS_MARKUP_DATE
        ? Math.round(rawUpsCost * 1.15 * 100) / 100
        : rawUpsCost
    const customer    = emailToCustomer.get(userEmail) ?? null
    const customerId   = customer?.id   ?? null
    const customerName = customer?.name ?? userEmail

    if (!customerId) { unmatched++; unmatchedEmails.add(userEmail) }

    const result = await pool.query(
      `INSERT INTO orders
         (id, tracking_no, shipheyo_order_id, date,
          customer_id, customer_email, customer_name,
          service_type, ups_cost, customer_charge, cod_amount,
          sales_person, total_packages, packages, ref_no)
       VALUES
         (gen_random_uuid(), $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9, $10,
          (SELECT sales_person FROM customers WHERE id = $4),
          $11, $12::jsonb, $13)
       ON CONFLICT (shipheyo_order_id) DO UPDATE SET
         tracking_no     = EXCLUDED.tracking_no,
         date            = EXCLUDED.date,
         customer_id     = EXCLUDED.customer_id,
         customer_email  = EXCLUDED.customer_email,
         customer_name   = EXCLUDED.customer_name,
         service_type    = EXCLUDED.service_type,
         ups_cost        = EXCLUDED.ups_cost,
         customer_charge = EXCLUDED.customer_charge,
         cod_amount      = EXCLUDED.cod_amount,
         total_packages  = EXCLUDED.total_packages,
         packages        = EXCLUDED.packages,
         ref_no          = EXCLUDED.ref_no,
         updated_at      = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        o.tracking_no,
        o.shipheyo_order_id,
        o.order_date,
        customerId,
        userEmail,
        customerName,
        serviceType,
        upsCost,
        custCharge,
        o.cod_amount,
        o.total_packages,
        JSON.stringify(o.packages),
        o.ref_no || null,
      ]
    )
    if (result.rows[0]?.inserted) created++; else updated++
  }

  return {
    synced: apiOrders.length,
    created, updated, unmatched,
    unmatched_emails: Array.from(unmatchedEmails),
  }
}
