/**
 * importExcel.ts
 * Import SHIPHEYO Excel (HTML) order files into the orders DB.
 *
 * Usage:
 *   npx ts-node src/scripts/importExcel.ts /path/to/file.xls
 */

import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'node-html-parser'
import { pool } from '../config/database'

// ── Service name map ──────────────────────────────────────────
const SERVICE_MAP: Record<string, string> = {
  'ups ground':             'Ground',
  'ground':                 'Ground',
  'ups next day air early': 'Next Day Air Early',
  'ups next day air':       'Next Day Air',
  'next day air early':     'Next Day Air Early',
  'next day air':           'Next Day Air',
  'ups 2nd day air':        '2nd Day Air',
  '2nd day air':            '2nd Day Air',
}

// ── Helpers ───────────────────────────────────────────────────
function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/\D/g, '')        // strip non-digits
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePrice(html: string): number {
  const t = cellText(html).replace(/[$,]/g, '').trim()
  const m = t.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

function parseService(html: string): string {
  const t = cellText(html).toLowerCase()
  for (const [key, val] of Object.entries(SERVICE_MAP)) {
    if (t.includes(key)) return val
  }
  return 'Ground'
}

/** Extract tracking numbers from <a> tag inner text only (1Z... strings) */
function parseTrackings(tdNode: import('node-html-parser').HTMLElement): string[] {
  const nums: string[] = []
  for (const a of tdNode.querySelectorAll('a')) {
    const t = a.text.trim()
    if (t.startsWith('1Z') && !nums.includes(t)) nums.push(t)
  }
  return nums
}

/** Extract ref# from TD: numeric-only text lines outside of <a> tags */
function parseRefNo(tdNode: import('node-html-parser').HTMLElement): string {
  // Remove all <a> tags and get remaining text lines
  const clone = tdNode.innerHTML
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')   // remove anchor content
    .replace(/<[^>]+>/g, ' ')                     // strip other tags
    .replace(/&nbsp;/g, ' ')
  const lines = clone.split(/[\n\r<>]+/).map(l => l.trim()).filter(Boolean)
  // Keep lines that are purely numeric (ref numbers)
  const refs = lines.filter(l => /^\d+$/.test(l))
  return refs[0] ?? ''                             // use first ref if multiple
}

function parseAddress(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
}

// ── Parsed row ────────────────────────────────────────────────
interface ParsedOrder {
  email:        string
  date:         string
  trackings:    string[]
  refNo:        string
  service:      string
  charge:       number
  upsCost:      number
  cod:          number
  shipperAddr:  string
  receiverAddr: string
}

// ── Main parser ───────────────────────────────────────────────
function parseFile(filePath: string): ParsedOrder[] {
  const html  = fs.readFileSync(filePath, 'utf8')
  const root  = parse(html)
  const rows  = root.querySelectorAll('tr')
  const orders: ParsedOrder[] = []

  for (const row of rows) {
    const tds = row.querySelectorAll('td')
    if (tds.length < 9) continue                      // skip header / short rows

    const email = cellText(tds[1].innerHTML)
    if (!email || email === 'ID' || !email.includes('@')) continue

    const date = normalizeDate(cellText(tds[2].innerHTML))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const trackings = parseTrackings(tds[6])
    if (trackings.length === 0) continue              // no valid tracking → skip

    const refNo        = parseRefNo(tds[6])
    const service      = parseService(tds[5].innerHTML)
    const charge       = parsePrice(tds[7].innerHTML)
    const upsCost      = parsePrice(tds[8].innerHTML)
    const cod          = tds[9] ? parsePrice(tds[9].innerHTML) : 0
    const shipperAddr  = parseAddress(tds[3].innerHTML)
    const receiverAddr = parseAddress(tds[4].innerHTML)

    orders.push({ email, date, trackings, refNo, service, charge, upsCost, cod, shipperAddr, receiverAddr })
  }

  return orders
}

// ── DB import ─────────────────────────────────────────────────
async function importOrders(orders: ParsedOrder[], filePath: string) {
  // Load existing tracking_nos (from tracking_no column + packages JSONB)
  const existResult = await pool.query(
    `SELECT tracking_no FROM orders
     UNION
     SELECT pkg->>'tracking_no' FROM orders, jsonb_array_elements(packages) AS pkg
     WHERE packages IS NOT NULL AND jsonb_typeof(packages) = 'array'`
  )
  const existingTrackings = new Set<string>(
    (existResult.rows as Array<{ tracking_no: string }>).map(r => r.tracking_no).filter(Boolean)
  )

  // Load customer email → { id, name, sales_person }
  const custResult = await pool.query('SELECT id, email, name, sales_person FROM customers')
  const emailMap = new Map<string, { id: string; name: string; salesPerson: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string; sales_person: string }>)
      .map(r => [
        r.email.trim().toLowerCase(),
        { id: r.id, name: r.name, salesPerson: r.sales_person ?? '' }
      ])
  )

  let inserted = 0, skipped = 0, unmatched = 0
  const unmatchedEmails = new Set<string>()

  for (const o of orders) {
    // Skip if ANY tracking already in DB
    const alreadyExists = o.trackings.some(t => existingTrackings.has(t))
    if (alreadyExists) { skipped++; continue }

    const email    = o.email.trim().toLowerCase()
    const customer = emailMap.get(email) ?? null
    if (!customer) { unmatched++; unmatchedEmails.add(email) }

    const firstTracking = o.trackings[0]

    // Build packages JSONB — ref_no on first package
    const packages = o.trackings.map((t, i) => ({
      tracking_no:   t,
      weight:        0,
      width:         0,
      length:        0,
      height:        0,
      ref_no:        i === 0 ? o.refNo : '',
      cod_amount:    i === 0 ? o.cod   : 0,
      shipper_name:  '',
      shipper_addr:  o.shipperAddr,
      receiver_name: '',
      receiver_addr: o.receiverAddr,
    }))

    await pool.query(
      `INSERT INTO orders
         (id, tracking_no, date, customer_id, customer_email, customer_name,
          service_type, ups_cost, customer_charge, cod_amount, sales_person,
          total_packages, packages, ref_no)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12::jsonb, $13)`,
      [
        firstTracking,
        o.date,
        customer?.id          ?? null,
        email,
        customer?.name        ?? email,
        o.service,
        o.upsCost,
        o.charge,
        o.cod,
        customer?.salesPerson ?? null,
        o.trackings.length,
        JSON.stringify(packages),
        o.refNo || null,
      ]
    )

    // Mark all trackings as existing to avoid intra-file dupes
    o.trackings.forEach(t => existingTrackings.add(t))
    inserted++
  }

  // Final DB count
  const totalResult = await pool.query('SELECT COUNT(*) FROM orders')
  const total = parseInt(totalResult.rows[0].count)

  console.log('')
  console.log('=== Import Result ===')
  console.log('File:      ', path.basename(filePath))
  console.log('Parsed:    ', orders.length)
  console.log('Inserted:  ', inserted)
  console.log('Skipped:   ', skipped, '(already in DB)')
  console.log('Unmatched: ', unmatched, '(no customer match)')
  if (unmatchedEmails.size) {
    console.log('Unmatched emails:')
    unmatchedEmails.forEach(e => console.log('  -', e))
  }
  console.log('DB total:  ', total, 'orders')
}

// ── Entry point ───────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx ts-node src/scripts/importExcel.ts /path/to/file.xls')
    process.exit(1)
  }
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath)
    process.exit(1)
  }

  console.log('Parsing:', filePath)
  const orders = parseFile(filePath)
  console.log('Parsed rows:', orders.length)

  if (orders.length === 0) {
    console.log('No valid rows found.')
    return
  }

  // Sample preview
  console.log('Sample (first 3):')
  orders.slice(0, 3).forEach((o, i) =>
    console.log(`  [${i+1}] ${o.date} | ${o.email} | ${o.trackings[0]}${o.trackings.length > 1 ? ` (+${o.trackings.length-1} more)` : ''} | ref:${o.refNo||'—'} | $${o.charge} / $${o.upsCost} | COD $${o.cod}`)
  )
  console.log('')

  await importOrders(orders, filePath)
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exit(1) })
  .finally(() => pool.end())
