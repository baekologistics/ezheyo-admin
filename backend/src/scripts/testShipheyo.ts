import dotenv from 'dotenv'
import path from 'path'
import { getMemberList, getAllOrders, SERVICE_CODE_MAP } from '../services/shipmeyoService'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function sep(title: string) {
  console.log('\n' + '─'.repeat(60))
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

async function testMemberList() {
  sep('TEST 1: getMemberList()')

  const members = await getMemberList()
  console.log(`Total members: ${members.length}`)

  if (members.length > 0) {
    console.log('\n[First member]')
    console.log(JSON.stringify(members[0], null, 2))

    console.log('\n[Mapping check]')
    const m = members[0]
    console.log(`  userid (email)  : ${m.userid}`)
    console.log(`  ename  (name)   : ${m.ename}`)
    console.log(`  marginrate      : ${m['marginrate ']}  → stored as ${parseFloat(m['marginrate '] ?? '0')}`)
    console.log(`  payment         : ${m.payment}`)
  }

  console.log('\n[All members — name / email / margin / payment]')
  members.forEach((m, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${m.ename.padEnd(30)} ${m.userid.padEnd(35)} margin=${m['marginrate ']}  ${m.payment}`)
  })
}

async function testOrderList() {
  sep('TEST 2: getAllOrders(2026-01-01 ~ 2026-01-31)')

  const orders = await getAllOrders('2026-01-01', '2026-01-31')
  console.log(`Total orders (flattened by tracking): ${orders.length}`)

  if (orders.length > 0) {
    console.log('\n[First order]')
    console.log(JSON.stringify(orders[0], null, 2))

    console.log('\n[Mapping check]')
    const o = orders[0]
    console.log(`  tracking_no    : ${o.tracking_no}`)
    console.log(`  userid (email) : ${o.userid}`)
    console.log(`  service_code   : ${o.service_code}  → "${SERVICE_CODE_MAP[o.service_code] ?? 'UNKNOWN'}"`)
    console.log(`  org_price      : ${o.org_price}  → UPS cost $${parseFloat(o.org_price).toFixed(2)}`)
    console.log(`  sell_price     : ${o.sell_price}  → customer charge $${parseFloat(o.sell_price).toFixed(2)}`)
    console.log(`  order_date     : ${o.order_date}`)
    console.log(`  cod_amount     : ${o.cod_amount}`)
  }

  console.log('\n[Service code distribution]')
  const codeCounts: Record<string, number> = {}
  orders.forEach(o => { codeCounts[o.service_code] = (codeCounts[o.service_code] || 0) + 1 })
  Object.entries(codeCounts).sort().forEach(([code, cnt]) => {
    console.log(`  "${code}" → "${SERVICE_CODE_MAP[code] ?? 'UNKNOWN'}"  (${cnt} orders)`)
  })
}

async function main() {
  console.log('SHIPHEYO API Test — updated field mapping')
  console.log(`BASE_URL : ${process.env.SHIPHEYO_API_URL}`)
  console.log(`AUTH_KEY : ${(process.env.SHIPHEYO_AUTH_KEY || '').slice(0, 6)}...`)

  try {
    await testMemberList()
  } catch (err) {
    console.error('\n❌ getMemberList failed:', (err as Error).message)
  }

  try {
    await testOrderList()
  } catch (err) {
    console.error('\n❌ getAllOrders failed:', (err as Error).message)
  }

  console.log('\n✅ Test complete\n')
}

main()
