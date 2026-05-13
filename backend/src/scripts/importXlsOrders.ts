import * as fs from 'fs'
import { pool } from '../config/database'

const XLS_PATH = '/Users/js/Downloads/종합현황(20240201_20240331).xls'

const SERVICE_MAP: Record<string, string> = {
  'ups ground':        'Ground',
  'ground':            'Ground',
  'ups next day air':  'Next Day Air',
  'next day air':      'Next Day Air',
  'ups 2nd day air':   '2nd Day Air',
  '2nd day air':       '2nd Day Air',
}

function normalizeDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = s.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : s
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractCellText(html: string): string {
  return stripHtml(html)
}

function extractTracking(html: string): string {
  // Extract from UPS track URL or anchor text
  const urlMatch = html.match(/trackNums=([0-9A-Z]+)/)
  if (urlMatch) return urlMatch[1].trim()
  const textMatch = html.match(/>(1Z[0-9A-Z]+)</)
  if (textMatch) return textMatch[1].trim()
  return stripHtml(html).replace(/\s+/g, '')
}

function extractPrice(html: string): number {
  const m = stripHtml(html).replace(/[$,]/g, '').trim().match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

function extractService(html: string): string {
  const text = stripHtml(html).toLowerCase()
  for (const [key, val] of Object.entries(SERVICE_MAP)) {
    if (text.includes(key)) return val
  }
  return 'Ground'
}

interface ParsedRow {
  userid:    string
  date:      string
  tracking:  string
  service:   string
  charge:    number
  upsCost:   number
  cod:       number
}

function parseXls(filePath: string): ParsedRow[] {
  const html = fs.readFileSync(filePath, 'utf8')

  // File has no </tr> tags — split on <tr> to get row chunks
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)  // skip content before first <tr>

  const rows: ParsedRow[] = []

  for (const chunk of chunks) {
    // Extract all <td>…</td> blocks (TDs do have proper closing tags)
    const tdMatches = chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
    if (tdMatches.length < 9) continue

    const cells = tdMatches.map(td =>
      td.replace(/^<td[^>]*>/i, '').replace(/<\/td>\s*$/i, '')
    )

    const userid   = extractCellText(cells[1])
    const dateRaw  = extractCellText(cells[2])
    const tracking = extractTracking(cells[6])
    const service  = extractService(cells[5])
    const charge   = extractPrice(cells[7])
    const upsCost  = extractPrice(cells[8])
    const cod      = extractPrice(cells[9])

    if (!userid || userid === 'ID') continue
    if (!tracking || !tracking.startsWith('1Z')) continue

    const date = normalizeDate(dateRaw)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    rows.push({ userid, date, tracking, service, charge, upsCost, cod })
  }

  return rows
}

async function main() {
  console.log('Parsing:', XLS_PATH)
  const rows = parseXls(XLS_PATH)
  console.log('Parsed rows:', rows.length)

  if (rows.length === 0) {
    console.log('No rows to import.')
    return
  }

  // Show sample
  console.log('Sample:', JSON.stringify(rows.slice(0, 3), null, 2))

  // Load customer email map
  const custResult = await pool.query('SELECT id, email, name, sales_person FROM customers')
  const emailMap = new Map<string, { id: string; name: string; salesPerson: string }>(
    (custResult.rows as Array<{ id: string; email: string; name: string; sales_person: string }>)
      .map(r => [r.email.trim().toLowerCase(), { id: r.id, name: r.name, salesPerson: r.sales_person ?? '' }])
  )

  // Get existing tracking_nos to skip duplicates
  const existResult = await pool.query('SELECT tracking_no FROM orders')
  const existingTracking = new Set<string>(
    (existResult.rows as Array<{ tracking_no: string }>).map(r => r.tracking_no)
  )

  let inserted = 0, skipped = 0, unmatched = 0
  const unmatchedEmails = new Set<string>()

  for (const row of rows) {
    // Skip if tracking already in DB
    if (existingTracking.has(row.tracking)) {
      skipped++
      continue
    }

    const email    = row.userid.trim().toLowerCase()
    const customer = emailMap.get(email) ?? null

    if (!customer) {
      unmatched++
      unmatchedEmails.add(email)
    }

    await pool.query(
      `INSERT INTO orders
         (id, tracking_no, date, customer_id, customer_email, customer_name,
          service_type, ups_cost, customer_charge, cod_amount, sales_person,
          total_packages, packages, ref_no)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          1, '[]'::jsonb, NULL)`,
      [
        row.tracking,
        row.date,
        customer?.id   ?? null,
        email,
        customer?.name ?? email,
        row.service,
        row.upsCost,
        row.charge,
        row.cod,
        customer?.salesPerson ?? null,
      ]
    )
    existingTracking.add(row.tracking)   // prevent dupe within this file
    inserted++
  }

  const total = await pool.query('SELECT COUNT(*) FROM orders')
  console.log('')
  console.log('=== Import Result ===')
  console.log('Parsed:    ', rows.length)
  console.log('Inserted:  ', inserted)
  console.log('Skipped:   ', skipped, '(already in DB)')
  console.log('Unmatched: ', unmatched, '(no customer match)')
  if (unmatchedEmails.size) console.log('Unmatched emails:', [...unmatchedEmails].join(', '))
  console.log('DB total orders:', total.rows[0].count)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
