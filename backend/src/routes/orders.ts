import { Router } from 'express'
import { getOrders, getOrder } from '../controllers/ordersController'

const router = Router()

router.get('/',     getOrders)
router.get('/:id',  getOrder)

export default router
