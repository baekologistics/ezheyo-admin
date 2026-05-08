import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

export async function getShipments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name AS customer_name
      FROM shipments s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY s.date DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function getShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const result = await pool.query(
      'SELECT * FROM shipments WHERE id = $1',
      [id]
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Shipment not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

export async function syncShipments(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: call SHIPHEYO API and upsert shipments
    res.json({ message: 'Sync not yet implemented' })
  } catch (err) {
    next(err)
  }
}
