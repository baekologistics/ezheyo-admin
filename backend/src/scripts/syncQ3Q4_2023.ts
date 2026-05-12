import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool }          from '../config/database'
import { runSyncOrders } from '../services/syncService'

const SDATE = '2023-09-07'
const EDATE = '2023-10-31'

async function main() {
  console.log(`\nSyncing orders ${SDATE} ~ ${EDATE} …\n`)

  const result = await runSyncOrders(SDATE, EDATE, info => {
    if (info.added > 0)
      console.log(`  page=${String(info.page).padStart(2)}  count=${String(info.count).padStart(3)}  added=${String(info.added).padStart(3)}  total=${String(info.total).padStart(4)}`)
  })

  console.log(`\n  synced   : ${result.synced}`)
  console.log(`  created  : ${result.created}`)
  console.log(`  updated  : ${result.updated}`)
  console.log(`  unmatched: ${result.unmatched}`)
  if (result.unmatched_emails.length > 0)
    for (const e of result.unmatched_emails.sort()) console.log(`    - ${e}`)

  const { rows } = await pool.query('SELECT COUNT(*) FROM orders')
  console.log(`\n  orders table total: ${rows[0].count} rows`)

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
