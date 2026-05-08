import { Router } from 'express'
import { getSettlements, createPayment, updatePayment } from '../controllers/settlementsController'

const router = Router()

router.get('/',                 getSettlements)
router.post('/payments',        createPayment)
router.patch('/payments/:id',   updatePayment)

export default router
