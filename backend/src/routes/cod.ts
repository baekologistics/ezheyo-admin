import { Router } from 'express'
import multer from 'multer'
import {
  getStatements, uploadStatement, createStatement,
  getRecords, updateRecord,
  sendEmail, createQbBill,
} from '../controllers/codController'

const router = Router()

// Multer: memory storage (buffer passed to parser, no temp disk file needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf'
    cb(null, ok)
  },
})

router.get('/statements',                    getStatements)
router.post('/statements/upload',            upload.single('file'), uploadStatement)
router.post('/statements',                   createStatement)        // legacy stub

router.get('/records',                       getRecords)
router.patch('/records/:id',                 updateRecord)
router.post('/records/:id/email',            sendEmail)
router.post('/records/:id/qb-bill',          createQbBill)

export default router
