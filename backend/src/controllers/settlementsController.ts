import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getSettlements(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT s.*,
        json_agg(sp.*) FILTER (WHERE sp.id IS NOT NULL) AS payments
      FROM settlements s
      LEFT JOIN settlement_payments sp ON sp.settlement_id = s.id
      GROUP BY s.id
      ORDER BY s.month DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { settlement_id, recipient_type, sales_person, amount, method, paid_date, memo } = req.body as {
      settlement_id: string
      recipient_type: string
      sales_person?: string
      amount: number
      method: string
      paid_date: string
      memo?: string
    }
    const result = await pool.query(
      `INSERT INTO settlement_payments (id, settlement_id, recipient_type, sales_person, amount, method, paid_date, memo)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [settlement_id, recipient_type, sales_person || null, amount, method, paid_date, memo || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

export async function updatePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const fields = req.body as Record<string, unknown>
    const keys = Object.keys(fields)
    if (keys.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values = [...Object.values(fields), id]
    const result = await pool.query(
      `UPDATE settlement_payments SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Payment not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}
