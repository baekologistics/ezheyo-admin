import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── Helper: find-or-create settlement row for a month ───────────
async function upsertSettlement(month: string): Promise<string> {
  const existing = await pool.query(
    'SELECT id FROM settlements WHERE month = $1',
    [month]
  )
  if (existing.rows.length > 0) return existing.rows[0].id as string

  const stats = await pool.query<{
    revenue: string; ups_cost: string; net_profit: string
  }>(`
    SELECT
      COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2) AS revenue,
      COALESCE(SUM(ups_cost),        0)::DECIMAL(10,2) AS ups_cost,
      COALESCE(SUM(profit),          0)::DECIMAL(10,2) AS net_profit
    FROM orders
    WHERE TO_CHAR(date, 'YYYY-MM') = $1
      AND customer_charge > 0
  `, [month])

  const { revenue, ups_cost, net_profit } = stats.rows[0]
  const np = Number(net_profit)

  const result = await pool.query<{ id: string }>(`
    INSERT INTO settlements
      (month, revenue, ups_cost, net_profit, baeko_amount, sales_amount, overhead_amount)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (month) DO UPDATE SET
      revenue         = EXCLUDED.revenue,
      ups_cost        = EXCLUDED.ups_cost,
      net_profit      = EXCLUDED.net_profit,
      baeko_amount    = EXCLUDED.baeko_amount,
      sales_amount    = EXCLUDED.sales_amount,
      overhead_amount = EXCLUDED.overhead_amount,
      updated_at      = NOW()
    RETURNING id
  `, [
    month,
    Number(revenue).toFixed(2),
    Number(ups_cost).toFixed(2),
    np.toFixed(2),
    (np * 0.30).toFixed(2),
    (np * 0.10).toFixed(2),
    (np * 0.60).toFixed(2),
  ])
  return result.rows[0].id
}

