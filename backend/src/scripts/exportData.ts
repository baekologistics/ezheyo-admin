/**
 * exportData.ts
 *
 * Exports all tables as SQL INSERT files to backend/exports/
 * Usage:  npx ts-node src/scripts/exportData.ts
 *
 * Output files (one per table):
 *   exports/customers.sql
 *   exports/orders.sql
 *   exports/settlements.sql
 *   exports/cod_payments.sql
 *   exports/sales_persons.sql
 *   exports/admin_users.sql
 *   exports/admin_logs.sql
 */

import fs   from 'fs'
import path from 'path'
import { pool } from '../config/database'

const EXPORT_DIR = path.resolve(__dirname, '../../exports')

// Tables to export (order matters for FK constraints)
const TABLES = [
  'admin_users',
  'sales_persons',
  'customers',
  'orders',
  'settlements',
  'admin_logs',
  'cod_statements',
  'cod_records',        // FK → cod_statements, orders, customers
  'payment_batches',    // FK → customers
  'customer_sales',     // FK → customers, sales_persons
  'request_types',      // no FK (must come before customer_requests)
  'customer_requests',  // FK → request_types, customers
]

// Columns that are GENERATED ALWAYS AS (...) STORED — must be excluded from INSERT
const GENERATED_COLUMNS: Record<string, string[]> = {
  orders: ['profit'],
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean')          return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number')           return String(val)
  if (val instanceof Date)               return `'${val.toISOString()}'`
  // JSON/object → serialize then cast to jsonb
  if (typeof val === 'object') {
    const json = JSON.stringify(val).replace(/'/g, "''")
    return `'${json}'::jsonb`
  }
  // Escape single quotes for plain strings
  return `'${String(val).replace(/'/g, "''")}'`
}

async function exportTable(tableName: string): Promise<number> {
  const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY 1`)
  const rows   = result.rows

  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows — skipping`)
    return 0
  }

  // Exclude GENERATED ALWAYS columns from INSERT
  const excluded = GENERATED_COLUMNS[tableName] ?? []
  const columns  = Object.keys(rows[0]).filter(c => !excluded.includes(c))
  const colList  = columns.map(c => `"${c}"`).join(', ')

  const lines: string[] = [
    `-- ${tableName} (${rows.length} rows)`,
    `-- Generated: ${new Date().toISOString()}`,
    '',
    `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`,
    '',
  ]

  for (const row of rows) {
    const values = columns.map(c => sqlLiteral(row[c])).join(', ')
    lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${values});`)
  }

  lines.push('')

  const outPath = path.join(EXPORT_DIR, `${tableName}.sql`)
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`  ${tableName}: ${rows.length} rows → ${outPath}`)
  return rows.length
}

async function main() {
  // Ensure exports directory exists
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
  }

  console.log(`\n📦 Exporting database to: ${EXPORT_DIR}\n`)

  let total = 0
  for (const table of TABLES) {
    try {
      total += await exportTable(table)
    } catch (err) {
      console.error(`  ⚠ ${table}: ${(err as Error).message}`)
    }
  }

  console.log(`\n✅ Export complete — ${total} total rows across ${TABLES.length} tables`)
  if (Object.keys(GENERATED_COLUMNS).length > 0) {
    for (const [tbl, cols] of Object.entries(GENERATED_COLUMNS)) {
      console.log(`   ℹ️  ${tbl}: excluded generated columns [${cols.join(', ')}]`)
    }
  }
  console.log()
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
