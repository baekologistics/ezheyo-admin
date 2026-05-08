import { Router } from 'express'
import {
  getStatements, createStatement,
  getRecords, updateRecord,
  sendEmail, createQbBill,
} from '../controllers/codController'

const router = Router()

router.get('/statements',            getStatements)
router.post('/statements',           createStatement)
router.get('/records',               getRecords)
router.patch('/records/:id',         updateRecord)
router.post('/records/:id/email',    sendEmail)
router.post('/records/:id/qb-bill',  createQbBill)

export default router
