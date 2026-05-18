import { Router } from 'express'
import {
  getCustomerReport,
  getSalesPersonReport,
  getReportSummary,
} from '../controllers/reportsController'

const router = Router()

router.get('/customer',     getCustomerReport)
router.get('/sales-person', getSalesPersonReport)
router.get('/summary',      getReportSummary)

export default router
