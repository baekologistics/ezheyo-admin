import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'

// ── GET /api/logs ─────────────────────────────────────────────────
export async function getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, action, date_from, date_to, page = '1', limit = '50' } = req.query as Record<string, string>

    const params: unknown[] = []
    const conditions: string[] = []
    let idx = 1

    if (username) {
      params.push(username); conditions.push(`l.username = $${idx++}`)
    }
    if (action) {
      params.push(action); conditions.push(`l.action = $${idx++}`)
    }
    if (date_from) {
      params.push(date_from); conditions.push(`l.created_at >= $${idx++}`)
    }
    if (date_to) {
      // include full day
      params.push(date_to + ' 23:59:59'); conditions.push(`l.created_at <= $${idx++}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit)

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT l.id, l.user_id, l.username, l.action, l.page, l.detail, l.ip_address,
                l.created_at
         FROM admin_logs l
         ${where}
         ORDER BY l.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM admin_logs l ${where}`, params),
    ])

    res.json({
      logs:  rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page:  Number(page),
      limit: Number(limit),
    })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/logs/page-view ──────────────────────────────────────
export async function logPageView(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUser = (req as Request & { user?: { userId: string; username: string } }).user
    if (!authUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { page } = req.body as { page?: string }
    if (!page) { res.status(400).json({ error: 'page required' }); return }

    const forwarded = req.headers['x-forwarded-for']
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.socket?.remoteAddress ?? '')

    await pool.query(
      `INSERT INTO admin_logs (user_id, username, action, page, ip_address, user_agent)
       VALUES ($1, $2, 'page_view', $3, $4, $5)`,
      [authUser.userId, authUser.username, page, ip, req.headers['user-agent'] ?? null]
    )

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
