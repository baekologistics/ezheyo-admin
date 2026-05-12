import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs         from 'fs'
import http       from 'http'
import FormData   from 'form-data'
import { pool }   from '../config/database'

const API_HOST = 'localhost'
const API_PORT = 4000

const PDFS = [
  '/Users/js/Downloads/Returned Sample UPS_20Capital_20Statement_202025-12-24.pdf',
  '/Users/js/Downloads/Sample UPS_20Capital_20Statement_202026-01-02.pdf',
]

// ── HTTP multipart upload ─────────────────────────────────────
function uploadPdf(filePath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', fs.createReadStream(filePath), {
      filename:    path.basename(filePath),
      contentType: 'application/pdf',
    })

    const options: http.RequestOptions = {
      hostname: API_HOST,
      port:     API_PORT,
      path:     '/api/cod/statements/upload',
      method:   'POST',
      headers:  form.getHeaders(),
    }

    const req = http.request(options, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as Record<string, unknown>)
        } catch {
          reject(new Error(`Invalid JSON response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    form.pipe(req)
  })
}

function sep(title: string) {
  console.log('\n' + '═'.repeat(66))
  console.log(`  ${title}`)
  console.log('═'.repeat(66))
}

function fmt(n: unknown) {
  const v = typeof n === 'string' ? parseFloat(n) : Number(n)
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

async function main() {
  // ── Upload each PDF ──────────────────────────────────────────
  for (const filePath of PDFS) {
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠  File not found: ${filePath}`)
      continue
    }

    sep(`Uploading: ${path.basename(filePath)}`)

    let result: Record<string, unknown>
    try {
      result = await uploadPdf(filePath)
    } catch (err) {
      console.error(`  ❌ Upload failed: ${(err as Error).message}`)
      continue
    }

    if (result.error) {
      console.error(`  ❌ API error: ${result.error}`)
      continue
    }

    const stmt    = result.statement as Record<string, unknown>
    const retChks = result.returnedChecks as unknown[]

    console.log(`  statement_no   : ${stmt?.statement_no}`)
    console.log(`  statement_date : ${String(stmt?.statement_date ?? '').slice(0, 10)}`)
    console.log(`  deposit_total  : ${fmt(stmt?.deposit_total)}`)
    console.log(`  parsed_status  : ${stmt?.parsed_status}`)
    console.log(`  ─────────────────────────────────────────────`)
    console.log(`  total_records  : ${result.totalRecords}`)
    console.log(`  matched        : ${result.matched}   (linked to orders table)`)
    console.log(`  unmatched      : ${result.unmatched}`)
    console.log(`  returned       : ${result.returned}`)

    if (Array.isArray(retChks) && retChks.length > 0) {
      console.log(`\n  Returned Checks (${retChks.length}):`)
      for (const rc of retChks as Array<Record<string, unknown>>) {
        console.log(`    ⚠  ${rc.referenceNo}  |  ${rc.reason}  |  ($${Number(rc.amount).toFixed(2)})  |  ${rc.returnedDate}`)
      }
    } else {
      console.log(`  returned_checks: none`)
    }
  }

  // ── DB verification query ────────────────────────────────────
  sep('DB Verification')

  const result = await pool.query(`
    SELECT
      s.statement_no,
      s.statement_date::text,
      s.deposit_total,
      s.parsed_status,
      COUNT(r.id)                                         AS records,
      COUNT(r.customer_id)                                AS matched,
      SUM(r.cod_amount)                                   AS total_cod,
      SUM(CASE WHEN r.returned THEN 1 ELSE 0 END)::int    AS returned
    FROM cod_statements s
    LEFT JOIN cod_records r ON r.cod_statement_id = s.id
    GROUP BY s.id
    ORDER BY s.statement_date DESC
  `)

  console.log(`\n  ${'statement_no'.padEnd(16)} ${'date'.padEnd(12)} ${'deposit'.padEnd(12)} ${'status'.padEnd(8)} rec  matched  cod_total   ret`)
  console.log('  ' + '─'.repeat(80))

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const date = String(row.statement_date ?? '').slice(0, 10)
    const dep  = fmt(row.deposit_total)
    const cod  = fmt(row.total_cod)
    console.log(
      `  ${String(row.statement_no).padEnd(16)} ${date.padEnd(12)} ${dep.padEnd(12)} ` +
      `${String(row.parsed_status).padEnd(8)} ${String(row.records).padStart(3)}  ` +
      `${String(row.matched).padStart(7)}  ${cod.padEnd(12)} ${row.returned}`
    )
  }

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
