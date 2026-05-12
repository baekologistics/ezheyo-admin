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
  if (!Array.isArray(data.userinfo)) return []
  return (data.userinfo as Record<string, unknown>[]).map(m => ({
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function testQuarter(label: string, sdate: string, edate: string): Promise<Member[]> {
  const dBase = await post({ sdate, edate });          await sleep(300)
  const dPg1  = await post({ sdate, edate, page: 1 }); await sleep(300)
  const dPg2  = await post({ sdate, edate, page: 2 }); await sleep(300)

  const base = toMembers(dBase)
  const pg1  = toMembers(dPg1)
  const pg2  = toMembers(dPg2)

  let combined = merge(base, pg1)
  combined     = merge(combined, pg2)

  const tp = dBase.totalpage ?? dPg1.totalpage ?? '?'
  console.log(
    `  ${label}  base=${String(base.length).padStart(2)}` +
    `  pg1=${String(pg1.length).padStart(2)}` +
    `  pg2=${String(pg2.length).padStart(2)}` +
    `  combined=${String(combined.length).padStart(2)}` +
    `  totalpage=${tp}`
  )
  if (combined.length > 0) {
    combined.forEach(m =>
      console.log(`    - ${m.userid.padEnd(42)} ${m.ename}`)
    )
  }

  return combined
}

async function main() {
  if (!AUTH_KEY) { console.error('AUTH_KEY not set'); process.exit(1) }

  const quarters = [
    { label: 'Q  2023-09~12', sdate: '2023-09-07', edate: '2023-12-31' },
    { label: 'Q1 2024-01~03', sdate: '2024-01-01', edate: '2024-03-31' },
    { label: 'Q2 2024-04~06', sdate: '2024-04-01', edate: '2024-06-30' },
    { label: 'Q3 2024-07~09', sdate: '2024-07-01', edate: '2024-09-30' },
    { label: 'Q4 2024-10~12', sdate: '2024-10-01', edate: '2024-12-31' },
    { label: 'Q1 2025-01~03', sdate: '2025-01-01', edate: '2025-03-31' },
    { label: 'Q2 2025-04~06', sdate: '2025-04-01', edate: '2025-06-30' },
    { label: 'Q3 2025-07~09', sdate: '2025-07-01', edate: '2025-09-30' },
    { label: 'Q4 2025-10~12', sdate: '2025-10-01', edate: '2025-12-31' },
    { label: 'Q1 2026-01~03', sdate: '2026-01-01', edate: '2026-03-31' },
    { label: 'Q  2026-04~05', sdate: '2026-04-01', edate: '2026-05-11' },
  ]

  console.log('getMemberList — quarterly sweep\n')
  console.log('  Quarter          base  pg1  pg2  combined  totalpage')
  console.log('  ' + '─'.repeat(60))

  let all: Member[] = []

  for (const q of quarters) {
    const members = await testQuarter(q.label, q.sdate, q.edate)
    all = merge(all, members)
  }

  // ── Final ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65))
  console.log('  FINAL — all quarters combined (deduped)')
  console.log('═'.repeat(65))
  console.log(`  Total unique members: ${all.length}  (target: 83)\n`)

  all.sort((a, b) => a.ename.localeCompare(b.ename))

  console.log('  #    Email                                    Name')
  console.log('  ' + '─'.repeat(72))
  all.forEach((m, i) =>
    console.log(`  ${String(i + 1).padStart(2)}.  ${m.userid.padEnd(42)} ${m.ename}`)
  )

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
