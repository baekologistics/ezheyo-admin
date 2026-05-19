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
export async function uploadStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect()
  try {
    if (!req.file) { res.status(400).json({ error: 'No PDF file uploaded' }); return }

    const buffer   = req.file.buffer
    const filePath = path.join('uploads/cod-statements', req.file.originalname)

    const stmt = await parseCodStatement(buffer)
    if (!stmt.statementNo) {
      res.status(422).json({ error: 'Could not parse statement number from PDF' }); return
    }

    await client.query('BEGIN')

    const stmtResult = await client.query(
      `INSERT INTO cod_statements
         (id, statement_no, statement_date, deposit_total, source, parsed_status, file_path)
       VALUES
         (gen_random_uuid(), $1, $2, $3, 'manual', 'parsed', $4)
       ON CONFLICT (statement_no) DO UPDATE SET
         statement_date = EXCLUDED.statement_date,
         deposit_total  = EXCLUDED.deposit_total,
         parsed_status  = 'parsed',
         file_path      = EXCLUDED.file_path
       RETURNING *`,
      [stmt.statementNo, stmt.statementDate || null, stmt.depositTotal, filePath]
    )
    const savedStmt = stmtResult.rows[0] as Record<string, unknown>

    await client.query('DELETE FROM cod_records WHERE cod_statement_id = $1', [savedStmt.id])

    // tracking_no → customer_id map
    const trackingNos = [...new Set(stmt.records.map(r => r.trackingNo))]
    const trackingMap = new Map<string, string>()
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

    let matched = 0, unmatched = 0, returned = 0

    for (const rec of stmt.records) {
      const customerId = trackingMap.get(rec.trackingNo) ?? null
      if (customerId) matched++; else unmatched++
      if (rec.isReturned) returned++

      // Determine initial cod_status
      let codStatus = 'pending'
      if (rec.isReturned)   codStatus = 'returned'
      else if (customerId)  codStatus = 'collected'

      await client.query(
        `INSERT INTO cod_records
           (id, cod_statement_id, order_id, reference_no, tracking_no,
            pickup_date, delivery_date, cod_amount, check_no,
            service_fee, premium_fee, check_amount,
            customer_id, returned, cod_status)
         VALUES
           (gen_random_uuid(), $1, NULL, $2, $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13)`,
        [
          savedStmt.id, rec.referenceNo, rec.trackingNo,
          rec.pickupDate || null, rec.deliveryDate || null,
          rec.codAmount, rec.checkNo || null,
          rec.serviceFee, rec.premiumFee, rec.checkAmount,
          customerId, rec.isReturned, codStatus,
        ]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({
      statement: savedStmt,
      totalRecords: stmt.records.length,
      matched, unmatched, returned,
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
  'cod_status', 'payment_method', 'returned_reason',
])

export async function updateRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const body   = req.body as Record<string, unknown>
    const fields = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_COD_FIELDS.has(k)))
    if (Object.keys(fields).length === 0) { res.status(400).json({ error: 'No updatable fields' }); return }

    // Auto-set paid_date when marking paid
    if (fields.cod_status === 'paid' || fields.paid === true) {
      fields.paid_date = new Date()
      fields.paid      = true
    }
    if (fields.cod_status === 'returned') {
      fields.returned = true
    }

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

// ── PATCH /api/cod/records/:id/status ────────────────────────
const VALID_COD_STATUSES = new Set(['pending', 'collected', 'paid', 'returned'])

export async function updateRecordStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params
    const { cod_status, returned_reason, payment_method } =
      req.body as { cod_status?: string; returned_reason?: string; payment_method?: string }

    if (!cod_status || !VALID_COD_STATUSES.has(cod_status)) {
      res.status(400).json({ error: 'cod_status must be pending | collected | paid | returned' }); return
    }

    const setCols: string[]   = ['cod_status = $1', 'updated_at = NOW()']
    const values:  unknown[]  = [cod_status]

    if (cod_status === 'paid') {
      setCols.push('paid_date = NOW()', 'paid = true')
    }
    if (cod_status === 'returned') {
      setCols.push('returned = true')
      if (returned_reason) {
        values.push(returned_reason)
        setCols.push(`returned_reason = $${values.length}`)
      }
    }
    if (payment_method && (payment_method === 'qb_bill' || payment_method === 'zelle')) {
      values.push(payment_method)
      setCols.push(`payment_method = $${values.length}`)
    }

    values.push(id)
    const result = await pool.query(
      `UPDATE cod_records SET ${setCols.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rowCount === 0) { res.status(404).json({ error: 'COD record not found' }); return }

    const row = result.rows[0] as Record<string, unknown>

    // Sync orders.cod_status for the tracking_no
    if (row.tracking_no) {
      const orderCodStatus =
        cod_status === 'paid'      ? 'collected' :
        cod_status === 'returned'  ? 'returned'  :
        cod_status === 'collected' ? 'collected' : 'pending'
      await pool.query(
        `UPDATE orders SET cod_status = $1 WHERE tracking_no = $2`,
        [orderCodStatus, row.tracking_no]
      )
    }

    res.json(row)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/cod/payable ─────────────────────────────────────
export async function getPayable(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT
        c.id                   AS customer_id,
        c.name                 AS customer_name,
        c.email                AS customer_email,
        c.cod_payment_method,
        COUNT(cr.id)           AS record_count,
        SUM(cr.check_amount)   AS total_check_amount,
        json_agg(json_build_object(
          'id',           cr.id,
          'tracking_no',  cr.tracking_no,
          'cod_amount',   cr.cod_amount,
          'check_amount', cr.check_amount,
          'check_no',     cr.check_no,
          'pickup_date',  cr.pickup_date,
          'delivery_date',cr.delivery_date,
          'statement_no', s.statement_no,
          'statement_date', s.statement_date
        ) ORDER BY cr.pickup_date ASC) AS records
      FROM cod_records cr
      JOIN customers      c ON cr.customer_id      = c.id
      JOIN cod_statements s ON cr.cod_statement_id = s.id
      WHERE cr.cod_status = 'collected'
        AND cr.batch_id IS NULL
      GROUP BY c.id, c.name, c.email, c.cod_payment_method
      ORDER BY c.name ASC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── GET /api/cod/paid-history ────────────────────────────────
export async function getPaidHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit  = Math.min(parseInt(req.query.limit  as string || '200'), 500)
    const offset = parseInt(req.query.offset as string || '0')

    const result = await pool.query(`
      SELECT
        cr.id, cr.tracking_no, cr.check_amount, cr.cod_amount,
        cr.payment_method, cr.paid_date, cr.check_no,
        c.name  AS customer_name,
        c.email AS customer_email,
        s.statement_no, s.statement_date
      FROM cod_records cr
      LEFT JOIN customers      c ON cr.customer_id      = c.id
      LEFT JOIN cod_statements s ON cr.cod_statement_id = s.id
      WHERE cr.cod_status = 'paid'
      ORDER BY cr.paid_date DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `, [limit, offset])

    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/cod/batches ────────────────────────────────────
export async function createBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { name, week_start, week_end, statement_ids } =
    req.body as { name?: string; week_start?: string; week_end?: string; statement_ids?: string[] }

  if (!statement_ids || statement_ids.length === 0) {
    res.status(400).json({ error: 'statement_ids required' }); return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Fetch all collected, unbatched records from given statements
    const recsResult = await client.query(`
      SELECT cr.*, c.cod_payment_method
      FROM cod_records cr
      JOIN customers c ON cr.customer_id = c.id
      WHERE cr.cod_statement_id = ANY($1::uuid[])
        AND cr.cod_status = 'collected'
        AND cr.batch_id IS NULL
    `, [statement_ids])

    if (recsResult.rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'No collected unbatched records found in given statements' }); return
    }

    // Group by customer_id
    const byCustomer = new Map<string, Array<Record<string, unknown>>>()
    for (const r of recsResult.rows as Array<Record<string, unknown>>) {
      const cid = r.customer_id as string
      if (!byCustomer.has(cid)) byCustomer.set(cid, [])
      byCustomer.get(cid)!.push(r)
    }

    const memo = [name, week_start && week_end ? `${week_start} ~ ${week_end}` : null]
      .filter(Boolean).join(' | ') || null

    const createdBatches: Record<string, unknown>[] = []

    for (const [customerId, custRecs] of byCustomer) {
      const totalAmount = custRecs.reduce((a, r) => a + Number(r.check_amount), 0)
      const method      = (custRecs[0].cod_payment_method as string) === 'zelle' ? 'Zelle' : 'QB Bill'

      const batchResult = await client.query(`
        INSERT INTO payment_batches (id, batch_date, customer_id, total_amount, method, memo)
        VALUES (gen_random_uuid(), CURRENT_DATE, $1, $2, $3, $4)
        RETURNING *
      `, [customerId, totalAmount, method, memo])

      const batch = batchResult.rows[0] as Record<string, unknown>
      createdBatches.push(batch)

      const recordIds = custRecs.map(r => r.id)

      // Set batch_id on cod_records
      await client.query(
        `UPDATE cod_records SET batch_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
        [batch.id, recordIds]
      )

      // Insert junction rows
      for (const r of custRecs) {
        await client.query(
          `INSERT INTO payment_batch_records (id, payment_batch_id, cod_record_id)
           VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING`,
          [batch.id, r.id]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ batches: createdBatches, total: createdBatches.length })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

// ── GET /api/cod/batches ─────────────────────────────────────
export async function getBatches(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT
        pb.*,
        c.name  AS customer_name,
        c.email AS customer_email,
        COUNT(pbr.cod_record_id) AS record_count
      FROM payment_batches pb
      LEFT JOIN customers             c   ON pb.customer_id      = c.id
      LEFT JOIN payment_batch_records pbr ON pbr.payment_batch_id = pb.id
      GROUP BY pb.id, c.name, c.email
      ORDER BY pb.created_at DESC
    `)
    res.json(result.rows)
  } catch (err) {
    next(err)
  }
}

// ── PATCH /api/cod/batches/:id/mark-paid ─────────────────────
export async function markBatchPaid(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const batchResult = await client.query(
      `UPDATE payment_batches
       SET status = 'paid', paid_date = CURRENT_DATE
       WHERE id = $1 RETURNING *`,
      [id]
    )
    if (batchResult.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Batch not found' }); return
    }

    // Mark all records in batch as paid
    await client.query(
      `UPDATE cod_records
       SET cod_status = 'paid', paid_date = NOW(), paid = true, updated_at = NOW()
       WHERE batch_id = $1`,
      [id]
    )

    await client.query('COMMIT')
    res.json({ ok: true, batch: batchResult.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

// ── POST /api/cod/records/:id/email (stub) ───────────────────
export async function sendEmail(_req: Request, res: Response): Promise<void> {
  res.json({ message: 'Email send not yet implemented' })
}

// ── POST /api/cod/records/:id/qb-bill (stub) ─────────────────
export async function createQbBill(_req: Request, res: Response): Promise<void> {
  res.json({ message: 'QB bill creation not yet implemented' })
}
