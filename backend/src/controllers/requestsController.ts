import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── GET /api/requests/types ───────────────────────────────────
export async function getRequestTypes(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT * FROM request_types WHERE active = true ORDER BY sort_order`
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/requests ─────────────────────────────────────────
export async function getRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q         = req.query as Record<string, string | undefined>
    const limit     = Math.min(Math.max(parseInt(q.limit  ?? '50'),  1), 500)
    const page      = Math.max(parseInt(q.page ?? '1'), 1)
    const offset    = (page - 1) * limit

    const conditions: string[] = []
    const values:     unknown[] = []
    let   idx = 1

    if (q.type_code)    { conditions.push(`rt.code = $${idx++}`);                   values.push(q.type_code) }
    if (q.status)       { conditions.push(`r.status = $${idx++}`);                  values.push(q.status) }
    if (q.customer_id)  { conditions.push(`r.customer_id = $${idx++}`);             values.push(q.customer_id) }
    if (q.customer_name){ conditions.push(`c.name ILIKE $${idx++}`);                values.push(`%${q.customer_name}%`) }
    if (q.date_from)    { conditions.push(`r.created_at::date >= $${idx++}`);       values.push(q.date_from) }
    if (q.date_to)      { conditions.push(`r.created_at::date <= $${idx++}`);       values.push(q.date_to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM customer_requests r
       JOIN request_types rt ON r.request_type_id = rt.id
       LEFT JOIN customers c ON r.customer_id = c.id
       ${where}`,
      values
    )
    const total      = parseInt(String(countRes.rows[0].count)) || 0
    const totalPages = Math.ceil(total / limit) || 1

    const dataRes = await pool.query(
      `SELECT
         r.id, r.request_no, r.status,
         r.title, r.description, r.memo, r.admin_memo,
         r.payment_type, r.amount,
         r.tracking_no, r.order_id,
         r.extra_data,
         r.processed_by, r.processed_at,
         r.shipheyo_synced, r.shipheyo_synced_at,
         r.email_sent, r.email_sent_at,
         r.created_at, r.updated_at,
         rt.id   AS type_id,
         rt.code AS type_code,
         rt.label AS type_label,
         rt.icon  AS type_icon,
         COALESCE(c.name,  r.customer_email) AS customer_name,
         COALESCE(c.email, r.customer_email) AS customer_email,
         r.customer_id
       FROM customer_requests r
       JOIN request_types rt ON r.request_type_id = rt.id
       LEFT JOIN customers c ON r.customer_id = c.id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    )

    res.json({ requests: dataRes.rows, total, page, totalPages })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/requests/:id ─────────────────────────────────────
export async function getRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT
         r.*,
         rt.code AS type_code, rt.label AS type_label, rt.icon AS type_icon,
         COALESCE(c.name,  r.customer_email) AS customer_name,
         COALESCE(c.email, r.customer_email) AS customer_email
       FROM customer_requests r
       JOIN request_types rt ON r.request_type_id = rt.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.id = $1`,
      [id]
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Request not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── POST /api/requests ────────────────────────────────────────
export async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      type_code, customer_id, customer_email,
      title, description, memo,
      payment_type, amount,
      tracking_no, order_id,
      extra_data,
    } = req.body as Record<string, unknown>

    // Resolve type_id from code
    const typeRes = await pool.query(
      `SELECT id FROM request_types WHERE code = $1 AND active = true`, [type_code]
    )
    if (typeRes.rowCount === 0) { res.status(400).json({ error: `Unknown request type: ${type_code}` }); return }
    const type_id = typeRes.rows[0].id

    const result = await pool.query(
      `INSERT INTO customer_requests
         (request_type_id, customer_id, customer_email,
          status, title, description, memo,
          payment_type, amount, tracking_no, order_id, extra_data)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, request_no`,
      [type_id, customer_id ?? null, customer_email ?? null,
       title ?? null, description ?? null, memo ?? null,
       payment_type ?? null, amount ?? null,
       tracking_no ?? null, order_id ?? null,
       extra_data ? JSON.stringify(extra_data) : null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── PATCH /api/requests/:id ───────────────────────────────────
export async function updateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id }   = req.params
    const { status, admin_memo, processed_by, email_sent } = req.body as {
      status?:       string
      admin_memo?:   string
      processed_by?: string
      email_sent?:   boolean
    }

    const sets:   string[]  = ['updated_at = NOW()']
    const values: unknown[] = []
    let   idx = 1

    if (status !== undefined) {
      sets.push(`status = $${idx++}`)
      values.push(status)
      if (status === 'approved' || status === 'rejected' || status === 'completed') {
        sets.push(`processed_at = NOW()`)
        if (processed_by) { sets.push(`processed_by = $${idx++}`); values.push(processed_by) }
      }
    }
    if (admin_memo  !== undefined) { sets.push(`admin_memo = $${idx++}`);  values.push(admin_memo) }
    if (email_sent  !== undefined) {
      sets.push(`email_sent = $${idx++}`)
      values.push(email_sent)
      if (email_sent) sets.push(`email_sent_at = NOW()`)
    }

    values.push(id)
    const result = await pool.query(
      `UPDATE customer_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Request not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── GET /api/requests/stats ───────────────────────────────────
export async function getRequestStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')  AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed
      FROM customer_requests
    `)
    const row = result.rows[0]
    res.json({
      total:     parseInt(row.total)     || 0,
      pending:   parseInt(row.pending)   || 0,
      approved:  parseInt(row.approved)  || 0,
      rejected:  parseInt(row.rejected)  || 0,
      completed: parseInt(row.completed) || 0,
    })
  } catch (err) {
    next(err)
  }
}
