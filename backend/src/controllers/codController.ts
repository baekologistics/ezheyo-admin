import { Request, Response, NextFunction } from 'express'
import path from 'path'
import { pool } from '../config/database'
import { parseCodStatement } from '../services/codPdfParser'

// ── GET /api/cod/statements ──────────────────────────────────
export async function getStatements(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM cod_records r WHERE r.cod_statement_id = s.id) AS record_count
      FROM cod_statements s
      ORDER BY s.statement_date DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/cod/statements/upload ─────────────────────────
// multer attaches the file to req.file (set up in route)
export async function uploadStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect()
  try {
    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return }

    const buffer   = req.file.buffer
    const filePath = path.join('uploads/cod-statements', req.file.originalname)

    // ── Parse PDF ────────────────────────────────────────────
    const stmt = await parseCodStatement(buffer)

    if (!stmt.statementNo) {
      res.status(422).json({ error: 'Could not parse statement number from PDF' }); return
    }

    await client.query('BEGIN')

    // ── Upsert cod_statements ─────────────────────────────────
    const stmtResult = await client.query(
      `INSERT INTO cod_statements
         (id, statement_no, statement_date, deposit_total, source, parsed_status, file_path)
       VALUES
         (gen_random_uuid(), $1, $2, $3, 'manual', 'parsed', $4)
       ON CONFLICT (statement_no) DO UPDATE SET
         statement_date  = EXCLUDED.statement_date,
         deposit_total   = EXCLUDED.deposit_total,
         parsed_status   = 'parsed',
         file_path       = EXCLUDED.file_path
       RETURNING *`,
      [stmt.statementNo, stmt.statementDate || null, stmt.depositTotal, filePath]
    )
    const savedStmt = stmtResult.rows[0] as Record<string, unknown>

    // Delete existing records for this statement (re-upload scenario)
    await client.query('DELETE FROM cod_records WHERE cod_statement_id = $1', [savedStmt.id])

    // ── Build tracking→customer_id map ───────────────────────
    const trackingNos = [...new Set(stmt.records.map(r => r.trackingNo))]
    let trackingMap: Map<string, string> = new Map()

    if (trackingNos.length > 0) {
      const orderResult = await client.query(
        `SELECT tracking_no, customer_id FROM orders
         WHERE tracking_no = ANY($1::text[]) AND customer_id IS NOT NULL`,
        [trackingNos]
      )
      for (const row of orderResult.rows as Array<Record<string, string>>) {
        trackingMap.set(row.tracking_no, row.customer_id)
      }
    }

    // ── Insert cod_records ───────────────────────────────────
    let matched = 0, unmatched = 0, returned = 0

    for (const rec of stmt.records) {
      const customerId = trackingMap.get(rec.trackingNo) ?? null
      if (customerId) matched++; else unmatched++
      if (rec.isReturned) returned++

      await client.query(
        `INSERT INTO cod_records
           (id, cod_statement_id, order_id, reference_no, tracking_no,
            pickup_date, delivery_date, cod_amount, check_no,
            service_fee, premium_fee, check_amount,
            customer_id, returned)
         VALUES
           (gen_random_uuid(), $1, NULL, $2, $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12)`,
        [
          savedStmt.id,
          rec.referenceNo,
          rec.trackingNo,
          rec.pickupDate   || null,
          rec.deliveryDate || null,
          rec.codAmount,
          rec.checkNo      || null,
          rec.serviceFee,
          rec.premiumFee,
          rec.checkAmount,
          customerId,
          rec.isReturned,
        ]
      )
    }

    await client.query('COMMIT')

    res.status(201).json({
      statement: savedStmt,
      totalRecords: stmt.records.length,
      matched,
      unmatched,
      returned,
      returnedChecks: stmt.returnedChecks,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

// ── POST /api/cod/statements (legacy stub) ────────────────────
export async function createStatement(_req: Request, res: Response): Promise<void> {
  res.status(400).json({ error: 'Use POST /api/cod/statements/upload with a PDF file' })
}

// ── GET /api/cod/records ─────────────────────────────────────
export async function getRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { statement_id } = req.query
    const base = `
      SELECT cr.*,
             c.name  AS customer_name,
             c.email AS customer_email,
             s.statement_no, s.statement_date
      FROM cod_records cr
      LEFT JOIN customers      c ON cr.customer_id      = c.id
      LEFT JOIN cod_statements s ON cr.cod_statement_id = s.id
    `
    const result = statement_id
      ? await pool.query(base + ' WHERE cr.cod_statement_id = $1 ORDER BY cr.pickup_date ASC', [statement_id])
      : await pool.query(base + ' ORDER BY cr.pickup_date DESC LIMIT 500')
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── PATCH /api/cod/records/:id ───────────────────────────────
const ALLOWED_COD_FIELDS = new Set([
  'returned', 'claimed_payment', 'email_sent',
  'quickbook_status', 'quickbook_bill_no', 'paid',
])

export async function updateRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const body   = req.body as Record<string, unknown>
    const fields = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_COD_FIELDS.has(k)))
    if (Object.keys(fields).length === 0) { res.status(400).json({ error: 'No updatable fields' }); return }

    const keys      = Object.keys(fields)
    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
    const values    = [...Object.values(fields), id]
    const result    = await pool.query(
      `UPDATE cod_records SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'COD record not found' }); return }
    res.json(result.rows[0])
  } catch (err) {
    next(err)
  }
}

// ── POST /api/cod/records/:id/email ──────────────────────────
export async function sendEmail(_req: Request, res: Response): Promise<void> {
  res.json({ message: 'Email send not yet implemented' })
}

// ── POST /api/cod/records/:id/qb-bill ────────────────────────
export async function createQbBill(_req: Request, res: Response): Promise<void> {
  res.json({ message: 'QB bill creation not yet implemented' })
}
