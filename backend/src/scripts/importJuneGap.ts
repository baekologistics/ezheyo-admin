/**
 * importJuneGap.ts
 * Import missing June 2024 orders (06-20, 06-21) from XLS using regex parser.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

const FILE = '/Users/js/Downloads/종합현황(20240601_20240630).xls'
const TARGET_DATES = new Set(['2024-06-20', '2024-06-21'])

const SERVICE_MAP: Record<string, string> = {
  'ups ground': 'Ground', 'ground': 'Ground',
  'ups next day air early': 'Next Day Air Early', 'next day air early': 'Next Day Air Early',
  'ups next day air': 'Next Day Air', 'next day air': 'Next Day Air',
  'ups 2nd day air': '2nd Day Air', '2nd day air': '2nd Day Air',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/\D/g, '')
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}
function parsePrice(html: string): number {
  const m = stripHtml(html).replace(/[$,]/g, '').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}
function parseService(html: string): string {
  const t = stripHtml(html).toLowerCase()
  for (const [k, v] of Object.entries(SERVICE_MAP)) if (t.includes(k)) return v
  return 'Ground'
}
function parseTrackings(html: string): string[] {
  const nums: string[] = []
  const re = />(\s*1Z[0-9A-Z]+\s*)</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim()
    if (!nums.includes(t)) nums.push(t)
  }
  return nums
}
function parseRefNo(html: string): string {
  const noLinks = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
  const lines = noLinks.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').split('\n')
    .map(l => l.trim()).filter(Boolean)
  return lines.find(l => /^\d+$/.test(l)) ?? ''
}
function parseAddress(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim().replace(/^,\s*/, '').replace(/,\s*$/, '')
}

interface ParsedOrder {
  email: string; date: string; trackings: string[]; refNo: string; service: string
  charge: number; upsCost: number; cod: number; shipperAddr: string; receiverAddr: string
}

function parseFile(filePath: string): ParsedOrder[] {
  const html = fs.readFileSync(filePath, 'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const orders: ParsedOrder[] = []

  for (const chunk of chunks) {
    const tdMatches = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
    if (tdMatches.length < 9) continue
    const cells = tdMatches.map(td =>
      td.replace(/^<td[^>]*>/i, '').replace(/<\/td>\s*$/i, '')
    )
    const email = stripHtml(cells[1])
    if (!email || email === 'ID' || !email.includes('@')) continue
    const date = normalizeDate(stripHtml(cells[2]))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!TARGET_DATES.has(date)) continue
    const trackings = parseTrackings(cells[6])
    if (trackings.length === 0) continue
    orders.push({
      email, date, trackings,
      refNo:        parseRefNo(cells[6]),
      service:      parseService(cells[5]),
      charge:       parsePrice(cells[7]),
      upsCost:      parsePrice(cells[8]),
      cod:          cells[9] ? parsePrice(cells[9]) : 0,
      shipperAddr:  parseAddress(cells[3]),
      receiverAddr: parseAddress(cells[4]),
    })
  }
  return orders
}

async function main() {
  console.log('Parsing:', FILE)
  const orders = parseFile(FILE)

  const byDate: Record<string, number> = {}
  for (const o of orders) byDate[o.date] = (byDate[o.date] ?? 0) + 1
  console.log('XLS target-date rows:')
  Object.entries(byDate).sort().forEach(([d, n]) => console.log(`  ${d}: ${n}`))

  // Existing trackings
  const existResult = await pool.query(`
    SELECT tracking_no FROM orders
    UNION
    SELECT pkg->>'tracking_no' FROM orders, jsonb_array_elements(packages) AS pkg
    WHERE packages IS NOT NULL AND jsonb_typeof(packages) = 'array'`)
  const existingTrackings = new Set<string>(
    (existResult.rows as Array<{ tracking_no: string }>).map(r => r.tracking_no).filter(Boolean)
  )

  // Customer map
  const custResult = await pool.query('SELECT id, email, name, sales_person FROM customers')
  const emailMap = new Map<string, { id: string; name: string; salesPerson: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string; sales_person: string }>)
      .map(r => [r.email.trim().toLowerCase(), { id: r.id, name: r.name, salesPerson: r.sales_person ?? '' }])
  )

  let inserted = 0, skipped = 0
  for (const o of orders) {
    if (o.trackings.some(t => existingTrackings.has(t))) { skipped++; continue }
    const email    = o.email.trim().toLowerCase()
    const customer = emailMap.get(email) ?? null
    const packages = o.trackings.map((t, i) => ({
      tracking_no: t, weight: 0, width: 0, length: 0, height: 0,
      ref_no: i === 0 ? o.refNo : '', cod_amount: i === 0 ? o.cod : 0,
      shipper_name: '', shipper_addr: o.shipperAddr,
      receiver_name: '', receiver_addr: o.receiverAddr,
    }))
    await pool.query(
      `INSERT INTO orders (id, tracking_no, date, customer_id, customer_email, customer_name,
         service_type, ups_cost, customer_charge, cod_amount, sales_person,
         total_packages, packages, ref_no)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [o.trackings[0], o.date, customer?.id ?? null, email, customer?.name ?? email,
       o.service, o.upsCost, o.charge, o.cod, customer?.salesPerson ?? null,
       o.trackings.length, JSON.stringify(packages), o.refNo || null]
    )
    o.trackings.forEach(t => existingTrackings.add(t))
    inserted++
  }

  console.log(`\nInserted: ${inserted} | Skipped: ${skipped}`)

  // Final check
  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date IN ('2024-06-20','2024-06-21') GROUP BY date ORDER BY date`)
  console.log('\n날짜별 결과:')
  for (const r of res.rows as Array<{ date: string; cnt: string }>) {
    const d = r.date.slice(0,10)
    const target = d === '2024-06-20' ? 55 : 29
    console.log(`  ${d}: ${r.cnt} / ${target}`)
  }

  const total = await pool.query("SELECT COUNT(*) FROM orders WHERE date >= '2024-06-01' AND date <= '2024-06-30'")
  console.log(`\n6월 합계: ${total.rows[0].count} / 883`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
