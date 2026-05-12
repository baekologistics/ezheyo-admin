import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'
import qs from 'qs'

const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''
const SDATE = '2026-05-01'
const EDATE = '2026-05-08'

const URLS = [
  'https://shipheyo.com/getOrderlist.asp',
  'https://shipheyo.com/linked/getOrderlist.asp',
]

function sep(t: string) {
  console.log('\n' + '═'.repeat(70))
  console.log(`  ${t}`)
  console.log('═'.repeat(70))
}

type Params = Record<string, unknown>

async function testPost(label: string, url: string, params: Params) {
  const payload = qs.stringify(params)
  let data: Record<string, unknown>
  let httpStatus: number

  try {
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    })
    httpStatus = res.status
    data       = res.data as Record<string, unknown>
  } catch (err: unknown) {
    const e = err as { response?: { status: number; data: unknown }; message: string }
    if (e.response) {
      console.log(`  [${label}] HTTP ${e.response.status} — ${JSON.stringify(e.response.data).slice(0, 200)}`)
    } else {
      console.log(`  [${label}] ERROR: ${e.message}`)
    }
    return null
  }

  const orders = (data.orderinfo as Record<string, unknown>[]) ?? []

  console.log(`\n  ── ${label}`)
  console.log(`  HTTP         : ${httpStatus}`)
  console.log(`  totalorder   : ${data.totalorder ?? '(none)'}`)
  console.log(`  page (resp)  : ${data.page ?? '(none)'}`)
  console.log(`  totalpage    : ${data.totalpage ?? '(none)'}`)
  console.log(`  status/msg   : ${data.status ?? ''} / ${data.message ?? ''}`)
  console.log(`  orders count : ${orders.length}`)

  if (orders.length > 0) {
    console.log('  First 5:')
    orders.slice(0, 5).forEach((o, i) => {
      const boxes     = (o.boxinfo as Record<string, unknown>[]) ?? []
      const trackings = boxes.map(b => b.tracking).filter(Boolean).join(', ') || '(none)'
      console.log(`    [${i}] id=${o.id}  userid=${o.userid}  createdate="${o.createdate}"`)
      console.log(`         tracking: ${trackings}`)
    })
  } else {
    console.log(`  raw keys: ${Object.keys(data).join(', ')}`)
    console.log(`  raw data: ${JSON.stringify(data).slice(0, 300)}`)
  }

  return data
}

async function main() {
  if (!AUTH_KEY) { console.error('SHIPHEYO_AUTH_KEY not set'); process.exit(1) }

  const URL = 'https://shipheyo.com/linked/getOrderlist.asp'

  sep('1. Baseline — page 1 with sdate/edate (form-encoded)')
  await testPost('page=1 int',    URL, { authkey: AUTH_KEY, page: 1,   sdate: SDATE, edate: EDATE })

  sep('2. Pagination variants — page 2')
  await testPost('page=2 int',    URL, { authkey: AUTH_KEY, page: 2,   sdate: SDATE, edate: EDATE })
  await testPost('page="2" str',  URL, { authkey: AUTH_KEY, page: '2', sdate: SDATE, edate: EDATE })
  await testPost('pagenum=2',     URL, { authkey: AUTH_KEY, pagenum: 2, sdate: SDATE, edate: EDATE })
  await testPost('pageno=2',      URL, { authkey: AUTH_KEY, pageno: 2, sdate: SDATE, edate: EDATE })
  await testPost('currentpage=2', URL, { authkey: AUTH_KEY, currentpage: 2, sdate: SDATE, edate: EDATE })

  sep('3. Page 1 without sdate/edate — compare totalorder')
  await testPost('page=1 no dates', URL, { authkey: AUTH_KEY, page: 1 })

  sep('4. Pages 2 and 3 without sdate/edate')
  await testPost('page=2 no dates', URL, { authkey: AUTH_KEY, page: 2 })
  await testPost('page=3 no dates', URL, { authkey: AUTH_KEY, page: 3 })

  sep('5. Pages 2, 3, 13 with pagenum + sdate/edate')
  await testPost('pagenum=2',  URL, { authkey: AUTH_KEY, pagenum: 2,  sdate: SDATE, edate: EDATE })
  await testPost('pagenum=3',  URL, { authkey: AUTH_KEY, pagenum: 3,  sdate: SDATE, edate: EDATE })
  await testPost('pagenum=13', URL, { authkey: AUTH_KEY, pagenum: 13, sdate: SDATE, edate: EDATE })

  sep('6. pagenum on narrow 2-day ranges + offset probes')
  const N2 = 'https://shipheyo.com/linked/getOrderlist.asp'

  // Does pagenum=2 give different data on a narrow range (May 7-8, 4 pages)?
  for (const pval of [
    { k: 'page',        v: 1 }, { k: 'page',        v: 2 }, { k: 'page',        v: 3 },
    { k: 'pagenum',     v: 1 }, { k: 'pagenum',     v: 2 }, { k: 'pagenum',     v: 3 },
    { k: 'offset',      v: 31 },
    { k: 'startrow',    v: 31 },
    { k: 'startindex',  v: 31 },
    { k: 'skip',        v: 31 },
  ]) {
    const params: Record<string, unknown> = { authkey: AUTH_KEY, sdate: '2026-05-07', edate: '2026-05-08' }
    params[pval.k] = pval.v
    const payload = qs.stringify(params)
    try {
      const res = await axios.post(N2, payload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000,
      })
      const d = res.data as Record<string, unknown>
      const orders = (d.orderinfo as Record<string, unknown>[]) ?? []
      const firstId = orders[0] ? String((orders[0] as Record<string, unknown>).id) : '-'
      console.log(`  ${(pval.k+'='+pval.v).padEnd(18)}: orders=${orders.length}  totalorder=${d.totalorder ?? '?'}  firstId=${firstId}  status=${d.status}`)
    } catch (err) {
      console.log(`  ${(pval.k+'='+pval.v).padEnd(18)}: ERROR`)
    }
  }

  sep('6b. Narrow date range experiments')
  const rangeTests: Array<{ label: string; sdate: string; edate: string }> = [
    { label: 'same day May 7',          sdate: '2026-05-07', edate: '2026-05-07' },
    { label: 'May 7 only (edate +1)',   sdate: '2026-05-07', edate: '2026-05-08' },
    { label: 'May 1-2 (2 days)',        sdate: '2026-05-01', edate: '2026-05-02' },
    { label: 'May 1-3 (3 days)',        sdate: '2026-05-01', edate: '2026-05-03' },
    { label: 'Apr 30 - May 1',          sdate: '2026-04-30', edate: '2026-05-01' },
    { label: 'YYYYMMDD same day',       sdate: '20260507',   edate: '20260507'   },
    { label: 'YYYYMMDD 7→8',           sdate: '20260507',   edate: '20260508'   },
  ]
  for (const { label, sdate, edate } of rangeTests) {
    const payload = qs.stringify({ authkey: AUTH_KEY, page: 1, sdate, edate })
    try {
      const res = await axios.post(URL, payload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
      })
      const d = res.data as Record<string, unknown>
      const orders = (d.orderinfo as Record<string, unknown>[]) ?? []
      const firstDate = orders.length > 0 ? (orders[0] as Record<string, unknown>).createdate : '-'
      console.log(`  [${label}]  orders=${orders.length}  totalorder=${d.totalorder ?? '?'}  totalpage=${d.totalpage ?? '?'}  status=${d.status}  first="${firstDate}"`)
    } catch (err) {
      console.log(`  [${label}] ERROR ${(err as Error).message}`)
    }
  }

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
