import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── GET /api/settings/sales-persons ─────────────────────────
export async function getSalesPersons(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, is_active, created_at
       FROM sales_persons
       ORDER BY name ASC`
    )
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/settings/sales-persons ────────────────────────
export async function createSalesPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, phone } = req.body as { name?: string; email?: string; phone?: string }
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }

    const result = await pool.query(
      `INSERT INTO sales_persons (name, email, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, phone, is_active, created_at`,
      [name.trim(), email?.trim() || null, phone?.trim() || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── PUT /api/settings/sales-persons/:id ─────────────────────
export async function updateSalesPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const { name, email, phone, is_active } = req.body as {
      name?: string; email?: string; phone?: string; is_active?: boolean
    }

    const setClauses: string[] = []
    const values: unknown[]    = []
    let   idx = 1

    if (name      !== undefined) { setClauses.push(`name      = $${idx++}`); values.push(name.trim()) }
    if (email     !== undefined) { setClauses.push(`email     = $${idx++}`); values.push(email?.trim() || null) }
    if (phone     !== undefined) { setClauses.push(`phone     = $${idx++}`); values.push(phone?.trim() || null) }
    if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(is_active) }

    if (setClauses.length === 0) { res.status(400).json({ error: 'No updatable fields provided' }); return }

    setClauses.push(`updated_at = NOW()`)
    values.push(id)

    const result = await pool.query(
      `UPDATE sales_persons SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, email, phone, is_active`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Sales person not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/settings/sales-persons/:id ──────────────────
// Soft-delete: set is_active = false (preserve historical data)
export async function deleteSalesPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await pool.query(
      `UPDATE sales_persons SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Sales person not found' }); return }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}
