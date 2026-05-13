import { Router } from 'express'
import { getOrders, getOrder, getOrderStats } from '../controllers/ordersController'

const router = Router()

router.get('/stats', getOrderStats)   // must be before /:id
router.get('/',      getOrders)
router.get('/:id',   getOrder)

export default router
