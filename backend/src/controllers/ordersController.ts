import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// Effective COD status: cod_records is the source of truth;
// falls back to orders.cod_status, then 'pending' for COD orders.
const EFFECTIVE_COD = `COALESCE(
  cr_cod.cod_status,
  o.cod_status,
  CASE WHEN o.cod_amount > 0 THEN 'pending' ELSE NULL END
)`

// Always left-join the latest cod_record for each order's tracking_no
const COD_LATERAL = `LEFT JOIN LATERAL (
  SELECT cod_status FROM cod_records
  WHERE  tracking_no = o.tracking_no
  ORDER  BY updated_at DESC NULLS LAST
  LIMIT  1
) cr_cod ON true`

// ── Shared filter builder ─────────────────────────────────────
function buildFilters(q: Record<string, string | undefined>) {
  const {
    customer_id, date_from, date_to, service_type, cod_status, claim_status,
    search, customer_name, sales_person_id, cancelled,
  } = q

  const conditions: string[] = []
  const values:     unknown[] = []
  let   idx = 1
  let   needsCustomerSales = false

  if (customer_id)        { conditions.push(`o.customer_id = $${idx++}`);         values.push(customer_id) }
  if (date_from)          { conditions.push(`o.date >= $${idx++}`);                values.push(date_from) }
  if (date_to)            { conditions.push(`o.date <= $${idx++}`);                values.push(date_to) }
  if (service_type)       { conditions.push(`o.service_type = $${idx++}`);         values.push(service_type) }
  if (cod_status)         { conditions.push(`(${EFFECTIVE_COD}) = $${idx++}`);     values.push(cod_status) }
  if (claim_status)       { conditions.push(`o.claim_status = $${idx++}`);         values.push(claim_status) }
  if (customer_name)      { conditions.push(`c.name ILIKE $${idx++}`);             values.push(`%${customer_name}%`) }
  if (cancelled === 'true')  { conditions.push(`o.customer_charge = 0`) }
  if (cancelled === 'false') { conditions.push(`o.customer_charge > 0`) }
  if (search) {
    conditions.push(`(o.tracking_no ILIKE $${idx} OR o.packages::text ILIKE $${idx})`)
    values.push(`%${search}%`)
    idx++
  }
  if (sales_person_id) {
    conditions.push(`cs.sales_person_id = $${idx++}`)
    values.push(sales_person_id)
    needsCustomerSales = true
  }

  const baseJoin = needsCustomerSales
    ? 'LEFT JOIN customers c ON o.customer_id = c.id\n       INNER JOIN customer_sales cs ON cs.customer_id = o.customer_id'
    : 'LEFT JOIN customers c ON o.customer_id = c.id'

  // COD_LATERAL always included so EFFECTIVE_COD expression is valid in WHERE + SELECT
  const joinClause = `${baseJoin}\n       ${COD_LATERAL}`

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { conditions, values, idx, where, joinClause }
}

export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>
    const limit  = Math.min(Math.max(parseInt(q.limit  ?? '50'),  1), 500)
    const page   = Math.max(parseInt(q.page ?? '1'), 1)
    const offset = (page - 1) * limit

    const { values, idx, where, joinClause } = buildFilters(q)

    // Total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders o ${joinClause} ${where}`,
      values
    )
    const total      = parseInt(String(countResult.rows[0].count)) || 0
    const totalPages = Math.ceil(total / limit) || 1

    // Data
    const dataResult = await pool.query(
      `SELECT
         o.id, o.shipheyo_order_id, o.tracking_no, o.ref_no,
         o.date::text,
         COALESCE(c.name, o.customer_name) AS customer_name,
         COALESCE(c.email, o.customer_email) AS customer_email,
         o.customer_id,
         o.service_type,
         CASE WHEN o.customer_charge = 0 THEN 0 ELSE o.ups_cost END AS ups_cost,
         o.customer_charge,
         CASE WHEN o.customer_charge = 0 THEN 0 ELSE GREATEST(o.profit, 0) END AS profit,
         o.sales_person,
         o.cod_amount, ${EFFECTIVE_COD} AS cod_status, o.claim_status,
         o.total_packages, o.packages
       FROM orders o
       ${joinClause}
       ${where}
       ORDER BY o.date DESC, o.shipheyo_order_id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    )

    const orders = dataResult.rows.map((o: Record<string, unknown>) => {
      const chg = Number(o.customer_charge) || 0
      const ups = chg === 0 ? 0 : Number(o.ups_cost) || 0
      return {
        ...o,
        ups_cost: ups,
        profit:   chg === 0 ? 0 : Math.max(chg - ups, 0),
      }
    })
    res.json({ orders, total, page, totalPages })
  } catch (err) {
    next(err)
  }
}

export async function getOrderStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>
    const { values, where, joinClause } = buildFilters(q)

    const result = await pool.query(
      `SELECT
         COUNT(*)                          AS total_orders,
         COALESCE(SUM(o.total_packages),0) AS total_packages,
         COALESCE(SUM(o.customer_charge),0) AS total_revenue,
         COALESCE(SUM(CASE WHEN o.customer_charge = 0 THEN 0 ELSE o.ups_cost END),0) AS total_ups_cost,
         COALESCE(SUM(CASE WHEN o.customer_charge = 0 THEN 0 ELSE GREATEST(o.profit, 0) END),0) AS total_profit,
         COALESCE(SUM(o.cod_amount),0)     AS total_cod
       FROM orders o
       ${joinClause}
       ${where}`,
      values
    )
    const row = result.rows[0]
    res.json({
      total_orders:   parseInt(String(row.total_orders))    || 0,
      total_packages: parseInt(String(row.total_packages))  || 0,
      total_revenue:  parseFloat(String(row.total_revenue)) || 0,
      total_ups_cost: parseFloat(String(row.total_ups_cost))|| 0,
      total_profit:   parseFloat(String(row.total_profit))  || 0,
      total_cod:      parseFloat(String(row.total_cod))     || 0,
    })
  } catch (err) {
    next(err)
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT o.*,
              COALESCE(c.name, o.customer_name)   AS customer_name,
              COALESCE(c.email, o.customer_email) AS customer_email
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = $1 OR o.tracking_no = $1 OR o.shipheyo_order_id = $1`,
      [id]
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Order not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}
