import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── GET /api/customers ───────────────────────────────────────
export async function getCustomers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT
        c.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id',    sp.id,
              'name',  sp.name,
              'ratio', cs.ratio
            ) ORDER BY cs.ratio DESC
          ) FILTER (WHERE sp.id IS NOT NULL),
          '[]'::json
        ) AS assignments
      FROM customers c
      LEFT JOIN customer_sales  cs ON cs.customer_id     = c.id
      LEFT JOIN sales_persons   sp ON sp.id              = cs.sales_person_id
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// Only admin-editable fields; sync-managed fields are read-only here
const ALLOWED_UPDATE_FIELDS = new Set(['sales_person', 'memo', 'status', 'phone', 'cod_payment_method'])

// ── PATCH /api/customers/:id ─────────────────────────────────
export async function updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const body   = req.body as Record<string, unknown>

    const fields = Object.fromEntries(
      Object.entries(body).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k))
    )
    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: 'No updatable fields provided' })
      return
    }

    const keys      = Object.keys(fields)
    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values    = [...Object.values(fields), id]

    const result = await pool.query(
      `UPDATE customers SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Customer not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── GET /api/customers/:id/sales-persons ─────────────────────
export async function getCustomerSalesPersons(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT cs.id, cs.sales_person_id, cs.ratio,
              sp.name, sp.email, sp.phone, sp.is_active
       FROM customer_sales cs
       JOIN sales_persons  sp ON sp.id = cs.sales_person_id
       WHERE cs.customer_id = $1
       ORDER BY cs.ratio DESC`,
      [id]
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── PUT /api/customers/:id/sales-persons ─────────────────────
// Body: [{ sales_person_id: string, ratio: number }, ...]
// Replaces all assignments. Sum of ratios must equal 100 (or 0 for unassigned).
export async function updateCustomerSalesPersons(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect()
  try {
    const { id }         = req.params
    const assignments    = req.body as Array<{ sales_person_id: string; ratio: number }>

    if (!Array.isArray(assignments)) {
      res.status(400).json({ error: 'Body must be an array' }); return
    }

    // Validate sum
    if (assignments.length > 0) {
      const total = assignments.reduce((s, a) => s + Number(a.ratio), 0)
      if (total !== 100) {
        res.status(400).json({ error: `Ratio sum must be 100 (got ${total})` }); return
      }
    }

    await client.query('BEGIN')

    // Delete all existing assignments for this customer
    await client.query('DELETE FROM customer_sales WHERE customer_id = $1', [id])

    // Insert new assignments
    for (const a of assignments) {
      await client.query(
        `INSERT INTO customer_sales (customer_id, sales_person_id, ratio)
         VALUES ($1, $2, $3)`,
        [id, a.sales_person_id, a.ratio]
      )
    }

    // Update customers.sales_person for display (first by ratio, comma-joined if multiple)
    const displayName = assignments.length === 0
      ? null
      : assignments.length === 1
        ? null  // will be fetched below
        : null  // will be fetched below

    const nameResult = await client.query(
      `SELECT sp.name
       FROM customer_sales cs
       JOIN sales_persons  sp ON sp.id = cs.sales_person_id
       WHERE cs.customer_id = $1
       ORDER BY cs.ratio DESC`,
      [id]
    )
    const names = nameResult.rows.map((r: Record<string, unknown>) => r.name as string)
    const salesPersonDisplay = names.length > 0 ? names.join(', ') : null

    await client.query(
      `UPDATE customers SET sales_person = $1, updated_at = NOW() WHERE id = $2`,
      [salesPersonDisplay, id]
    )

    await client.query('COMMIT')

    // Return updated assignments
    const result = await pool.query(
      `SELECT cs.id, cs.sales_person_id, cs.ratio,
              sp.name, sp.email
       FROM customer_sales cs
       JOIN sales_persons  sp ON sp.id = cs.sales_person_id
       WHERE cs.customer_id = $1
       ORDER BY cs.ratio DESC`,
      [id]
    )
    res.json(result.rows)
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}
