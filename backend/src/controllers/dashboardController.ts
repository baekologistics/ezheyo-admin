import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── ET date helpers ───────────────────────────────────────────────
function etToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function etDateRange() {
  const today      = etToday()                          // '2026-05-18'
  const [ty, tm]   = today.split('-').map(Number)

  // Yesterday: noon-UTC trick avoids DST boundary issues
  const ydRaw = new Date(`${today}T12:00:00Z`)
  ydRaw.setUTCDate(ydRaw.getUTCDate() - 1)
  const yesterday   = ydRaw.toISOString().slice(0, 10)  // '2026-05-17'

  // This month start
  const monthStart  = `${ty}-${String(tm).padStart(2, '0')}-01`

  // Last month range
  const lmYear  = tm === 1 ? ty - 1 : ty
  const lmMonth = tm === 1 ? 12 : tm - 1
  const lmStart = `${lmYear}-${String(lmMonth).padStart(2, '0')}-01`
  const lmEndRaw = new Date(`${monthStart}T12:00:00Z`)
  lmEndRaw.setUTCDate(lmEndRaw.getUTCDate() - 1)
  const lmEnd   = lmEndRaw.toISOString().slice(0, 10)

  return { today, yesterday, monthStart, lmStart, lmEnd }
}

// ── GET /api/dashboard/stats ─────────────────────────────────────
export async function getDashboardStats(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { yesterday, monthStart, lmStart, lmEnd } = etDateRange()

    // This month (1st → yesterday) stats
    const thisResult = await pool.query<{
      revenue: string; profit: string; orders: string; packages: string
    }>(`
      SELECT
        COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2) AS revenue,
        COALESCE(SUM(profit),          0)::DECIMAL(10,2) AS profit,
        COUNT(*)::int                                    AS orders,
        COALESCE(SUM(total_packages),  0)::int           AS packages
      FROM orders
      WHERE date >= $1 AND date <= $2
        AND customer_charge > 0
    `, [monthStart, yesterday])

    // Last month (full) stats for % change
    const prevResult = await pool.query<{
      revenue: string; profit: string
    }>(`
      SELECT
        COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2) AS revenue,
        COALESCE(SUM(profit),          0)::DECIMAL(10,2) AS profit
      FROM orders
      WHERE date >= $1 AND date <= $2
        AND customer_charge > 0
    `, [lmStart, lmEnd])

    const thisRev    = Number(thisResult.rows[0]?.revenue ?? 0)
    const thisProfit = Number(thisResult.rows[0]?.profit  ?? 0)
    const prevRev    = Number(prevResult.rows[0]?.revenue ?? 0)
    const prevProfit = Number(prevResult.rows[0]?.profit  ?? 0)

    const revChange    = prevRev    === 0 ? null : +((( thisRev    - prevRev    ) / prevRev    * 100).toFixed(1))
    const profitChange = prevProfit === 0 ? null : +((( thisProfit - prevProfit ) / prevProfit * 100).toFixed(1))

    // COD outstanding (customer_id is NULL — resolve via tracking_no → orders)
    const codResult = await pool.query<{ total: string; count: string }>(`
      SELECT
        COALESCE(SUM(r.cod_amount), 0)::DECIMAL(10,2) AS total,
        COUNT(DISTINCT o.customer_id)::int             AS count
      FROM cod_records r
      LEFT JOIN orders o ON o.tracking_no = r.tracking_no
      WHERE r.paid = false AND r.returned = false
    `)

    // Customer counts
    const custResult = await pool.query<{ active: string; total: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Active')::int AS active,
        COUNT(*)::int                                  AS total
      FROM customers
    `)

    res.json({
      totalRevenue:        thisRev,
      totalRevenueChange:  revChange,
      totalProfit:         thisProfit,
      totalProfitChange:   profitChange,
      totalOrders:         Number(thisResult.rows[0]?.orders   ?? 0),
      totalPackages:       Number(thisResult.rows[0]?.packages ?? 0),
      codOutstanding:      Number(codResult.rows[0]?.total     ?? 0),
      codOutstandingCount: Number(codResult.rows[0]?.count     ?? 0),
      activeCustomers:     Number(custResult.rows[0]?.active   ?? 0),
      totalCustomers:      Number(custResult.rows[0]?.total    ?? 0),
      periodLabel:         `${monthStart} ~ ${yesterday}`,
    })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/dashboard/top-customers ─────────────────────────────
export async function getTopCustomers(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { yesterday, monthStart } = etDateRange()

    const result = await pool.query<{
      customer_name: string; email: string
      orders: string; packages: string
      revenue: string; ups_cost: string; profit: string
      margin_pct: string | null
    }>(`
      SELECT
        c.name                                                        AS customer_name,
        c.email,
        COUNT(DISTINCT o.id)::int                                     AS orders,
        COALESCE(SUM(o.total_packages),  0)::int                      AS packages,
        COALESCE(SUM(o.customer_charge), 0)::DECIMAL(10,2)            AS revenue,
        COALESCE(SUM(o.ups_cost),        0)::DECIMAL(10,2)            AS ups_cost,
        COALESCE(SUM(o.profit),          0)::DECIMAL(10,2)            AS profit,
        ROUND(
          COALESCE(SUM(o.profit), 0) / NULLIF(SUM(o.customer_charge), 0) * 100,
          1
        )                                                             AS margin_pct
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.date >= $1 AND o.date <= $2
        AND o.customer_charge > 0
      GROUP BY c.id, c.name, c.email
      ORDER BY SUM(o.customer_charge) DESC
      LIMIT 5
    `, [monthStart, yesterday])

    res.json(result.rows.map(r => ({
      customer_name: r.customer_name,
      email:         r.email,
      orders:        Number(r.orders),
      packages:      Number(r.packages),
      revenue:       Number(r.revenue),
      ups_cost:      Number(r.ups_cost),
      profit:        Number(r.profit),
      margin_pct:    r.margin_pct !== null ? Number(r.margin_pct) : null,
    })))
  } catch (err) {
    next(err)
  }
}

// ── GET /api/dashboard/monthly-chart ────────────────────────────
export async function getMonthlyChart(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query<{
      month: string; revenue: string; profit: string; ups_cost: string; orders: string
    }>(`
      SELECT
        TO_CHAR(date, 'YYYY-MM')                         AS month,
        COALESCE(SUM(customer_charge), 0)::DECIMAL(10,2) AS revenue,
        COALESCE(SUM(profit),          0)::DECIMAL(10,2) AS profit,
        COALESCE(SUM(ups_cost),        0)::DECIMAL(10,2) AS ups_cost,
        COUNT(*)::int                                    AS orders
      FROM orders
      WHERE date >= NOW() - INTERVAL '12 months'
        AND customer_charge > 0
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month ASC
    `)

    res.json(result.rows.map(r => ({
      month:    r.month,
      revenue:  Number(r.revenue),
      profit:   Number(r.profit),
      ups_cost: Number(r.ups_cost),
      orders:   Number(r.orders),
    })))
  } catch (err) {
    next(err)
  }
}

// ── GET /api/dashboard/recent-activity ──────────────────────────
export async function getRecentActivity(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query<{
      id: string; tracking_no: string; date: string
      customer_charge: string; service_type: string
      total_packages: number; customer_name: string | null
    }>(`
      SELECT
        o.id,
        o.tracking_no,
        o.date,
        o.customer_charge::DECIMAL(10,2) AS customer_charge,
        o.service_type,
        o.total_packages,
        c.name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_charge > 0
      ORDER BY o.created_at DESC
      LIMIT 10
    `)

    res.json(result.rows.map(r => ({
      id:              r.id,
      tracking_no:     r.tracking_no,
      date:            r.date,
      customer_charge: Number(r.customer_charge),
      service_type:    r.service_type,
      total_packages:  r.total_packages,
      customer_name:   r.customer_name,
    })))
  } catch (err) {
    next(err)
  }
}
