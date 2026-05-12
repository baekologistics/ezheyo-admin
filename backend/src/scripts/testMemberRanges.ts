import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

interface Member { userid: string; ename: string }

async function post(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await axios.post(
    `${BASE_URL}/getmemberlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  )
  return res.data as Record<string, unknown>
}

function toMembers(data: Record<string, unknown>): Member[] {
  const list = data.userinfo
  if (!Array.isArray(list)) return []
  return (list as Record<string, unknown>[]).map(m => ({
    userid: String(m.userid ?? '').toLowerCase().trim(),
    ename:  String(m.ename  ?? '').trim(),
  }))
}

function merge(a: Member[], b: Member[]): Member[] {
  const seen = new Set(a.map(m => m.userid))
  const out  = [...a]
  for (const m of b) {
    if (!seen.has(m.userid)) { seen.add(m.userid); out.push(m) }
  }
  return out
}

function sep(t: string) {
  console.log('\n' + '═'.repeat(65))
  console.log(`  ${t}`)
  console.log('═'.repeat(65))
}

async function testRange(label: string, sdate: string, edate: string): Promise<Member[]> {
  sep(label)

  // baseline (no page param)
  const dBase = await post({ sdate, edate })
  const base  = toMembers(dBase)
  console.log(`  baseline (no page) : ${base.length} members  totalpage=${dBase.totalpage ?? '?'}`)

  // page=1
  const dPage = await post({ sdate, edate, page: 1 })
  const pg1   = toMembers(dPage)
  console.log(`  page=1             : ${pg1.length} members  totalpage=${dPage.totalpage ?? '?'}  resp.page=${dPage.page ?? '?'}`)

  // merge
  const combined = merge(base, pg1)
  console.log(`  combined (deduped) : ${combined.length} members`)

  console.log('\n  Email / Name:')
  combined.forEach((m, i) =>
    console.log(`    ${String(i + 1).padStart(2)}. ${m.userid.padEnd(40)} ${m.ename}`)
  )

  return combined
}

async function main() {
  if (!AUTH_KEY) { console.error('AUTH_KEY not set'); process.exit(1) }

  const ranges: { label: string; sdate: string; edate: string }[] = [
    { label: 'Range 1 — 2023-09-01 ~ 2024-02-28', sdate: '2023-09-01', edate: '2024-02-28' },
    { label: 'Range 2 — 2024-03-01 ~ 2025-05-31', sdate: '2024-03-01', edate: '2025-05-31' },
    { label: 'Range 3 — 2025-06-01 ~ 2026-04-26', sdate: '2025-06-01', edate: '2026-04-26' },
  ]

  const allMembers: Member[][] = []
  for (const r of ranges) {
    const members = await testRange(r.label, r.sdate, r.edate)
    allMembers.push(members)
  }

  // ── Final combined ──────────────────────────────────────────
  sep('FINAL — All 3 ranges combined (deduped)')

  let total: Member[] = []
  for (const m of allMembers) total = merge(total, m)

  total.sort((a, b) => a.ename.localeCompare(b.ename))

  console.log(`  Total unique members : ${total.length}  (target: 83)`)
  console.log('\n  #    Email                                    Name')
  console.log('  ' + '─'.repeat(70))
  total.forEach((m, i) =>
    console.log(`  ${String(i + 1).padStart(2)}.  ${m.userid.padEnd(40)} ${m.ename}`)
  )

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
