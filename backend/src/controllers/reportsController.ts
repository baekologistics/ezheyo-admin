import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── GET /api/reports/customer ─────────────────────────────────────
export async function getCustomerReport(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { from, to, customer_id, sales_person_id } = req.query as {
      from?: string
      to?: string
      customer_id?: string
      sales_person_id?: string
    }

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })
      return
    }

    const params: unknown[] = [from, to]
    let paramIdx = 3

    const customerFilter = customer_id
      ? (() => { params.push(customer_id); return `AND o.customer_id = $${paramIdx++}` })()
      : ''

    const salesPersonFilter = sales_person_id
      ? (() => {
          params.push(sales_person_id)
          return `AND EXISTS (
            SELECT 1 FROM customer_sales cs2
            WHERE cs2.customer_id = c.id
              AND cs2.sales_person_id = $${paramIdx++}
          )`
        })()
      : ''

    const result = await pool.query<{
      id: string
      name: string
      email: string
      sales_persons: string | null
      shipments: number
      revenue: string
      ups_cost: string
      profit: string
      margin_pct: string | null
      cod_amount: string
    }>(`
      SELECT
        c.id,
        c.name,
        c.email,
        sp_list.sales_persons,
        COUNT(DISTINCT o.id)::int                                      AS shipments,
        COALESCE(SUM(o.customer_charge), 0)::DECIMAL(10,2)             AS revenue,
        COALESCE(SUM(o.ups_cost),        0)::DECIMAL(10,2)             AS ups_cost,
        COALESCE(SUM(o.profit),          0)::DECIMAL(10,2)             AS profit,
        ROUND(COALESCE(SUM(o.profit),0) / NULLIF(SUM(o.customer_charge),0) * 100, 1) AS margin_pct,
        COALESCE(SUM(o.cod_amount),      0)::DECIMAL(10,2)             AS cod_amount
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN (
        SELECT cs.customer_id,
          STRING_AGG(sp.name, ', ' ORDER BY sp.name) AS sales_persons
        FROM customer_sales cs
        JOIN sales_persons sp ON cs.sales_person_id = sp.id
        GROUP BY cs.customer_id
      ) sp_list ON c.id = sp_list.customer_id
      WHERE o.date >= $1 AND o.date <= $2
        AND o.customer_charge > 0
        ${customerFilter}
        ${salesPersonFilter}
      GROUP BY c.id, c.name, c.email, sp_list.sales_persons
      ORDER BY SUM(o.customer_charge) DESC
    `, params)

    const rows = result.rows.map(r => ({
      id:           r.id,
      name:         r.name,
      email:        r.email,
      sales_persons: r.sales_persons ?? null,
      shipments:    r.shipments,
      revenue:      Number(r.revenue),
      ups_cost:     Number(r.ups_cost),
      profit:       Number(r.profit),
      margin_pct:   r.margin_pct !== null ? Number(r.margin_pct) : null,
      cod_amount:   Number(r.cod_amount),
    }))

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/reports/sales-person ─────────────────────────────────
export async function getSalesPersonReport(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string }

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })
      return
    }

    const result = await pool.query<{
      id: string
      name: string
      shipments: number
      customers: number
      revenue: string
      ups_cost: string
      profit: string
      commission: string
    }>(`
      SELECT
        sp.id,
        sp.name,
        COUNT(DISTINCT o.id)::int                                      AS shipments,
        COUNT(DISTINCT c.id)::int                                      AS customers,
        COALESCE(SUM(o.customer_charge), 0)::DECIMAL(10,2)             AS revenue,
        COALESCE(SUM(o.ups_cost),        0)::DECIMAL(10,2)             AS ups_cost,
        COALESCE(SUM(o.profit),          0)::DECIMAL(10,2)             AS profit,
        ROUND(COALESCE(SUM(o.profit * cs.ratio / 100.0), 0) * 0.10, 2) AS commission
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN customer_sales cs ON c.id = cs.customer_id
      JOIN sales_persons sp ON cs.sales_person_id = sp.id
      WHERE o.date >= $1 AND o.date <= $2
        AND o.customer_charge > 0
      GROUP BY sp.id, sp.name
      ORDER BY SUM(o.customer_charge) DESC
    `, [from, to])

    const rows = result.rows.map(r => ({
      id:         r.id,
      name:       r.name,
      shipments:  r.shipments,
      customers:  r.customers,
      revenue:    Number(r.revenue),
      ups_cost:   Number(r.ups_cost),
      profit:     Number(r.profit),
      commission: Number(r.commission),
    }))

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/reports/summary ──────────────────────────────────────
export async function getReportSummary(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { from, to } = req.query as { from?: string; to?: string }

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })
      return
    }

    const [ordersResult, codResult] = await Promise.all([
      pool.query<{
        total_revenue: string
        total_ups_cost: string
        total_profit: string
        total_orders: number
        total_packages: number
        total_cod_amount: string
        margin_pct: string | null
      }>(`
        SELECT
          COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2)              AS total_revenue,
          COALESCE(SUM(ups_cost),        0)::DECIMAL(10,2)              AS total_ups_cost,
          COALESCE(SUM(profit),          0)::DECIMAL(10,2)              AS total_profit,
          COUNT(*)::int                                                  AS total_orders,
          COALESCE(SUM(total_packages), 0)::int                         AS total_packages,
          COALESCE(SUM(cod_amount), 0)::DECIMAL(10,2)                   AS total_cod_amount,
          ROUND(
            COALESCE(SUM(profit), 0) / NULLIF(SUM(customer_charge), 0) * 100,
            1
          ) AS margin_pct
        FROM orders
        WHERE date >= $1 AND date <= $2
          AND customer_charge > 0
      `, [from, to]),

      pool.query<{ total_cod_collected: string }>(`
        SELECT COALESCE(SUM(cr.cod_amount), 0)::DECIMAL(10,2) AS total_cod_collected
        FROM cod_records cr
        JOIN orders o ON cr.tracking_no = o.tracking_no
        WHERE o.date >= $1 AND o.date <= $2
          AND cr.paid = true
      `, [from, to]),
    ])

    const o = ordersResult.rows[0]
    const c = codResult.rows[0]

    res.json({
      from,
      to,
      totalRevenue:      Number(o.total_revenue),
      totalUpsCost:      Number(o.total_ups_cost),
      totalProfit:       Number(o.total_profit),
      totalOrders:       o.total_orders,
      totalPackages:     o.total_packages,
      totalCodAmount:    Number(o.total_cod_amount),
      marginPct:         o.margin_pct !== null ? Number(o.margin_pct) : null,
      totalCodCollected: Number(c.total_cod_collected),
    })
  } catch (err) {
    next(err)
  }
}
