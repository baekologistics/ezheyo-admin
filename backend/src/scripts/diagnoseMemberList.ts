import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'
import { pool } from '../config/database'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

function sep(t: string) {
  console.log('\n' + '═'.repeat(65))
  console.log(`  ${t}`)
  console.log('═'.repeat(65))
}

async function post(endpoint: string, extra: Record<string, unknown> = {}) {
  const res = await axios.post(
    `${BASE_URL}${endpoint}`,
    qs.stringify({ authkey: AUTH_KEY, ...extra }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  )
  return res.data as Record<string, unknown>
}

async function main() {
  // ── 1. Baseline call ────────────────────────────────────────
  sep('1. Baseline getMemberList — full response structure')
  const baseline = await post('/getmemberlist.asp')
  console.log('Top-level keys:', Object.keys(baseline).join(', '))

  const members = (baseline.userinfo as Record<string, unknown>[]) ?? []
  console.log(`\ntotalcount  : ${baseline.totalcount ?? '(none)'}`)
  console.log(`totalpage   : ${baseline.totalpage  ?? '(none)'}`)
  console.log(`page        : ${baseline.page       ?? '(none)'}`)
  console.log(`status      : ${baseline.status     ?? '(none)'}`)
  console.log(`Total members in userinfo[]: ${members.length}`)

  console.log('\nFirst 3 members (all fields):')
  members.slice(0, 3).forEach((m, i) => {
    console.log(`\n  [${i}] keys: ${Object.keys(m).join(', ')}`)
    Object.entries(m).forEach(([k, v]) => {
      console.log(`       ${k.padEnd(16)}: ${v}`)
    })
  })

  // ── 2. Pagination tests ─────────────────────────────────────
  sep('2. Pagination tests')
  const pagingVariants: { label: string; params: Record<string, unknown> }[] = [
    { label: 'page=1',        params: { page: 1 } },
    { label: 'page=2',        params: { page: 2 } },
    { label: 'page=3',        params: { page: 3 } },
    { label: 'pagenum=1',     params: { pagenum: 1 } },
    { label: 'pagenum=2',     params: { pagenum: 2 } },
    { label: 'currentpage=2', params: { currentpage: 2 } },
  ]
  const baseIds = members.map(m => String(m.userid))

  for (const { label, params } of pagingVariants) {
    try {
      const r    = await post('/getmemberlist.asp', params)
      const list = (r.userinfo as Record<string, unknown>[]) ?? []
      const ids  = list.map(m => String(m.userid))
      const overlap = ids.filter(id => baseIds.includes(id)).length
      console.log(
        `  ${label.padEnd(18)}: count=${String(list.length).padStart(3)}` +
        `  overlap=${overlap}/${list.length}` +
        `  status=${r.status ?? 'ok'}` +
        `  totalcount=${r.totalcount ?? '?'}`
      )
    } catch (err) {
      console.log(`  ${label.padEnd(18)}: ERROR — ${(err as Error).message}`)
    }
  }

  // ── 3. Date filter tests ────────────────────────────────────
  sep('3. Date filter tests (sdate/edate)')
  const dateVariants: { label: string; params: Record<string, unknown> }[] = [
    { label: 'sdate+edate',   params: { sdate: '2026-01-01', edate: '2026-05-08' } },
    { label: 'sdate only',    params: { sdate: '2026-01-01' } },
    { label: 'startdate',     params: { startdate: '2026-01-01', enddate: '2026-05-08' } },
  ]

  for (const { label, params } of dateVariants) {
    try {
      const r    = await post('/getmemberlist.asp', params)
      const list = (r.userinfo as Record<string, unknown>[]) ?? []
      console.log(
        `  ${label.padEnd(18)}: count=${String(list.length).padStart(3)}` +
        `  status=${r.status ?? 'ok'}` +
        `  totalcount=${r.totalcount ?? '?'}`
      )
    } catch (err) {
      console.log(`  ${label.padEnd(18)}: ERROR — ${(err as Error).message}`)
    }
  }

  // ── 4. Full member list ─────────────────────────────────────
  sep('4. All members from baseline call')
  console.log('  #   userid (email)                          name                     margin  payment')
  console.log('  ' + '─'.repeat(90))
  members.forEach((m, i) => {
    const userid  = String(m.userid  ?? '').toLowerCase().trim()
    const name    = String(m.ename   ?? '')
    const margin  = String((m as Record<string, unknown>)['marginrate '] ?? m['marginrate'] ?? '?')
    const payment = String(m.payment ?? '')
    console.log(
      `  ${String(i+1).padStart(2)}. ${userid.padEnd(40)} ${name.padEnd(24)} ${margin.padStart(6)}  ${payment}`
    )
  })

  // ── 5. DB comparison ─────────────────────────────────────────
  sep('5. DB customers comparison')
  const dbCount  = await pool.query('SELECT COUNT(*) FROM customers')
  const dbSample = await pool.query('SELECT email, name FROM customers ORDER BY name LIMIT 10')
  const dbAll    = await pool.query('SELECT email FROM customers')

  const dbEmails  = dbAll.rows.map((r: { email: string }) => r.email.toLowerCase().trim())
  const apiEmails = members.map(m => String(m.userid ?? '').toLowerCase().trim())

  const matched    = apiEmails.filter(e => dbEmails.includes(e))
  const inApiNotDb = apiEmails.filter(e => !dbEmails.includes(e))
  const inDbNotApi = dbEmails.filter(e => !apiEmails.includes(e))

  console.log(`API members total  : ${members.length}`)
  console.log(`DB customers total : ${dbCount.rows[0].count}`)
  console.log(`Matched (API ∩ DB) : ${matched.length}`)

  if (inApiNotDb.length > 0) {
    console.log(`\nIn API but NOT in DB (${inApiNotDb.length}):`)
    inApiNotDb.forEach(e => console.log(`  + ${e}`))
  }
  if (inDbNotApi.length > 0) {
    console.log(`\nIn DB but NOT in API (${inDbNotApi.length}):`)
    inDbNotApi.forEach(e => console.log(`  - ${e}`))
  }

  console.log('\nDB sample (email / name):')
  dbSample.rows.forEach((r: { email: string; name: string }) =>
    console.log(`  ${r.email.padEnd(38)} ${r.name}`)
  )

  await pool.end()
  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
