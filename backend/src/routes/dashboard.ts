import { Router } from 'express'
import {
  getDashboardStats,
  getTopCustomers,
  getMonthlyChart,
  getRecentActivity,
} from '../controllers/dashboardController'

const router = Router()

router.get('/stats',           getDashboardStats)
router.get('/top-customers',   getTopCustomers)
router.get('/monthly-chart',   getMonthlyChart)
router.get('/recent-activity', getRecentActivity)

export default router
