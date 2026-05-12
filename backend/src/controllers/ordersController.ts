import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      customer_id, date_from, date_to, service_type, cod_status, claim_status,
      search,               // tracking_no partial match
      customer_name,        // customer name partial match
      page:   pageQ  = '1',
      limit:  limitQ = '50',
    } = req.query as Record<string, string | undefined>

    const limit  = Math.min(Math.max(parseInt(limitQ  ?? '50'),  1), 500)
    const page   = Math.max(parseInt(pageQ ?? '1'), 1)
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const values:     unknown[] = []
    let   idx = 1

    if (customer_id)   { conditions.push(`o.customer_id = $${idx++}`);          values.push(customer_id) }
    if (date_from)     { conditions.push(`o.date >= $${idx++}`);                 values.push(date_from) }
    if (date_to)       { conditions.push(`o.date <= $${idx++}`);                 values.push(date_to) }
    if (service_type)  { conditions.push(`o.service_type = $${idx++}`);          values.push(service_type) }
    if (cod_status)    { conditions.push(`o.cod_status = $${idx++}`);            values.push(cod_status) }
    if (claim_status)  { conditions.push(`o.claim_status = $${idx++}`);          values.push(claim_status) }
    if (customer_name) { conditions.push(`c.name ILIKE $${idx++}`);              values.push(`%${customer_name}%`) }
    if (search) {
      // search in tracking_no OR inside packages JSONB
      conditions.push(`(o.tracking_no ILIKE $${idx} OR o.packages::text ILIKE $${idx})`)
      values.push(`%${search}%`)
      idx++
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       ${where}`,
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
         o.ups_cost, o.customer_charge, o.profit,
         o.sales_person,
         o.cod_amount, o.cod_status, o.claim_status,
         o.total_packages, o.packages
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       ${where}
       ORDER BY o.date DESC, o.shipheyo_order_id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    )

    res.json({
      orders:     dataResult.rows,
      total,
      page,
      totalPages,
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
