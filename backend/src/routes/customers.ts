import { Router } from 'express'
import {
  getCustomers,
  updateCustomer,
  getCustomerSalesPersons,
  updateCustomerSalesPersons,
} from '../controllers/customersController'

const router = Router()

router.get('/',                           getCustomers)
router.patch('/:id',                      updateCustomer)
router.get('/:id/sales-persons',          getCustomerSalesPersons)
router.put('/:id/sales-persons',          updateCustomerSalesPersons)

export default router
