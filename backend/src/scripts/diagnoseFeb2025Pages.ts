/**
 * diagnoseFeb2025Pages.ts
 * Check pagination for 2025-02-11 and 2025-02-27
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

async function checkDate(date: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`DATE: ${date}`)
  console.log(`${'─'.repeat(60)}`)

  let total = 0
  let page = 1
  let prevFirstId = ''

  while (true) {
    const data = await orderPost({ sdate: date, edate: date, page })
    const rows = Array.isArray(data.orderinfo) ? data.orderinfo : []

    // Show header info on page 1
    if (page === 1) {
      const header = String(data._raw ?? '').slice(0, 50) // won't exist but harmless
      console.log(`  totalpage from status: ${data.totalpage ?? '(not in json)'}`)
      console.log(`  totalorder: ${data.totalorder ?? '(not in json)'}`)
      // The raw <br> prefix often has "offset/end<br>" — let's re-fetch raw
    }

    if (rows.length === 0 || data.status === 'fail') {
      console.log(`  page ${page}: 0 rows — stop`)
      break
    }

    const curFirstId = String(rows[0].id ?? '')
    if (page > 1 && curFirstId === prevFirstId) {
      console.log(`  page ${page}: duplicate first ID "${curFirstId}" — stop (server wrap)`)
      break
    }
    prevFirstId = curFirstId

    const ids = rows.map((r: any) => String(r.id)).filter(Boolean)
    const uniqueIds = new Set(ids)
    console.log(`  page ${page}: ${rows.length} rows | unique IDs: ${uniqueIds.size} | first ID: ${curFirstId}`)
    total += rows.length

    if (rows.length < 30) break
    page++
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`  → Total rows fetched: ${total}`)
}

// Re-fetch with raw text to see the prefix
async function checkDateRaw(date: string) {
  const res = await axios.post<string>(
    `${BASE_URL}/getOrderlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, sdate: date, edate: date, page: 1 }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000, responseType: 'text' }
  )
  const body = String(res.data).trim()
  const brIdx = body.indexOf('<br>')
  const prefix = brIdx >= 0 ? body.slice(0, brIdx) : '(no <br> found)'
  console.log(`  Raw prefix (before <br>): "${prefix}"`)
}

async function main() {
  if (!AUTH_KEY) { console.error('SHIPHEYO_AUTH_KEY not set'); process.exit(1) }

  for (const date of ['2025-02-11', '2025-02-27']) {
    await checkDateRaw(date)
    await checkDate(date)
  }
}

main().catch(e => console.error('ERROR:', e.message))
