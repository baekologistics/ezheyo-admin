import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getClaims(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT cl.*, c.name AS customer_name, c.email AS customer_email
      FROM claims cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      ORDER BY cl.created_at DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function createClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tracking_no, shipment_id, customer_id, type, claim_amount, ups_claim_no, memo } = req.body as {
      tracking_no: string
      shipment_id?: string
      customer_id?: string
      type: string
      claim_amount: number
      ups_claim_no?: string
      memo?: string
    }
    const result = await pool.query(
      `INSERT INTO claims (id, tracking_no, shipment_id, customer_id, type, claim_amount, claim_status, ups_claim_no, memo)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'claimed', $6, $7)
       RETURNING *`,
      [tracking_no, shipment_id || null, customer_id || null, type, claim_amount, ups_claim_no || null, memo || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

export async function updateClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const fields = req.body as Record<string, unknown>
    const keys = Object.keys(fields)
    if (keys.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values = [...Object.values(fields), id]
    const result = await pool.query(
      `UPDATE claims SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Claim not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

export async function sendClaimEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: send claim notification email
    res.json({ message: 'Email send not yet implemented' })
  } catch (err) {
    next(err)
  }
}
