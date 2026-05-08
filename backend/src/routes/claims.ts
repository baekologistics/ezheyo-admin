import { Router } from 'express'
import { getClaims, createClaim, updateClaim, sendClaimEmail } from '../controllers/claimsController'

const router = Router()

router.get('/',             getClaims)
router.post('/',            createClaim)
router.patch('/:id',        updateClaim)
router.post('/:id/email',   sendClaimEmail)

export default router