// ── GET /api/settlements/month?year=2026&month=5 ─────────────────
export async function getSettlementByMonth(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const year  = parseInt(req.query.year  as string)
    const month = parseInt(req.query.month as string)
    if (isNaN(year) || isNaN(month)) {
      res.status(400).json({ error: 'year and month query params required' })
      return
    }

    const monthStr = `${year}-${String(month).padStart(2, '0')}`

    // Monthly totals from orders
    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int                              AS shipments,
        COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2) AS revenue,
        COALESCE(SUM(ups_cost),        0)::DECIMAL(10,2) AS ups_cost,
        COALESCE(SUM(profit),          0)::DECIMAL(10,2) AS net_profit,
        ROUND(COALESCE(SUM(profit), 0) * 0.30, 2)       AS baeko_amount,
        ROUND(COALESCE(SUM(profit), 0) * 0.10, 2)       AS sales_amount,
        ROUND(COALESCE(SUM(profit), 0) * 0.60, 2)       AS overhead_amount
      FROM orders
      WHERE EXTRACT(YEAR  FROM date) = $1
        AND EXTRACT(MONTH FROM date) = $2
        AND customer_charge > 0
    `, [year, month])

    const stats = statsResult.rows[0]

    // Per-sales-person commission (via customer_sales ratio)
    const commResult = await pool.query(`
      SELECT
        sp.id                                                AS sales_person_id,
        sp.name                                              AS sales_person,
        COUNT(DISTINCT o.id)::int                           AS shipments,
        COALESCE(SUM(o.customer_charge), 0)::DECIMAL(10,2) AS revenue,
        COALESCE(SUM(o.ups_cost),        0)::DECIMAL(10,2) AS ups_cost,
        COALESCE(SUM(o.profit),          0)::DECIMAL(10,2) AS profit,
        ROUND(COALESCE(SUM(o.profit * cs.ratio / 100.0), 0) * 0.10, 2) AS commission
      FROM orders o
      JOIN customers      c  ON o.customer_id       = c.id
      JOIN customer_sales cs ON c.id                = cs.customer_id
      JOIN sales_persons  sp ON cs.sales_person_id  = sp.id
      WHERE EXTRACT(YEAR  FROM o.date) = $1
        AND EXTRACT(MONTH FROM o.date) = $2
        AND o.customer_charge > 0
      GROUP BY sp.id, sp.name
      ORDER BY commission DESC
    `, [year, month])

    // Payments: only look up if settlement exists (no auto-create on GET)
    const settlementResult = await pool.query(
      'SELECT id FROM settlements WHERE month = $1', [monthStr]
    )
    const settlementId: string | null = settlementResult.rows[0]?.id ?? null

    let payments: unknown[] = []
    if (settlementId) {
      const payResult = await pool.query(
        `SELECT * FROM settlement_payments
         WHERE settlement_id = $1
         ORDER BY paid_date, created_at`,
        [settlementId]
      )
      payments = payResult.rows
    }

    res.json({
      month:          monthStr,
      settlement_id:  settlementId,
      ...stats,
      sales_persons:  commResult.rows,
      payments,
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/settlements/history ─────────────────────────────────
export async function getSettlementHistory(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const histResult = await pool.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM')                         AS month,
        COUNT(*)::int                                    AS shipments,
        SUM(customer_charge)::DECIMAL(10,2)              AS revenue,
        SUM(ups_cost)::DECIMAL(10,2)                     AS ups_cost,
        SUM(profit)::DECIMAL(10,2)                       AS net_profit,
        ROUND(SUM(profit) * 0.30, 2)                     AS baeko_amount,
        ROUND(SUM(profit) * 0.10, 2)                     AS sales_amount,
        ROUND(SUM(profit) * 0.60, 2)                     AS overhead_amount
      FROM orders
      WHERE customer_charge > 0
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month DESC
    `)

    const months = (histResult.rows as Array<{ month: string }>).map(r => r.month)

    // Payments grouped by month
    const settlementsResult = await pool.query(`
      SELECT
        s.month,
        s.id AS settlement_id,
        COALESCE(
          json_agg(sp.* ORDER BY sp.paid_date, sp.created_at)
          FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) AS payments
      FROM settlements s
      LEFT JOIN settlement_payments sp ON sp.settlement_id = s.id
      WHERE s.month = ANY($1::text[])
      GROUP BY s.month, s.id
    `, [months])

    type PayRow = { month: string; settlement_id: string; payments: unknown[] }
    const byMonth = new Map<string, PayRow>()
    for (const row of settlementsResult.rows as PayRow[]) {
      byMonth.set(row.month, row)
    }

    // Per-sales-person commission grouped by month
    const spCommResult = await pool.query(`
      SELECT
        TO_CHAR(o.date, 'YYYY-MM')                               AS month,
        sp.name                                                   AS name,
        ROUND(SUM(o.profit * cs.ratio / 100.0) * 0.10, 2)        AS commission
      FROM orders o
      JOIN customers      c  ON o.customer_id      = c.id
      JOIN customer_sales cs ON c.id               = cs.customer_id
      JOIN sales_persons  sp ON cs.sales_person_id = sp.id
      WHERE o.customer_charge > 0
      GROUP BY TO_CHAR(o.date, 'YYYY-MM'), sp.id, sp.name
      ORDER BY month DESC, commission DESC
    `)

    type SpCommRow = { month: string; name: string; commission: string }
    const commByMonth = new Map<string, Array<{ name: string; commission: number }>>()
    for (const row of spCommResult.rows as SpCommRow[]) {
      if (!commByMonth.has(row.month)) commByMonth.set(row.month, [])
      commByMonth.get(row.month)!.push({ name: row.name, commission: Number(row.commission) })
    }

    const result = (histResult.rows as Array<Record<string, unknown>>).map(r => {
      const monthKey = r.month as string
      const pays = (byMonth.get(monthKey)?.payments ?? []) as Array<{
        recipient_type: string; sales_person: string | null; amount: string | number
      }>
      const comms = commByMonth.get(monthKey) ?? []

      const salesPersonCommissions = comms.map(({ name, commission }) => {
        const paidAmount = pays
          .filter(p => p.recipient_type === 'sales_person' && p.sales_person === name)
          .reduce((a, p) => a + Number(p.amount), 0)
        const paid = commission > 0 ? paidAmount >= commission * 0.99 : paidAmount > 0
        return { name, commission, paid, paidAmount }
      })

      return {
        ...r,
        settlement_id:          byMonth.get(monthKey)?.settlement_id ?? null,
        payments:               pays,
        salesPersonCommissions,
      }
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/settlements/range?from=2025-01-01&to=2025-03-31 ─────
export async function getSettlementByRange(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string }
    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })
      return
    }

    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int                                          AS shipments,
        COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2)      AS revenue,
        COALESCE(SUM(ups_cost),        0)::DECIMAL(10,2)      AS ups_cost,
        COALESCE(SUM(profit),          0)::DECIMAL(10,2)      AS net_profit,
        ROUND(COALESCE(SUM(profit), 0) * 0.30, 2)             AS baeko_amount,
        ROUND(COALESCE(SUM(profit), 0) * 0.10, 2)             AS sales_amount,
        ROUND(COALESCE(SUM(profit), 0) * 0.60, 2)             AS overhead_amount
      FROM orders
      WHERE date >= $1 AND date <= $2
        AND customer_charge > 0
    `, [from, to])

    const commResult = await pool.query(`
      SELECT
        sp.id                                                  AS sales_person_id,
        sp.name                                                AS sales_person,
        COUNT(DISTINCT o.id)::int                             AS shipments,
        COALESCE(SUM(o.customer_charge), 0)::DECIMAL(10,2)   AS revenue,
        COALESCE(SUM(o.ups_cost),        0)::DECIMAL(10,2)   AS ups_cost,
        COALESCE(SUM(o.profit),          0)::DECIMAL(10,2)   AS profit,
        ROUND(COALESCE(SUM(o.profit * cs.ratio / 100.0), 0) * 0.10, 2) AS commission
      FROM orders o
      JOIN customers      c  ON o.customer_id       = c.id
      JOIN customer_sales cs ON c.id                = cs.customer_id
      JOIN sales_persons  sp ON cs.sales_person_id  = sp.id
      WHERE o.date >= $1 AND o.date <= $2
        AND o.customer_charge > 0
      GROUP BY sp.id, sp.name
      ORDER BY commission DESC
    `, [from, to])

    res.json({
      from,
      to,
      ...statsResult.rows[0],
      sales_persons: commResult.rows,
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/settlements/payments?month=2026-05 ──────────────────
export async function getPayments(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { month } = req.query as { month?: string }
    if (!month) { res.status(400).json({ error: 'month required' }); return }

    const sResult = await pool.query(
      'SELECT id FROM settlements WHERE month = $1', [month]
    )
    if (sResult.rows.length === 0) { res.json([]); return }

    const pResult = await pool.query(
      `SELECT * FROM settlement_payments
       WHERE settlement_id = $1
       ORDER BY paid_date, created_at`,
      [sResult.rows[0].id]
    )
    res.json(pResult.rows)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/settlements/payments ───────────────────────────────
export async function createPayment(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const {
      month, recipient_type, sales_person,
      amount, method, paid_date, memo,
    } = req.body as {
      month: string
      recipient_type: 'baeko' | 'sales_person'
      sales_person?: string
      amount: number
      method: string
      paid_date: string
      memo?: string
    }

    if (!month || !recipient_type || !amount || !method || !paid_date) {
      res.status(400).json({ error: 'month, recipient_type, amount, method, paid_date required' })
      return
    }

    const settlementId = await upsertSettlement(month)

    const result = await pool.query(
      `INSERT INTO settlement_payments
         (id, settlement_id, recipient_type, sales_person, amount, method, paid_date, memo)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [settlementId, recipient_type, sales_person || null, amount, method, paid_date, memo || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── PATCH /api/settlements/payments/:id ──────────────────────────
export async function updatePayment(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params
    const allowed = ['recipient_type', 'sales_person', 'amount', 'method', 'paid_date', 'memo']
    const fields  = req.body as Record<string, unknown>
    const keys    = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) { res.status(400).json({ error: 'No updatable fields provided' }); return }

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values    = [...keys.map(k => fields[k]), id]
    const result    = await pool.query(
      `UPDATE settlement_payments SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'Payment not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/settlements/payments/:id ─────────────────────────
export async function deletePayment(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM settlement_payments WHERE id = $1', [id])
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

// ── GET /api/settlements/summary ─────────────────────────────────
export async function getSettlementSummary(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const HIST_START = '2024-12-01'

    // BAEKO earned: 30% of all profit since history start
    const baekoEarnResult = await pool.query<{ earned: string }>(`
      SELECT ROUND(COALESCE(SUM(profit), 0) * 0.30, 2) AS earned
      FROM orders
      WHERE date >= $1 AND customer_charge > 0
    `, [HIST_START])
    const baekoEarned = Number(baekoEarnResult.rows[0]?.earned ?? 0)

    // Sales Persons earned via customer_sales ratio
    const spEarnResult = await pool.query<{ name: string; earned: string }>(`
      SELECT sp.name,
        ROUND(COALESCE(SUM(o.profit * cs.ratio / 100.0), 0) * 0.10, 2) AS earned
      FROM orders o
      JOIN customers      c  ON o.customer_id      = c.id
      JOIN customer_sales cs ON c.id               = cs.customer_id
      JOIN sales_persons  sp ON cs.sales_person_id = sp.id
      WHERE o.date >= $1 AND o.customer_charge > 0
      GROUP BY sp.id, sp.name
      ORDER BY sp.name
    `, [HIST_START])

    // BAEKO paid
    const baekoPaidResult = await pool.query<{ paid: string }>(`
      SELECT COALESCE(SUM(amount), 0)::DECIMAL(10,2) AS paid
      FROM settlement_payments
      WHERE recipient_type = 'baeko'
    `)
    const baekoPaid = Number(baekoPaidResult.rows[0]?.paid ?? 0)

    // Per-sales-person paid
    const spPaidResult = await pool.query<{ sales_person: string; paid: string }>(`
      SELECT sales_person,
        COALESCE(SUM(amount), 0)::DECIMAL(10,2) AS paid
      FROM settlement_payments
      WHERE recipient_type = 'sales_person' AND sales_person IS NOT NULL
      GROUP BY sales_person
    `)
    const spPaidMap = new Map<string, number>()
    for (const row of spPaidResult.rows) {
      spPaidMap.set(row.sales_person, Number(row.paid))
    }

    const salesPersons = spEarnResult.rows.map(row => {
      const earned = Number(row.earned)
      const paid   = spPaidMap.get(row.name) ?? 0
      return {
        name:        row.name,
        totalEarned: earned,
        totalPaid:   paid,
        totalUnpaid: Math.max(0, earned - paid),
      }
    })

    const baekoUnpaid   = Math.max(0, baekoEarned - baekoPaid)
    const totalSpPaid   = salesPersons.reduce((a, s) => a + s.totalPaid, 0)
    const totalSpUnpaid = salesPersons.reduce((a, s) => a + s.totalUnpaid, 0)

    res.json({
      baeko: {
        totalEarned: baekoEarned,
        totalPaid:   baekoPaid,
        totalUnpaid: baekoUnpaid,
      },
      salesPersons,
      totalPaid:   +((baekoPaid   + totalSpPaid).toFixed(2)),
      totalUnpaid: +((baekoUnpaid + totalSpUnpaid).toFixed(2)),
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/settlements (legacy) ────────────────────────────────
export async function getSettlements(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT s.*,
        COALESCE(
          json_agg(sp.* ORDER BY sp.paid_date) FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) AS payments
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
