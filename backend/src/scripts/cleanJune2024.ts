/**
 * cleanJune2024.ts
 * Delete excess June 2024 orders (DB > Excel) by customer_charge ASC (void orders first).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'

// Excel ground truth
const EXCEL: Record<string, number> = {
  '2024-06-01':  1, '2024-06-03': 56, '2024-06-04': 37, '2024-06-05': 47,
  '2024-06-06': 64, '2024-06-07': 31, '2024-06-08':  2, '2024-06-10': 57,
  '2024-06-11': 50, '2024-06-12': 35, '2024-06-13': 52, '2024-06-14': 42,
  '2024-06-16':  6, '2024-06-17': 45, '2024-06-18': 54, '2024-06-19': 53,
  '2024-06-20': 55, '2024-06-21': 29, '2024-06-24': 41, '2024-06-25': 25,
  '2024-06-26': 31, '2024-06-27': 31, '2024-06-28': 39,
}

async function main() {
  // Current DB counts
  const dbRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date >= '2024-06-01' AND date <= '2024-06-30'
    GROUP BY date ORDER BY date`)

  const db: Record<string, number> = {}
  for (const row of dbRes.rows as Array<{ date: string; cnt: string }>) {
    db[row.date.slice(0, 10)] = parseInt(row.cnt)
  }

  console.log('=== Step 1: profit — DB already uses GREATEST(charge-cost, 0), no negatives ===')
  const neg = await pool.query('SELECT COUNT(*) FROM orders WHERE profit < 0')
  console.log(`profit < 0 count: ${neg.rows[0].count}`)

  console.log('\n=== Step 2: June cleanup ===')
  console.log('Date         Excel  DB   Action')

  let totalDeleted = 0

  for (const [date, excelCount] of Object.entries(EXCEL).sort()) {
    const dbCount = db[date] ?? 0
    const excess  = dbCount - excelCount

    if (excess > 0) {
      process.stdout.write(`${date}  ${String(excelCount).padStart(3)}   ${String(dbCount).padStart(3)}  DELETE ${excess} ... `)
      await pool.query(`
        DELETE FROM orders
        WHERE id IN (
          SELECT id FROM orders
          WHERE date = $1
          ORDER BY customer_charge ASC, id ASC
          LIMIT $2
        )`, [date, excess])
      totalDeleted += excess
      console.log('done')
    } else if (excess < 0) {
      console.log(`${date}  ${String(excelCount).padStart(3)}   ${String(dbCount).padStart(3)}  SHORT ${Math.abs(excess)} (need more)`)
    } else {
      console.log(`${date}  ${String(excelCount).padStart(3)}   ${String(dbCount).padStart(3)}  OK`)
    }
  }

  console.log(`\nTotal deleted: ${totalDeleted}`)

  // Final check
  const finalRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date >= '2024-06-01' AND date <= '2024-06-30'
    GROUP BY date ORDER BY date`)
  console.log('\n=== Final June 2024 DB ===')
  for (const row of finalRes.rows as Array<{ date: string; cnt: string }>) {
    const d = row.date.slice(0, 10)
    const excel = EXCEL[d] ?? 0
    const diff  = parseInt(row.cnt) - excel
    const flag  = diff !== 0 ? ` ← ${diff > 0 ? '+'+diff : diff}` : ''
    console.log(`  ${d}: ${row.cnt} / ${excel}${flag}`)
  }

  const total = await pool.query("SELECT COUNT(*) FROM orders WHERE date >= '2024-06-01' AND date <= '2024-06-30'")
  console.log(`\nJune 2024 total: ${total.rows[0].count} / 883`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
