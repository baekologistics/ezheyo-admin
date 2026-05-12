/**
 * syncQ3_2023.ts  — 2023 Q3 full sync
 * sdate=2023-09-07, edate=2023-09-30
 *
 * 1. getAllOrders (page-based, fixed parser)
 * 2. DB upsert
 * 3. Unmatched email check
 */
import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool }          from '../config/database'
import { runSyncOrders } from '../services/syncService'

const SDATE = '2023-09-07'
const EDATE = '2023-09-30'

function sep(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

async function main() {
  // ── Step 1 + 2: Collect & sync ────────────────────────────
  sep(`Q3 2023 Sync  (${SDATE} ~ ${EDATE})`)
  console.log()

  const result = await runSyncOrders(SDATE, EDATE, info => {
    console.log(
      `  page=${String(info.page).padStart(2)}  count=${String(info.count).padStart(3)}` +
      `  added=${String(info.added).padStart(3)}  total=${String(info.total).padStart(4)}`
    )
  })

  console.log(`\n  ┌─ Sync result ─────────────────────────────────────`)
  console.log(`  │  synced    : ${result.synced}`)
  console.log(`  │  created   : ${result.created}`)
  console.log(`  │  updated   : ${result.updated}`)
  console.log(`  │  unmatched : ${result.unmatched}`)
  if (result.unmatched_emails.length > 0) {
    console.log(`  │  unmatched emails:`)
    for (const e of result.unmatched_emails.sort()) {
      console.log(`  │    - ${e}`)
    }
  }
  console.log(`  └───────────────────────────────────────────────────`)

  // ── orders table total ───────────────────────────────────
  const { rows: cntRows } = await pool.query('SELECT COUNT(*) FROM orders')
  console.log(`\n  orders table total: ${cntRows[0].count} rows`)

  // ── Step 3: Unmatched email check ────────────────────────
  sep('Unmatched email check')

  const emails = result.unmatched_emails.sort()
  if (emails.length === 0) {
    console.log('\n  All orders matched.')
  } else {
    for (const email of emails) {
      const like = `%${email.split('@')[0].toLowerCase()}%`
      const { rows } = await pool.query(
        `SELECT email, name FROM customers
         WHERE LOWER(email) LIKE $1
            OR LOWER(shipheyo_userid) LIKE $1`,
        [like]
      )
      if (rows.length > 0) {
        console.log(`\n  ⚠  "${email}" — fuzzy match in customers:`)
        for (const r of rows as Array<{ email: string; name: string }>) {
          console.log(`       email="${r.email}"  name="${r.name}"`)
        }
        console.log(`     → likely case/whitespace mismatch`)
      } else {
        console.log(`\n  ✗  "${email}" — NOT in customers table (manual add needed)`)
      }
    }
  }

  // ── Direct lookup as well ────────────────────────────────
  const directSql = `
    SELECT email, name FROM customers
    WHERE email LIKE '%twojgroup%'
       OR email LIKE '%solesent%'
  `
  const { rows: directRows } = await pool.query(directSql)
  sep('Direct lookup: twojgroup / solesent')
  if (directRows.length === 0) {
    console.log('\n  No rows found → neither email is in customers table.')
    console.log('  These are unregistered customers that need to be added manually.')
  } else {
    for (const r of directRows as Array<{ email: string; name: string }>) {
      console.log(`  found: email="${r.email}"  name="${r.name}"`)
    }
  }

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
