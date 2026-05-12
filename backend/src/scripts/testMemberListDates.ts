import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY  = process.env.SHIPHEYO_AUTH_KEY || ''

async function post(params: Record<string, unknown>) {
  const res = await axios.post(
    `${BASE_URL}/getmemberlist.asp`,
    qs.stringify({ authkey: AUTH_KEY, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  )
  return res.data as Record<string, unknown>
}

function printResult(label: string, params: Record<string, unknown>, data: Record<string, unknown>) {
  const members = (data.userinfo as Record<string, unknown>[]) ?? []
  const first3  = members.slice(0, 3)
  const last3   = members.slice(-3)

  console.log(`\n${'─'.repeat(65)}`)
  console.log(`  ${label}`)
  console.log(`  params: ${JSON.stringify(params)}`)
  console.log(`${'─'.repeat(65)}`)
  console.log(`  totalpage : ${data.totalpage  ?? '(none)'}`)
  console.log(`  page      : ${data.page       ?? '(none)'}`)
  console.log(`  status    : ${data.status     ?? '(none)'}`)
  console.log(`  count     : ${members.length}`)

  if (members.length === 0) {
    console.log(`  message   : ${data.message ?? ''}`)
    return
  }

  console.log('\n  First 3:')
  first3.forEach(m =>
    console.log(`    ${String(m.ename ?? '').padEnd(30)} ${String(m.userid ?? '').toLowerCase()}`)
  )

  if (members.length > 3) {
    console.log('  Last 3:')
    last3.forEach(m =>
      console.log(`    ${String(m.ename ?? '').padEnd(30)} ${String(m.userid ?? '').toLowerCase()}`)
    )
  }
}

async function main() {
  if (!AUTH_KEY) { console.error('SHIPHEYO_AUTH_KEY not set'); process.exit(1) }

  const tests: { label: string; params: Record<string, unknown> }[] = [
    {
      label:  '1. 날짜 없음 (현재 방식)',
      params: {},
    },
    {
      label:  '2. sdate=2023-01-01, edate=2027-12-31',
      params: { sdate: '2023-01-01', edate: '2027-12-31' },
    },
    {
      label:  '3. sdate=2020-01-01, edate=2027-12-31',
      params: { sdate: '2020-01-01', edate: '2027-12-31' },
    },
    {
      label:  '4. sdate=2023-01-01, edate=2027-12-31, page=1',
      params: { sdate: '2023-01-01', edate: '2027-12-31', page: 1 },
    },
    {
      label:  '5. sdate=2023-01-01, edate=2027-12-31, pagenum=1',
      params: { sdate: '2023-01-01', edate: '2027-12-31', pagenum: 1 },
    },
    {
      label:  '6. sdate=2023-01-01, edate=2027-12-31, page=2',
      params: { sdate: '2023-01-01', edate: '2027-12-31', page: 2 },
    },
  ]

  for (const { label, params } of tests) {
    try {
      const data = await post(params)
      printResult(label, params, data)
    } catch (err) {
      console.log(`\n  ${label}`)
      console.log(`  ERROR: ${(err as Error).message}`)
    }
  }

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
