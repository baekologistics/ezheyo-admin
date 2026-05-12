import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { runSyncCustomers, runSyncOrders } from '../services/syncService'

export async function syncCustomers(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await runSyncCustomers()
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function syncOrders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { startDate, endDate } = req.body as { startDate?: string; endDate?: string }
    const result = await runSyncOrders(startDate, endDate)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function syncStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT MAX(last_synced_at) AS last_synced_at FROM customers'
    )
    res.json({ last_synced_at: result.rows[0]?.last_synced_at ?? null })
  } catch (err) {
    next(err)
  }
}
