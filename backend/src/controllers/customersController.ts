import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name ASC')
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function syncCustomers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: call SHIPHEYO API and upsert customers
    res.json({ message: 'Sync not yet implemented' })
  } catch (err) {
    next(err)
  }
}

export async function updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const fields = req.body as Record<string, unknown>
    const keys = Object.keys(fields)
    if (keys.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values = [...Object.values(fields), id]
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
