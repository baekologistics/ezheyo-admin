import { pool } from '../config/database'
import { getMemberList, getAllOrders, SERVICE_CODE_MAP, WindowProgress, ShipheyoOrder } from './shipmeyoService'

export interface CustomerSyncResult {
  synced: number; created: number; updated: number
}

export interface OrderSyncResult {
  synced: number; created: number; updated: number
  unmatched: number; unmatched_emails: string[]
}

// ── runSyncCustomers ──────────────────────────────────────────

export async function runSyncCustomers(): Promise<CustomerSyncResult> {
  const members = await getMemberList()
  let created = 0, updated = 0

  for (const m of members) {
    const email       = m.userid.trim().toLowerCase()
    const name        = m.ename.trim()
    const marginRate  = parseFloat(m['marginrate '] ?? '0') || 0
    const paymentType = m.payment === 'Monthly' ? 'Monthly' : 'Prepay'

    const result = await pool.query(
      `INSERT INTO customers
         (id, shipheyo_userid, name, email, margin_rate, payment_type, last_synced_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (shipheyo_userid) DO UPDATE SET
         name           = EXCLUDED.name,
         email          = EXCLUDED.email,
         margin_rate    = EXCLUDED.margin_rate,
         payment_type   = EXCLUDED.payment_type,
         last_synced_at = NOW(),
         updated_at     = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [email, name, email, marginRate, paymentType]
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

  for (const o of apiOrders) {
    const userEmail    = o.userid.trim().toLowerCase()
    const upsCost      = parseFloat(o.org_price)  || 0
    const custCharge   = parseFloat(o.sell_price) || 0
    const serviceType  = SERVICE_CODE_MAP[o.service_code] ?? o.service_code
    const customer     = emailToCustomer.get(userEmail) ?? null
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
