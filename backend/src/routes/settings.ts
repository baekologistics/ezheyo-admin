import { Router } from 'express'
import {
  getSalesPersons,
  createSalesPerson,
  updateSalesPerson,
  deleteSalesPerson,
} from '../controllers/settingsController'

const router = Router()

router.get('/sales-persons',       getSalesPersons)
router.post('/sales-persons',      createSalesPerson)
router.put('/sales-persons/:id',   updateSalesPerson)
router.delete('/sales-persons/:id', deleteSalesPerson)

export default router
