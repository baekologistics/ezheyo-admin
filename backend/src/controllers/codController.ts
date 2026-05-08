import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getStatements(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM cod_statements ORDER BY statement_date DESC')
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function createStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: handle PDF upload, parse, and insert
    res.status(201).json({ message: 'PDF upload not yet implemented' })
  } catch (err) {
    next(err)
  }
}

export async function getRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT cr.*, c.name AS customer_name, c.email AS customer_email
      FROM cod_records cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      ORDER BY cr.pickup_date DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const fields = req.body as Record<string, unknown>
    const keys = Object.keys(fields)
    if (keys.length === 0) { res.status(400).json({ error: 'No fields to update' }); return }

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values = [...Object.values(fields), id]
    const result = await pool.query(
      `UPDATE cod_records SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'COD record not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

export async function sendEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: send email via Gmail API / Nodemailer
    res.json({ message: 'Email send not yet implemented' })
  } catch (err) {
    next(err)
  }
}

export async function createQbBill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: create QuickBooks bill via QB API
    res.json({ message: 'QB bill creation not yet implemented' })
  } catch (err) {
    next(err)
  }
}
