import { Router } from 'express'
import { getShipments, getShipment, syncShipments } from '../controllers/shipmentsController'

const router = Router()

router.get('/',        getShipments)
router.get('/:id',     getShipment)
router.post('/sync',   syncShipments)

export default router
