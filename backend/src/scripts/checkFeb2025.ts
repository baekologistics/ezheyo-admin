import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { pool } from '../config/database'

const EXCEL: Record<string, number> = {
  '2025-02-01':1,'2025-02-02':14,'2025-02-03':54,
  '2025-02-04':34,'2025-02-05':34,'2025-02-06':38,
  '2025-02-07':48,'2025-02-08':2,'2025-02-10':55,
  '2025-02-11':56,'2025-02-12':35,'2025-02-13':54,
  '2025-02-14':51,'2025-02-17':41,'2025-02-18':33,
  '2025-02-19':45,'2025-02-20':41,'2025-02-21':42,
  '2025-02-24':67,'2025-02-25':36,'2025-02-26':52,
  '2025-02-27':62,'2025-02-28':42
}

async function main() {
  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt
    FROM orders WHERE date >= '2025-02-01' AND date <= '2025-02-28'
    GROUP BY date ORDER BY date`)

  console.log('date          DB  Excel  diff')
  const dbDates = new Set<string>()
  for (const row of res.rows as Array<{date:string;cnt:string}>) {
    const d = row.date.slice(0,10)
    dbDates.add(d)
    const db = parseInt(row.cnt)
    const ex = EXCEL[d] ?? 0
    const diff = db - ex
    const flag = diff === 0 ? '✓' : diff > 0 ? `+${diff} (excess)` : `${diff} (short)`
    console.log(`${d}  ${String(db).padStart(3)}  ${String(ex).padStart(5)}  ${flag}`)
  }
  for (const [d, ex] of Object.entries(EXCEL)) {
    if (!dbDates.has(d)) console.log(`${d}    0  ${String(ex).padStart(5)}  -${ex} (short)`)
  }
  const total = await pool.query(`SELECT COUNT(*) FROM orders WHERE date >= '2025-02-01' AND date <= '2025-02-28'`)
  console.log(`\nDB total: ${total.rows[0].count} / 937 target`)
}
main().catch(e => console.error(e.message)).finally(() => pool.end())
