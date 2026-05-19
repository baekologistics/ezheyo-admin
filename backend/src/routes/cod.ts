import { Router } from 'express'
import multer from 'multer'
import {
  getStatements, uploadStatement, createStatement,
  getRecords, updateRecord, updateRecordStatus,
  sendEmail, createQbBill,
  getPayable, getPaidHistory,
  createBatch, getBatches, markBatchPaid, undoBatchPaid,
} from '../controllers/codController'

const router = Router()

// Multer: memory storage (buffer passed to parser)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf'
    cb(null, ok)
  },
})

// ── Statements ────────────────────────────────────────────────
router.get('/statements',             getStatements)
router.post('/statements/upload',     upload.single('file'), uploadStatement)
router.post('/statements',            createStatement)          // legacy stub

// ── Records ───────────────────────────────────────────────────
router.get('/records',                getRecords)
router.patch('/records/:id',          updateRecord)
router.patch('/records/:id/status',   updateRecordStatus)
router.post('/records/:id/email',     sendEmail)               // stub
router.post('/records/:id/qb-bill',   createQbBill)            // stub

// ── Payable & Paid History ─────────────────────────────────────
router.get('/payable',                getPayable)
router.get('/paid-history',           getPaidHistory)

// ── Batches ───────────────────────────────────────────────────
router.post('/batches',               createBatch)
router.get('/batches',                getBatches)
router.patch('/batches/:id/mark-paid', markBatchPaid)
router.patch('/batches/:id/undo-paid', undoBatchPaid)

export default router
