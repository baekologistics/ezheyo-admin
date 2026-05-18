import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/database'

const JWT_SECRET   = process.env.JWT_SECRET   || 'dev_secret_change_this'
const JWT_EXPIRES  = process.env.JWT_EXPIRES_IN || '7d'

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress ?? ''
}

async function writeLog(
  userId: string | null,
  username: string,
  action: string,
  page: string | null,
  detail: string | null,
  req: Request
) {
  try {
    await pool.query(
      `INSERT INTO admin_logs (user_id, username, action, page, detail, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, action, page, detail, getIp(req), req.headers['user-agent'] ?? null]
    )
  } catch { /* log errors are non-fatal */ }
}

// ── POST /api/auth/login ──────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body as { username?: string; password?: string }

    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' })
      return
    }

    const result = await pool.query<{
      id: string; username: string; display_name: string; password_hash: string
      role: string; must_change_password: boolean
    }>(
      'SELECT id, username, display_name, password_hash, role, must_change_password FROM admin_users WHERE username = $1',
      [username]
    )

    const user = result.rows[0]
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Update last_login
    await pool.query(
      'UPDATE admin_users SET last_login = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    )

    // Sign JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, displayName: user.display_name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES } as jwt.SignOptions
    )

    await writeLog(user.id, user.username, 'login', null, null, req)

    res.json({
      token,
      user: {
        username:           user.username,
        displayName:        user.display_name,
        role:               user.role,
        mustChangePassword: user.must_change_password,
      },
    })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as Request & { user?: { userId: string; username: string } }).user
    if (user) {
      await writeLog(user.userId, user.username, 'logout', null, null, req)
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/change-password ────────────────────────────────
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUser = (req as Request & { user?: { userId: string; username: string } }).user
    if (!authUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string; newPassword?: string
    }
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword required' })
      return
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' })
      return
    }

    const result = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [authUser.userId]
    )
    const row = result.rows[0]
    if (!row) { res.status(404).json({ error: 'User not found' }); return }

    const valid = await bcrypt.compare(currentPassword, row.password_hash)
    if (!valid) { res.status(400).json({ error: 'Current password is incorrect' }); return }

    const hash = await bcrypt.hash(newPassword, 12)
    await pool.query(
      `UPDATE admin_users
       SET password_hash = $1, must_change_password = false, updated_at = NOW()
       WHERE id = $2`,
      [hash, authUser.userId]
    )

    await writeLog(authUser.userId, authUser.username, 'change_password', null, null, req)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUser = (req as Request & { user?: { userId: string; username: string; displayName: string; role: string } }).user
    if (!authUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const result = await pool.query<{
      username: string; display_name: string; role: string; must_change_password: boolean
    }>(
      'SELECT username, display_name, role, must_change_password FROM admin_users WHERE id = $1',
      [authUser.userId]
    )
    const user = result.rows[0]
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    res.json({
      username:           user.username,
      displayName:        user.display_name,
      role:               user.role,
      mustChangePassword: user.must_change_password,
    })
  } catch (err) {
    next(err)
  }
}
