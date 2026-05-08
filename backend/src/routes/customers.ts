import { Router } from 'express'
import { getCustomers, syncCustomers, updateCustomer } from '../controllers/customersController'

const router = Router()

router.get('/',          getCustomers)
router.post('/sync',     syncCustomers)
router.patch('/:id',     updateCustomer)

export default router
