import { Router } from 'express'
import { getLogs, logPageView } from '../controllers/logsController'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()

router.get('/',           authenticateToken, requireRole(['owner1']), getLogs)
router.post('/page-view', authenticateToken, logPageView)

export default router
