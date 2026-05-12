/**
 * testQ3Pagination.ts
 *
 * API 응답 형식: "{offset}/{end}<br>{JSON}"
 * JSON 파싱 전 prefix 제거 필요.
 *
 * Step 1 — page=1~5 pagination probe
 * Step 2 — 전체 pages 수집
 * Step 3 — orders 테이블 upsert
 */
import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios  from 'axios'
import qs     from 'qs'
import { pool } from '../config/database'
import { SERVICE_CODE_MAP } from '../services/shipmeyoService'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''

const SDATE     = '2023-09-07'
const EDATE     = '2023-09-30'
const PAGE_SIZE = 30

// ── Corrected API call ─────────────────────────────────────────
// API 응답: "{offset}/{end}<br>{JSON}"  → prefix 제거 후 JSON.parse
interface ApiResponse {
  status?:    string
  message?:   string
  orderinfo?: RawOrder[]
  totalorder?: string | number
  totalpage?:  string | number
}
interface BoxInfo {
  no:           string
  tracking:     string
  weight:       string
  codoptoin:    string
  codamount:    string
  codfundscode: string
  refno:        string
}
interface RawOrder {
  id:         string
  userid:     string
  service:    string
  orgprice:   string
  sellprice:  string
  createdate: string
  boxinfo:    BoxInfo[]
}

