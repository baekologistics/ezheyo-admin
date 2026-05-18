import { Router } from 'express'
import { login, logout, changePassword, getMe } from '../controllers/authController'
import { authenticateToken } from '../middleware/auth'

const router = Router()

router.post('/login',           login)
router.post('/logout',          authenticateToken, logout)
router.post('/change-password', authenticateToken, changePassword)
router.get('/me',               authenticateToken, getMe)

export default router
