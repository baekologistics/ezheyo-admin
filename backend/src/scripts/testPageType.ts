import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

async function post(params: Record<string, unknown>) {
  const res = await axios.post(
    `${BASE_URL}/getOrderlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  )
  return res.data as Record<string, unknown>
}

async function main() {
  const SDATE = '2023-09-14'
  const EDATE = '2023-12-31'

  const tests: { label: string; params: Record<string, unknown> }[] = [
    { label: 'page=2       (integer)', params: { sdate: SDATE, edate: EDATE, page: 2        } },
    { label: 'page="2"     (string) ', params: { sdate: SDATE, edate: EDATE, page: '2'      } },
    { label: 'pagenum=2    (integer)', params: { sdate: SDATE, edate: EDATE, pagenum: 2     } },
    { label: 'pagenum="2"  (string) ', params: { sdate: SDATE, edate: EDATE, pagenum: '2'   } },
  ]

  console.log(`sdate=${SDATE}  edate=${EDATE}\n`)
  console.log(`  ${'param'.padEnd(28)} ${'resp.page'.padEnd(12)} ${'count'.padEnd(7)} firstId`)
  console.log('  ' + '─'.repeat(60))

  for (const { label, params } of tests) {
    try {
      const d      = await post(params)
      const orders = (d.orderinfo as Record<string, unknown>[]) ?? []
      const firstId = orders[0] ? String(orders[0].id) : '—'
      console.log(
        `  ${label.padEnd(28)} ${String(d.page ?? '(none)').padEnd(12)} ${String(orders.length).padEnd(7)} ${firstId}`
      )
    } catch (err) {
      console.log(`  ${label.padEnd(28)} ERROR: ${(err as Error).message}`)
    }
  }

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
