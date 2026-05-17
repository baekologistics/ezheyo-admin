/**
 * diagnoseJan28.ts
 * Investigate why 2025-01-28 returned 0 from the API.
 * Test 1: sdate=2025-01-27 ~ edate=2025-01-29 (wide window)
 * Test 2: sdate=2025-01-28 ~ edate=2025-01-28 (exact day)
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''

async function orderPost(params: Record<string, unknown>): Promise<any> {
  const res = await axios.post<string>(
    `${BASE_URL}/getOrderlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000, responseType: 'text' }
  )
  const body = String(res.data).trim()
  const brIdx = body.indexOf('<br>')
  const json = brIdx >= 0 ? body.slice(brIdx + 4).trim() : body
  try { return JSON.parse(json) } catch { return { status: 'parse_error', raw: json.slice(0, 300) } }
}

function normDate(raw: string): string {
  if (!raw) return '?'
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : raw.slice(0, 10)
}

async function testWindow(sdate: string, edate: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`TEST: sdate=${sdate}  edate=${edate}`)
  console.log(`${'─'.repeat(60)}`)

  const counts: Record<string, number> = {}
  const samples: string[] = []
  let page = 1
  let prevFirstId = ''
  let totalOrders = 0

  while (true) {
    const data = await orderPost({ sdate, edate, page })
    const rows = Array.isArray(data.orderinfo) ? data.orderinfo : []

    if (rows.length === 0 || data.status === 'fail') {
      console.log(`  page ${page}: 0 rows — stop`)
      break
    }

    const curFirstId = String(rows[0].id ?? '')
    if (page > 1 && curFirstId === prevFirstId) {
      console.log(`  page ${page}: duplicate first ID — stop`)
      break
    }
    prevFirstId = curFirstId

    for (const o of rows) {
      const d = normDate(o.createdate ?? '')
      counts[d] = (counts[d] ?? 0) + 1
      if (samples.length < 3) samples.push(o.createdate ?? '(empty)')
      totalOrders++
    }

    console.log(`  page ${page}: ${rows.length} rows`)
    if (rows.length < 30) break
    page++
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n  Total orders returned: ${totalOrders}`)
  console.log(`  Date distribution:`)
  for (const [d, n] of Object.entries(counts).sort()) {
    console.log(`    ${d}: ${n}`)
  }
  if (samples.length > 0) {
    console.log(`  createdate raw samples:`)
    samples.forEach((s, i) => console.log(`    [${i+1}] "${s}"`))
  }
}

async function main() {
  if (!AUTH_KEY) { console.error('SHIPHEYO_AUTH_KEY not set'); process.exit(1) }

  // Test 1: wide window ±1 day
  await testWindow('2025-01-27', '2025-01-29')

  // Test 2: exact day
  await testWindow('2025-01-28', '2025-01-28')
}

main().catch(e => console.error('ERROR:', e.message))
