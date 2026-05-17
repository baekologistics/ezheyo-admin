import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { runSyncCustomers, runSyncOrders, runVoidCheck } from '../services/syncService'

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
    const { date, startDate, endDate } = req.body as {
      date?: string; startDate?: string; endDate?: string
    }
    const sd = date ?? startDate
    const ed = date ?? endDate

    // 1. Sync today (or requested date range)
    const todayResult = await runSyncOrders(sd, ed)

    // 2. Void check for last 7 days (only when syncing today, not a custom range)
    let voidResult = { dates_checked: 0, inserted: 0, updated: 0 }
    if (!startDate && !endDate) {
      // Manual "Sync Today" — run void check too
      voidResult = await runVoidCheck(7)
    }

    res.json({
      inserted:      todayResult.created,
      updated:       todayResult.updated,
      unmatched:     todayResult.unmatched,
      void_updated:  voidResult.updated,
      void_inserted: voidResult.inserted,
    })
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
