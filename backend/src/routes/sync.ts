import { Router } from 'express'
import { syncCustomers, syncOrders, syncStatus } from '../controllers/syncController'

const router = Router()

router.post('/customers',  syncCustomers)
router.post('/orders',     syncOrders)
router.get('/status',      syncStatus)

export default router
