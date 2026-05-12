import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import axios from 'axios'

const BASE_URL = process.env.SHIPHEYO_API_URL || 'https://shipheyo.com/linked'
const AUTH_KEY = process.env.SHIPHEYO_AUTH_KEY || ''

function sep(t: string) { console.log('\n' + '─'.repeat(60)); console.log(`  ${t}`); console.log('─'.repeat(60)) }

async function rawPost(extra: Record<string, unknown> = {}) {
  const res = await axios.post(`${BASE_URL}/getOrderlist.asp`,
    { authkey: AUTH_KEY, ...extra }, { timeout: 30000 })
  return res.data as Record<string, unknown>
}

async function main() {
  // ── 1. Compare tracking numbers: page 1 vs page 2 ─────────
  sep('1. Do pages 1 and 2 return different tracking numbers?')
  const r1 = await rawPost({ page: '1' })
  const r2 = await rawPost({ page: '2' })
  const p1Orders = r1.orderinfo as Record<string, unknown>[]
  const p2Orders = r2.orderinfo as Record<string, unknown>[]
  const p1Ids = p1Orders.map(o => String(o.id))
  const p2Ids = p2Orders.map(o => String(o.id))
  const sameCount = p1Ids.filter(id => p2Ids.includes(id)).length
  console.log(`Page 1 order IDs: ${p1Ids.slice(0,3).join(', ')}...`)
  console.log(`Page 2 order IDs: ${p2Ids.slice(0,3).join(', ')}...`)
  console.log(`Overlap: ${sameCount}/${p1Orders.length} orders are the same`)

  // ── 2. Try different pagination param names ────────────────
  sep('2. Try alternative pagination params')
  const variants: Record<string, unknown>[] = [
    { pagenum: 2 },
    { p: 2 },
    { currentpage: 2 },
    { page_no: 2 },
    { offset: 30 },
    { start: 30 },
    { page: 2 },           // integer not string
    { page: '2', limit: 30 },
  ]
  for (const v of variants) {
    const r = await rawPost(v)
    const ids = (r.orderinfo as Record<string, unknown>[]).map(o => String(o.id)).slice(0, 3)
    const overlap = ids.filter(id => p1Ids.includes(id)).length
    console.log(`  ${JSON.stringify(v).padEnd(35)} → ids=[${ids.join(',')}]  overlap_with_p1=${overlap}/3`)
  }

  // ── 3. Single page full sample — all createdate values ────
  sep('3. All createdate values on page 1 — first 10')
  p1Orders.slice(0, 10).forEach((o, i) =>
    console.log(`  [${i}] id=${o.id}  createdate="${o.createdate}"`)
  )

  // ── 4. Are all IDs in pages 1-10 unique? ──────────────────
  sep('4. Check uniqueness across pages 1-10')
  const allIds: string[] = [...p1Ids, ...p2Ids]
  for (let p = 3; p <= 10; p++) {
    const rp = await rawPost({ page: String(p) })
    const ids = (rp.orderinfo as Record<string, unknown>[]).map(o => String(o.id))
    allIds.push(...ids)
    const newOnes = ids.filter(id => !p1Ids.includes(id)).length
    console.log(`  page ${p}: ${newOnes}/30 IDs are different from page 1`)
  }
  const uniqueTotal = new Set(allIds).size
  console.log(`  Total IDs in pages 1-10: ${allIds.length}, unique: ${uniqueTotal}`)

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
