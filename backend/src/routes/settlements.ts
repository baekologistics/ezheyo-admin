import { Router } from 'express'
import {
  getSettlements,
  getSettlementByMonth,
  getSettlementByRange,
  getSettlementHistory,
  getSettlementSummary,
  getPayments,
  createPayment,
  updatePayment,
  deletePayment,
} from '../controllers/settlementsController'

const router = Router()

router.get('/month',           getSettlementByMonth)
router.get('/range',           getSettlementByRange)
router.get('/history',         getSettlementHistory)
router.get('/summary',         getSettlementSummary)
router.get('/payments',        getPayments)
router.post('/payments',       createPayment)
router.patch('/payments/:id',  updatePayment)
router.delete('/payments/:id', deletePayment)
router.get('/',                getSettlements)  // legacy

export default router
