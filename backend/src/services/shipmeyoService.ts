import axios from 'axios'
import qs from 'qs'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''

export const SERVICE_CODE_MAP: Record<string, string> = {
  '03': 'Ground',
  '01': 'Next Day Air',
  '02': '2nd Day Air',
  '14': 'Next Day Air Early',
}

// ── Helpers ───────────────────────────────────────────────────

async function formPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  if (!AUTH_KEY) throw new Error('SHIPHEYO_AUTH_KEY is not set')
  const res = await axios.post<T>(
    `${BASE_URL}${path}`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  )
  return res.data
}

// getOrderlist.asp prepends "{offset}/{end}<br>" before JSON — must strip it.
interface OrderApiResponse {
  status?:    string
  message?:   string
  orderinfo?: ShipheyoRawOrder[]
}

async function orderPost(params: Record<string, unknown>): Promise<OrderApiResponse> {
  if (!AUTH_KEY) throw new Error('SHIPHEYO_AUTH_KEY is not set')
  const res = await axios.post<string>(
    `${BASE_URL}/getOrderlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    {
      headers:      { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout:      30000,
      responseType: 'text',
    }
  )
  const body  = String(res.data).trim()
  const brIdx = body.indexOf('<br>')
  const json  = brIdx >= 0 ? body.slice(brIdx + 4).trim() : body
  try {
    return JSON.parse(json) as OrderApiResponse
  } catch {
    return { status: 'parse_error', message: json.slice(0, 200) }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── getMemberList ─────────────────────────────────────────────

export interface ShipheyoMember {
  userid:        string
  ename:         string
  email:         string
  mobile:        string
  createdate:    string   // e.g. "2026-05-14 오전 1:06:43"
  'marginrate ': string
  payment:       string
}

/** Parse SHIPHEYO Korean AM/PM date → YYYY-MM-DD (date only) */
export function parseShipheyoDate(raw: string): string | null {
  const m = raw?.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export async function getMemberList(): Promise<ShipheyoMember[]> {
  const res = await formPost<{ userinfo: ShipheyoMember[] }>('/getmemberlist.asp', {})
  if (!Array.isArray(res.userinfo))
    throw new Error(`getMemberList: expected userinfo array — got: ${JSON.stringify(res).slice(0, 300)}`)
  return res.userinfo
}

// ── Raw API types ─────────────────────────────────────────────

export interface ShipheyoBoxInfo {
  no:           string
  tracking:     string
  weight:       string
  widthwise:    string
  lengthwise:   string
  heightwise:   string
  boxvalue:     string
  refno:        string
  codoptoin:    string
  codamount:    string
  codfundscode: string
}

export interface ShipheyoRawOrder {
  id:               string
  userid:           string
  createdate:       string
  service:          string
  orgprice:         string
  sellprice:        string
  sender_ename:     string
  sender_address:   string
  sender_address2:  string
  sender_city:      string
  sender_state:     string
  sender_zipcode:   string
  receiver_name:    string
  receiver_contact: string
  receiver_address: string
  receiver_address2: string
  receiver_city:    string
  receiver_state:   string
  receiver_zipcode: string
  boxinfo:          ShipheyoBoxInfo[]
}

// ── Output types (one record per ORDER) ──────────────────────

export interface ShipheyoPackage {
  tracking_no:   string
  weight:        number
  width:         number
  length:        number
  height:        number
  ref_no:        string
  cod_amount:    number
  shipper_name:  string
  shipper_addr:  string
  receiver_name: string
  receiver_addr: string
}

export interface ShipheyoOrder {
  shipheyo_order_id: string
  userid:            string
  service_code:      string
  org_price:         string
  sell_price:        string
  order_date:        string   // YYYY-MM-DD
  tracking_no:       string   // first valid package
  cod_amount:        number   // sum across all packages
  total_packages:    number   // count of real packages
  ref_no:            string   // from first package
  packages:          ShipheyoPackage[]
}

export interface WindowProgress {
  window:  string
  page:    number
  count:   number  // raw orders on this page
  added:   number  // new unique orders added
  total:   number  // cumulative orders so far
  // kept for callers that reference them
  page1: number; page2: number; totalorder: number; totalpage: number
}

// ── getAllOrders ──────────────────────────────────────────────
// Returns ONE record per ORDER (not per tracking).
// Pagination: page=1, 2, 3… sequential, 300 ms delay.
// Stop: same first-order-ID as previous page (server wrap), or 0 orders returned.

const PAGE_SIZE  = 30
const PAGE_DELAY = 300

export async function getAllOrders(
  startDate?: string,
  endDate?:   string,
  onProgress?: (info: WindowProgress) => void
): Promise<ShipheyoOrder[]> {
  const seenOrderIds = new Set<string>()
  const results: ShipheyoOrder[] = []

  const params: Record<string, unknown> = {}
  if (startDate) params.sdate = startDate
  if (endDate)   params.edate = endDate

  let page        = 1
  let prevFirstId = ''

  while (true) {
    const data   = await orderPost({ ...params, page })
    const rawOrders = Array.isArray(data.orderinfo) ? data.orderinfo : []

    if (rawOrders.length === 0 || data.status === 'fail') break

    const curFirstId = String(rawOrders[0].id ?? '')
    if (page > 1 && curFirstId === prevFirstId) break
    prevFirstId = curFirstId

    let added = 0
    for (const o of rawOrders) {
      const oid = String(o.id ?? '')
      if (!oid || seenOrderIds.has(oid)) continue
      seenOrderIds.add(oid)

      const boxes   = Array.isArray(o.boxinfo) ? o.boxinfo : []
      const shipper = buildAddr(o.sender_ename, o.sender_address, o.sender_address2, o.sender_city, o.sender_state, o.sender_zipcode)
      const recvr   = buildAddr(o.receiver_name, o.receiver_address, o.receiver_address2, o.receiver_city, o.receiver_state, o.receiver_zipcode)

      // Only boxes with real tracking numbers
      const validBoxes = boxes.filter(b => b.tracking && b.tracking.trim() !== '')

      if (validBoxes.length === 0) continue   // order with no tracking — skip

      const packages: ShipheyoPackage[] = validBoxes.map(b => ({
        tracking_no:   b.tracking.trim(),
        weight:        parseFloat(b.weight)    || 0,
        width:         parseFloat(b.widthwise) || 0,
        length:        parseFloat(b.lengthwise)|| 0,
        height:        parseFloat(b.heightwise)|| 0,
        ref_no:        b.refno?.trim()   ?? '',
        cod_amount:    parseFloat(b.codamount) || 0,
        shipper_name:  o.sender_ename   ?? '',
        shipper_addr:  shipper,
        receiver_name: o.receiver_name  ?? '',
        receiver_addr: recvr,
      }))

      const codTotal = packages.reduce((s, p) => s + p.cod_amount, 0)

      results.push({
        shipheyo_order_id: oid,
        userid:            o.userid,
        service_code:      o.service,
        org_price:         o.orgprice,
        sell_price:        o.sellprice,
        order_date:        normalizeDate(o.createdate),
        tracking_no:       packages[0].tracking_no,
        cod_amount:        codTotal,
        total_packages:    packages.length,
        ref_no:            packages[0].ref_no,
        packages,
      })
      added++
    }

    onProgress?.({
      window:     `${startDate ?? ''}~${endDate ?? ''}`,
      page,
      count:      rawOrders.length,
      added,
      total:      results.length,
      page1: rawOrders.length, page2: 0, totalorder: 0, totalpage: 0,
    })

    if (rawOrders.length < PAGE_SIZE) break
    page++
    await sleep(PAGE_DELAY)
  }

  return results
}

// ── Utilities ─────────────────────────────────────────────────

function buildAddr(...parts: string[]): string {
  return parts.map(p => p?.trim()).filter(Boolean).join(', ')
}

export function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10)
  if (/^\d{8}$/.test(raw))
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : raw.slice(0, 10)
}
