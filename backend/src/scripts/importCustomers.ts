import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs   from 'fs'
import { pool } from '../config/database'

const CSV_PATH = '/Users/js/Downloads/customers_import_sample.csv'

// "9/7/23" → "2023-09-07"
function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const month = m[1].padStart(2, '0')
  const day   = m[2].padStart(2, '0')
  const yr    = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${yr}-${month}-${day}`
}

function parseCSV(content: string): Record<string, string>[] {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean)
  const header = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals: Record<string, string> = {}
    line.split(',').forEach((v, i) => { vals[header[i]] = v.trim() })
    return vals
  })
}

async function main() {
  // ── Read & parse CSV ────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found: ${CSV_PATH}`)
    process.exit(1)
  }
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'))
  console.log(`CSV rows found: ${rows.length}`)
  console.log('─'.repeat(60))

  let success = 0
  let skipped = 0
  let failed  = 0

  for (const row of rows) {
    const userid      = (row.shipheyo_userid ?? '').toLowerCase().trim()
    const name        = (row.name            ?? '').trim()
    const phone       = (row.phone           ?? '').trim()
    const marginRate  = parseFloat(row.margin_rate ?? '0') || 0
    const paymentType = (row.payment_type    ?? 'Prepay').trim()
    const status      = (row.status          ?? 'Active').trim()
    const createdDate = parseDate(row.created_date ?? '')

    if (!userid) { failed++; console.log(`  ✗ SKIP empty userid (row: ${JSON.stringify(row)})`); continue }

    try {
      const result = await pool.query(
        `INSERT INTO customers
           (id, shipheyo_userid, name, email, phone, margin_rate, payment_type, status, created_date)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (shipheyo_userid) DO NOTHING
         RETURNING id`,
        [userid, name, userid, phone, marginRate, paymentType, status, createdDate]
      )

      if (result.rows.length > 0) {
        success++
        console.log(`  ✓ INSERTED  ${userid.padEnd(38)} ${name}`)
      } else {
        skipped++
        console.log(`  ↩ SKIPPED   ${userid.padEnd(38)} (already exists)`)
      }
    } catch (err) {
      failed++
      console.log(`  ✗ FAILED    ${userid.padEnd(38)} — ${(err as Error).message}`)
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  Import Result')
  console.log('═'.repeat(60))
  console.log(`  Total attempted : ${rows.length}`)
  console.log(`  ✓ Inserted      : ${success}`)
  console.log(`  ↩ Skipped       : ${skipped}`)
  console.log(`  ✗ Failed        : ${failed}`)

  // ── DB verification ─────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  const cnt = await pool.query('SELECT COUNT(*) FROM customers')
  console.log(`  SELECT COUNT(*) FROM customers → ${cnt.rows[0].count}`)

  console.log('\n  SELECT email, name, created_date FROM customers ORDER BY created_date ASC LIMIT 10:')
  const sample = await pool.query(`
    SELECT email, name, created_date
    FROM customers
    ORDER BY created_date ASC NULLS LAST
    LIMIT 10
  `)
  sample.rows.forEach((r: Record<string, unknown>) =>
    console.log(`    ${String(r.created_date ?? 'null').slice(0,10).padEnd(12)} ${String(r.email).padEnd(38)} ${r.name}`)
  )

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
