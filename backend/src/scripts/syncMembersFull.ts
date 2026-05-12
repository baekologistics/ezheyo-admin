import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs    from 'qs'
import { pool } from '../config/database'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

// Note: API returns "craetedate" (typo) not "createdate"
interface RawMember {
  userid:       string
  ename:        string
  mobile:       string
  'marginrate ': string  // trailing space matches actual API field
  payment:      string
  craetedate:   string   // API typo: "craetedate" (not "createdate")
  createdate?:  string   // fallback in case API fixes the typo later
}

interface Member {
  email:        string
  name:         string
  phone:        string
  marginRate:   number
  paymentType:  string
  createdDate:  string | null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchMembers(params: Record<string, unknown>): Promise<RawMember[]> {
  const res = await axios.post(
    `${BASE_URL}/getmemberlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  )
  const data = res.data as Record<string, unknown>
  return Array.isArray(data.userinfo) ? (data.userinfo as RawMember[]) : []
}

// Handles: "2024-01-15 오전 9:00:00", "2024-01-15", etc.
function normalizeDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function toMember(r: RawMember): Member {
  // Try "craetedate" first (API typo), fall back to "createdate" in case it's ever fixed
  const rawDate = r.craetedate ?? r.createdate ?? ''
  return {
    email:       r.userid.trim().toLowerCase(),
    name:        r.ename.trim(),
    phone:       (r.mobile ?? '').trim(),
    marginRate:  parseFloat(r['marginrate '] ?? '0') || 0,
    paymentType: r.payment === 'Monthly' ? 'Monthly' : 'Prepay',
    createdDate: normalizeDate(rawDate),
  }
}

function mergeRaw(a: RawMember[], b: RawMember[]): RawMember[] {
  const seen = new Set(a.map(m => m.userid.toLowerCase().trim()))
  return [...a, ...b.filter(m => !seen.has(m.userid.toLowerCase().trim()))]
}

async function upsertMember(m: Member): Promise<'inserted' | 'updated'> {
  const result = await pool.query(
    `INSERT INTO customers
       (id, shipheyo_userid, name, email, phone, margin_rate, payment_type, created_date, last_synced_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (shipheyo_userid) DO UPDATE SET
       name           = EXCLUDED.name,
       email          = EXCLUDED.email,
       phone          = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone),
       margin_rate    = EXCLUDED.margin_rate,
       payment_type   = EXCLUDED.payment_type,
       created_date   = COALESCE(EXCLUDED.created_date, customers.created_date),
       last_synced_at = NOW(),
       updated_at     = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [m.email, m.name, m.email, m.phone, m.marginRate, m.paymentType, m.createdDate]
  )
  return result.rows[0]?.inserted ? 'inserted' : 'updated'
}

function sep(t: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${t}`)
  console.log('═'.repeat(60))
}

async function syncQuarter(label: string, sdate: string, edate: string) {
  const base = await fetchMembers({ sdate, edate });              await sleep(300)
  const pg1  = await fetchMembers({ sdate, edate, page: 1 });    await sleep(300)

  const merged  = mergeRaw(base, pg1)
  const members = merged.map(toMember)

  let inserted = 0, updated = 0, failed = 0
  let datesFound = 0

  for (const m of members) {
    if (!m.email) { failed++; continue }
    if (m.createdDate) datesFound++
    try {
      const action = await upsertMember(m)
      if (action === 'inserted') inserted++
      else                       updated++
    } catch (err) {
      failed++
      console.log(`    ✗ ${m.email} — ${(err as Error).message}`)
    }
  }

  console.log(
    `  ${label}  ` +
    `base=${String(base.length).padStart(2)}  pg1=${String(pg1.length).padStart(2)}  ` +
    `merged=${String(members.length).padStart(2)}  ` +
    `dates=${String(datesFound).padStart(2)}  ` +
    `inserted=${inserted}  updated=${updated}  failed=${failed}`
  )
}

async function main() {
  if (!AUTH_KEY) { console.error('AUTH_KEY not set'); process.exit(1) }

  sep('Step 1 — Quarterly getMemberList sync (with craetedate)')
  console.log('  Quarter           base  pg1  merged  dates  inserted  updated  failed')
  console.log('  ' + '─'.repeat(68))

  const quarters = [
    { label: '   2023-09~12', sdate: '2023-09-07', edate: '2023-12-31' },
    { label: 'Q1 2024-01~03', sdate: '2024-01-01', edate: '2024-03-31' },
    { label: 'Q2 2024-04~06', sdate: '2024-04-01', edate: '2024-06-30' },
    { label: 'Q3 2024-07~09', sdate: '2024-07-01', edate: '2024-09-30' },
    { label: 'Q4 2024-10~12', sdate: '2024-10-01', edate: '2024-12-31' },
    { label: 'Q1 2025-01~03', sdate: '2025-01-01', edate: '2025-03-31' },
    { label: 'Q2 2025-04~06', sdate: '2025-04-01', edate: '2025-06-30' },
    { label: 'Q3 2025-07~09', sdate: '2025-07-01', edate: '2025-09-30' },
    { label: 'Q4 2025-10~12', sdate: '2025-10-01', edate: '2025-12-31' },
    { label: 'Q1 2026-01~03', sdate: '2026-01-01', edate: '2026-03-31' },
    { label: '   2026-04~05', sdate: '2026-04-01', edate: '2026-05-11' },
  ]

  for (const q of quarters) {
    await syncQuarter(q.label, q.sdate, q.edate)
  }

  // ── Step 2: Final verification ──────────────────────────────
  sep('Step 2 — Final DB count & created_date coverage')

  const cnt = await pool.query('SELECT COUNT(*) FROM customers')
  const withDate = await pool.query('SELECT COUNT(*) FROM customers WHERE created_date IS NOT NULL')
  const nullDate = await pool.query('SELECT COUNT(*) FROM customers WHERE created_date IS NULL')
  console.log(`  Total: ${cnt.rows[0].count}  |  has created_date: ${withDate.rows[0].count}  |  null: ${nullDate.rows[0].count}`)

  const top20 = await pool.query(`
    SELECT email, name, created_date
    FROM customers
    ORDER BY created_date ASC NULLS LAST
    LIMIT 20
  `)
  console.log(`\n  ${'created_date'.padEnd(13)} ${'email'.padEnd(42)} name`)
  console.log('  ' + '─'.repeat(90))
  top20.rows.forEach((r: Record<string, unknown>) => {
    const dt = r.created_date ? String(r.created_date).slice(0, 10) : '(null)     '
    console.log(`  ${dt.padEnd(13)} ${String(r.email).padEnd(42)} ${r.name}`)
  })

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
