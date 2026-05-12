import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''

async function rawPost(pageNum: number) {
  const res = await axios.post(`${BASE_URL}/getOrderlist.asp`,
    { authkey: AUTH_KEY, page: pageNum }, { timeout: 30000 })
  return res.data as Record<string, unknown>
}

async function main() {
  const r1 = await rawPost(1)
  const p1orders = r1.orderinfo as Record<string, unknown>[]
  const p1ids = p1orders.map(o => String(o.id))
  const p1tracking = p1orders.flatMap(o => {
    const boxes = (o.boxinfo as Record<string, unknown>[]) || []
    return boxes.map(b => String(b.tracking))
  })
  console.log(`Page 1: ${p1ids.length} orders, ${p1tracking.length} packages`)
  console.log(`  Sample IDs: ${p1ids.slice(0,3).join(', ')}`)
  console.log(`  Sample tracking: ${p1tracking.slice(0,3).join(', ')}`)
  console.log(`  createdate[0]: ${p1orders[0]?.createdate}`)
  console.log(`  createdate[29]: ${p1orders[29]?.createdate}`)

  for (const p of [2, 3, 5, 10, 50, 100, 150]) {
    const r = await rawPost(p)
    const orders = r.orderinfo as Record<string, unknown>[]
    const ids = orders.map(o => String(o.id))
    const tracking = orders.flatMap(o => {
      const boxes = (o.boxinfo as Record<string, unknown>[]) || []
      return boxes.map(b => String(b.tracking))
    })
    const idOverlap = ids.filter(id => p1ids.includes(id)).length
    const trkOverlap = tracking.filter(t => p1tracking.includes(t)).length
    console.log(`Page ${String(p).padStart(3)}: orders=${orders.length}  id_overlap=${idOverlap}/${ids.length}  trk_overlap=${trkOverlap}/${tracking.length}  createdate="${orders[0]?.createdate}"`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
