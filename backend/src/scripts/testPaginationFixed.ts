import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''
const BASE = 'https://shipheyo.com/linked'

function sep(t: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${t}`)
  console.log('═'.repeat(60))
}

// ── getMemberList ──────────────────────────────────────────────

async function testMemberPage(page: number, sdate: string, edate: string) {
  const payload = qs.stringify({ authkey: AUTH_KEY, page, sdate, edate })
  try {
    const res = await axios.post(`${BASE}/getmemberlist.asp`, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    })
    const d = res.data as Record<string, unknown>
    const users = (d.userinfo as Record<string, unknown>[]) ?? []

    console.log(`\n  [Page ${page}]`)
    console.log(`  인원수      : ${users.length}`)
    console.log(`  totalcount  : ${d.totalcount ?? d.total ?? d.totaluser ?? '(없음)'}`)
    console.log(`  totalpage   : ${d.totalpage ?? '(없음)'}`)
    console.log(`  status/msg  : ${d.status ?? ''} / ${d.message ?? ''}`)

    if (users.length > 0) {
      console.log('  처음 3명 이메일:')
      users.slice(0, 3).forEach((u, i) => {
        const email = u.email ?? u.EMAIL ?? '(없음)'
        console.log(`    [${i}] ${email}`)
      })
    } else {
      console.log('  raw keys: ' + Object.keys(d).join(', '))
      console.log('  raw: ' + JSON.stringify(d).slice(0, 200))
    }

    return users.length
  } catch (err: unknown) {
    const e = err as { response?: { status: number; data: unknown }; message: string }
    if (e.response) {
      console.log(`  [Page ${page}] HTTP ${e.response.status} — ${JSON.stringify(e.response.data).slice(0, 200)}`)
    } else {
      console.log(`  [Page ${page}] ERROR: ${e.message}`)
    }
    return 0
  }
}

// ── getOrderList ───────────────────────────────────────────────

async function testOrderPage(page: number, sdate: string, edate: string) {
  const payload = qs.stringify({ authkey: AUTH_KEY, page, sdate, edate })
  try {
    const res = await axios.post(`${BASE}/getOrderlist.asp`, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    })
    const d = res.data as Record<string, unknown>
    const orders = (d.orderinfo as Record<string, unknown>[]) ?? []

    console.log(`\n  [Page ${page}]`)
    console.log(`  건수        : ${orders.length}`)
    console.log(`  totalorder  : ${d.totalorder ?? '(없음)'}`)
    console.log(`  totalpage   : ${d.totalpage ?? '(없음)'}`)
    console.log(`  status/msg  : ${d.status ?? ''} / ${d.message ?? ''}`)

    if (orders.length > 0) {
      const firstId  = (orders[0]  as Record<string, unknown>).id
      const lastId   = (orders[orders.length - 1] as Record<string, unknown>).id
      console.log(`  첫 주문 id  : ${firstId}`)
      console.log(`  마지막 id   : ${lastId}`)
    }

    return { count: orders.length, totalorder: d.totalorder, totalpage: d.totalpage }
  } catch (err: unknown) {
    const e = err as { response?: { status: number; data: unknown }; message: string }
    if (e.response) {
      console.log(`  [Page ${page}] HTTP ${e.response.status} — ${JSON.stringify(e.response.data).slice(0, 200)}`)
    } else {
      console.log(`  [Page ${page}] ERROR: ${e.message}`)
    }
    return null
  }
}

// ── main ───────────────────────────────────────────────────────

async function main() {
  if (!AUTH_KEY) { console.error('SHIPHEYO_AUTH_KEY not set'); process.exit(1) }

  // 1. getMemberList pagination
  sep('1. getMemberList — sdate=2023-01-01, edate=2027-12-31')
  const MSDATE = '2023-01-01'
  const MEDATE = '2027-12-31'

  let totalMembers = 0
  for (const page of [1, 2, 3]) {
    const cnt = await testMemberPage(page, MSDATE, MEDATE)
    totalMembers += cnt
  }
  console.log(`\n  → page 1+2+3 합산: ${totalMembers}명`)

  // 2. getOrderList pagination
  sep('2. getOrderList — sdate=2026-05-01, edate=2026-05-08')
  const OSDATE = '2026-05-01'
  const OEDATE = '2026-05-08'

  const results: Array<{ page: number; count: number; totalorder: unknown; totalpage: unknown }> = []
  for (const page of [1, 2, 3]) {
    const r = await testOrderPage(page, OSDATE, OEDATE)
    if (r) results.push({ page, ...r })
  }

  console.log('\n  ── 요약')
  results.forEach(r => {
    console.log(`  page=${r.page}  건수=${r.count}  totalorder=${r.totalorder}  totalpage=${r.totalpage}`)
  })

  const pages12Same =
    results.length >= 2 &&
    JSON.stringify(results[0]) === JSON.stringify(results[1])

  if (results.length >= 2) {
    console.log(`\n  page1 vs page2 동일 여부: ${pages12Same ? '⚠️ 동일 (페이지네이션 미작동)' : '✅ 다름 (페이지네이션 정상)'}`)
  }

  console.log('\n✅ 완료')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
