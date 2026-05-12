import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

async function post(endpoint: string, params: Record<string, unknown>) {
  const res = await axios.post(
    `${BASE_URL}/${endpoint}`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  )
  return res.data as Record<string, unknown>
}

function sep(title: string) {
  console.log('\n' + '═'.repeat(68))
  console.log(`  ${title}`)
  console.log('═'.repeat(68))
}

function sub(label: string) {
  console.log(`\n  ── ${label}`)
}

async function main() {
  if (!AUTH_KEY) { console.error('AUTH_KEY not set'); process.exit(1) }

  // ════════════════════════════════════════════════════════════
  // 1. getMemberList  (2023-09-07 ~ 2026-05-11)
  // ════════════════════════════════════════════════════════════
  sep('1. getMemberList  sdate=2023-09-07  edate=2026-05-11')

  for (const page of [1, 2, 3]) {
    sub(`page=${page}`)
    try {
      const d    = await post('getmemberlist.asp', { sdate: '2023-09-07', edate: '2026-05-11', page })
      const list = (d.userinfo as Record<string, unknown>[]) ?? []
      const isArray = Array.isArray(d.userinfo)

      console.log(`    totalpage   : ${d.totalpage  ?? '(none)'}`)
      console.log(`    page (resp) : ${d.page       ?? '(none)'}`)
      console.log(`    status      : ${d.status     ?? '(none)'}`)
      console.log(`    message     : ${d.message    ?? ''}`)
      console.log(`    userinfo    : ${isArray ? `array[${list.length}]` : `NOT array — type=${typeof d.userinfo}`}`)

      if (list.length > 0) {
        console.log(`    First 3 emails:`)
        list.slice(0, 3).forEach((m, i) =>
          console.log(`      [${i}] ${String(m.userid ?? '').toLowerCase()}  (${m.ename ?? ''})`)
        )
      }
    } catch (err) {
      console.log(`    ERROR: ${(err as Error).message}`)
    }
  }

  // ════════════════════════════════════════════════════════════
  // 2. getOrderList  (2023-09-14 ~ 2023-12-31)  — pages 1–4
  // ════════════════════════════════════════════════════════════
  sep('2. getOrderList  sdate=2023-09-14  edate=2023-12-31')

  const firstIds: string[] = []   // store first order ID per page to compare

  for (const page of [1, 2, 3, 4]) {
    sub(`page=${page}`)
    try {
      const d      = await post('getOrderlist.asp', { sdate: '2023-09-14', edate: '2023-12-31', page })
      const orders = (d.orderinfo as Record<string, unknown>[]) ?? []
      const isArr  = Array.isArray(d.orderinfo)
      const firstId = orders[0] ? String(orders[0].id) : '—'

      console.log(`    totalorder  : ${d.totalorder ?? '(none)'}`)
      console.log(`    totalpage   : ${d.totalpage  ?? '(none)'}`)
      console.log(`    page (resp) : ${d.page       ?? '(none)'}`)
      console.log(`    status      : ${d.status     ?? '(none)'}`)
      console.log(`    message     : ${d.message    ?? ''}`)
      console.log(`    orderinfo   : ${isArr ? `array[${orders.length}]` : `NOT array — type=${typeof d.orderinfo}`}`)
      console.log(`    first id    : ${firstId}  ${firstIds.includes(firstId) ? '⚠ DUPLICATE of prev page' : firstIds.length > 0 ? '✓ new' : '(baseline)'}`)

      if (orders.length > 0) {
        console.log(`    First 3 orders:`)
        orders.slice(0, 3).forEach((o, i) => {
          const boxes    = (o.boxinfo as Record<string, unknown>[]) ?? []
          const tracking = boxes[0] ? String(boxes[0].tracking ?? '') : '(no box)'
          console.log(`      [${i}] id=${o.id}  userid=${String(o.userid ?? '').toLowerCase()}  date="${o.createdate}"  tracking=${tracking}`)
        })
      }

      firstIds.push(firstId)
    } catch (err) {
      console.log(`    ERROR: ${(err as Error).message}`)
      firstIds.push('ERROR')
    }
  }

  // summary
  console.log('\n  Page first-ID summary:')
  firstIds.forEach((id, i) => console.log(`    page ${i + 1}: firstId=${id}`))
  const unique = new Set(firstIds.filter(id => id !== 'ERROR' && id !== '—')).size
  console.log(`  → unique first-IDs: ${unique}/${firstIds.filter(id => id !== 'ERROR').length}`)

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
