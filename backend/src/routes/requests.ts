import { Router } from 'express'
import {
  getRequestTypes,
  getRequests,
  getRequest,
  createRequest,
  updateRequest,
  getRequestStats,
} from '../controllers/requestsController'

const router = Router()

router.get('/types',  getRequestTypes)
router.get('/stats',  getRequestStats)
router.get('/',       getRequests)
router.get('/:id',    getRequest)
router.post('/',      createRequest)
router.patch('/:id',  updateRequest)

export default router
