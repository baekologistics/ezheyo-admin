import { Router } from 'express'
import {
  login, logout, changePassword, getMe,
  getUsers, updateUserRole, resetUserPassword,
} from '../controllers/authController'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()

// ── Public ────────────────────────────────────────────────────────
router.post('/login', login)

// ── Authenticated ─────────────────────────────────────────────────
router.post('/logout',          authenticateToken, logout)
router.post('/change-password', authenticateToken, changePassword)
router.get('/me',               authenticateToken, getMe)

// ── owner1 only ───────────────────────────────────────────────────
router.get('/users',                    authenticateToken, requireRole(['owner1']), getUsers)
router.patch('/users/:id/role',         authenticateToken, requireRole(['owner1']), updateUserRole)
router.post('/users/:id/reset-password',authenticateToken, requireRole(['owner1']), resetUserPassword)

export default router