async function fetchPage(page: number): Promise<{ prefix: string; data: ApiResponse }> {
  const res = await axios.post<string>(
    `${BASE_URL}/getOrderlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, sdate: SDATE, edate: EDATE, page }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
      responseType: 'text',
    }
  )

  const body   = String(res.data).trim()
  const brIdx  = body.indexOf('<br>')
  const prefix = brIdx >= 0 ? body.slice(0, brIdx).trim() : ''
  const json   = brIdx >= 0 ? body.slice(brIdx + 4).trim() : body

  let parsed: ApiResponse = {}
  try { parsed = JSON.parse(json) as ApiResponse } catch {
    parsed = { status: 'parse_error', message: json.slice(0, 100) }
  }
  return { prefix, data: parsed }
}

function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10)
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  return raw.slice(0, 10)
}

function sep(title: string) {
  console.log('\n' + '═'.repeat(68))
  console.log(`  ${title}`)
  console.log('═'.repeat(68))
}

// ── Step 1: Pagination probe (pages 1-5) ──────────────────────
async function probePagination(): Promise<number> {
  sep(`Step 1 — Pagination probe  (${SDATE} ~ ${EDATE})`)
  console.log(`\n  ${'Page'.padEnd(6)} ${'Prefix'.padEnd(8)} ${'Count'.padEnd(6)} ${'Status'.padEnd(10)} ${'First ID'.padEnd(10)} ${'Last ID'.padEnd(10)} First userid`)
  console.log('  ' + '─'.repeat(80))

  let lastFirstId = ''
  let lastPage    = 1

  for (let page = 1; page <= 5; page++) {
    const { prefix, data } = await fetchPage(page)
    const orders  = Array.isArray(data.orderinfo) ? data.orderinfo : []
    const count   = orders.length
    const firstId = count > 0 ? orders[0].id  : '—'
    const lastId  = count > 0 ? orders[count - 1].id : '—'
    const userid  = count > 0 ? orders[0].userid : '—'
    const dupMark = (page > 1 && firstId === lastFirstId && firstId !== '—') ? ' ⟳ LAST' : ''

    console.log(
      `  ${String(page).padEnd(6)} ${prefix.padEnd(8)} ${String(count).padEnd(6)} ` +
      `${String(data.status ?? '—').padEnd(10)} ${String(firstId).padEnd(10)} ` +
      `${String(lastId).padEnd(10)} ${userid}${dupMark}`
    )

    if (count > 0 && count < PAGE_SIZE && page > 1) lastPage = page
    if (count > 0) lastFirstId = firstId
  }

  // Determine actual total pages: keep fetching until count < PAGE_SIZE or repeated
  // We already know from probe: page=2 is the last (count=9 < 30, or same first ID)
  return lastPage || 2
}

// ── Step 2: Collect all pages ─────────────────────────────────
interface FlatOrder {
  tracking_no:  string
  userid:       string
  service_code: string
  org_price:    string
  sell_price:   string
  order_date:   string
  cod_amount:   string
}

async function collectAllPages(): Promise<FlatOrder[]> {
  sep(`Step 2 — Collect all pages  (${SDATE} ~ ${EDATE})`)

  const seenOrderIds = new Set<string>()
  const seenTracking = new Set<string>()
  const flat:   FlatOrder[] = []
  const userids = new Set<string>()
  const dates   = new Set<string>()

  let page         = 1
  let prevFirstId  = ''

  while (true) {
    const { prefix, data } = await fetchPage(page)
    const orders = Array.isArray(data.orderinfo) ? data.orderinfo : []

    if (orders.length === 0 || data.status === 'fail') {
      console.log(`  page ${page}: no data — stopping`)
      break
    }

    const curFirstId = orders[0].id
    if (page > 1 && curFirstId === prevFirstId) {
      console.log(`  page ${page}: repeated first ID (${curFirstId}) — stopping (last page was ${page-1})`)
      break
    }
    prevFirstId = curFirstId

    let newPkg = 0
    for (const o of orders) {
      if (seenOrderIds.has(String(o.id))) continue
      seenOrderIds.add(String(o.id))

      const date  = normalizeDate(o.createdate)
      const boxes = Array.isArray(o.boxinfo) ? o.boxinfo : []
      dates.add(date)
      userids.add(o.userid)

      for (const box of boxes) {
        if (!box.tracking || seenTracking.has(box.tracking)) continue
        seenTracking.add(box.tracking)
        flat.push({
          tracking_no:  box.tracking,
          userid:       o.userid,
          service_code: o.service,
          org_price:    o.orgprice,
          sell_price:   o.sellprice,
          order_date:   date,
          cod_amount:   box.codamount || '0',
        })
        newPkg++
      }
    }

    console.log(`  page ${page}  prefix=${prefix.padEnd(8)} raw_orders=${String(orders.length).padStart(3)}  new_pkg=${String(newPkg).padStart(3)}  cumulative=${flat.length}`)

    if (orders.length < PAGE_SIZE) {
      console.log(`  → count ${orders.length} < ${PAGE_SIZE} — last page`)
      break
    }

    page++
  }

  const sortedDates = Array.from(dates).sort()
  console.log(`\n  ┌─ Collection summary ──────────────────────────────────`)
  console.log(`  │  Orders (unique)  : ${seenOrderIds.size}`)
  console.log(`  │  Packages (trk#)  : ${flat.length}`)
  console.log(`  │  Unique userids   : ${userids.size}`)
  console.log(`  │  Date range       : ${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}`)
  console.log(`  └───────────────────────────────────────────────────────`)

  return flat
}

// ── Step 3: Sync to DB ────────────────────────────────────────
async function syncToDB(orders: FlatOrder[]) {
  sep(`Step 3 — Sync to DB  (${orders.length} packages)`)

  const custResult = await pool.query('SELECT id, email, name FROM customers')
  const emailToCustomer = new Map<string, { id: string; name: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string }>).map(r => [
      r.email.trim().toLowerCase(),
      { id: r.id, name: r.name },
    ])
  )

  let created   = 0
  let updated   = 0
  let unmatched = 0
  const unmatchedEmails = new Set<string>()

  for (const o of orders) {
    const trackingNo    = o.tracking_no.trim()
    const userEmail     = o.userid.trim().toLowerCase()
    const upsCost       = parseFloat(o.org_price)  || 0
    const custCharge    = parseFloat(o.sell_price) || 0
    const codAmount     = parseFloat(o.cod_amount) || 0
    const serviceType   = SERVICE_CODE_MAP[o.service_code] ?? o.service_code
    const customer      = emailToCustomer.get(userEmail) ?? null
    const customerId    = customer?.id   ?? null
    const customerName  = customer?.name ?? userEmail

    if (!customerId) {
      unmatched++
      unmatchedEmails.add(userEmail)
    }

    const result = await pool.query(
      `INSERT INTO orders
         (id, tracking_no, date, customer_id, customer_email, customer_name,
          service_type, ups_cost, customer_charge, cod_amount, sales_person)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
          (SELECT sales_person FROM customers WHERE id = $3))
       ON CONFLICT (tracking_no) DO UPDATE SET
         date            = EXCLUDED.date,
         customer_id     = EXCLUDED.customer_id,
         customer_email  = EXCLUDED.customer_email,
         customer_name   = EXCLUDED.customer_name,
         service_type    = EXCLUDED.service_type,
         ups_cost        = EXCLUDED.ups_cost,
         customer_charge = EXCLUDED.customer_charge,
         cod_amount      = EXCLUDED.cod_amount,
         updated_at      = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [trackingNo, o.order_date, customerId, userEmail, customerName,
       serviceType, upsCost, custCharge, codAmount]
    )

    if (result.rows[0]?.inserted) created++
    else updated++
  }

  console.log(`\n  ┌─ Sync result ───────────────────────────────────────────`)
  console.log(`  │  synced    : ${orders.length}`)
  console.log(`  │  created   : ${created}`)
  console.log(`  │  updated   : ${updated}`)
  console.log(`  │  unmatched : ${unmatched}`)
  if (unmatchedEmails.size > 0) {
    console.log(`  │  unmatched emails:`)
    for (const e of Array.from(unmatchedEmails).sort()) {
      console.log(`  │    - ${e}`)
    }
  }
  console.log(`  └─────────────────────────────────────────────────────────`)

  const { rows } = await pool.query('SELECT COUNT(*) FROM orders')
  console.log(`\n  orders table total: ${rows[0].count} rows`)
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  if (!AUTH_KEY) throw new Error('SHIPHEYO_AUTH_KEY not set in .env')

  await probePagination()
  const orders = await collectAllPages()

  if (orders.length === 0) {
    console.log('\n  ⚠  No packages collected — skipping DB sync.')
    await pool.end()
    return
  }

  await syncToDB(orders)

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
