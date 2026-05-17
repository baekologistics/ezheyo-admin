/**
 * importCancelledOrders2025.ts
 * Import cancelled orders (charge=0, upsCost=0, no tracking) from XLS.
 * These are marked cancelled by customer_charge=0 in the DB.
 * tracking_no is set to a placeholder: VOID-YYYYMMDD-NNN
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

const XLS_FILES: Record<number, string> = {
  8:  '/Users/js/Downloads/종합현황(20250801_20250831).xls',
  9:  '/Users/js/Downloads/종합현황(20250901_20250930).xls',
  10: '/Users/js/Downloads/종합현황(20251001_20251031).xls',
  11: '/Users/js/Downloads/종합현황(20251101_20251130).xls',
  12: '/Users/js/Downloads/종합현황(20251201_20251231).xls',
}

// Dates that are short and need cancelled order imports
const SHORT_DATES = new Set([
  '2025-08-01','2025-08-04','2025-08-07','2025-08-08','2025-08-11',
  '2025-08-12','2025-08-13','2025-08-18','2025-08-19','2025-08-20',
  '2025-08-25','2025-08-26','2025-08-27','2025-08-29',
  '2025-09-02','2025-09-03','2025-09-04','2025-09-17','2025-09-26','2025-09-30',
  '2025-10-01','2025-10-06','2025-10-07','2025-10-09','2025-10-10',
  '2025-10-13','2025-10-14','2025-10-15','2025-10-16','2025-10-20',
  '2025-10-22','2025-10-23','2025-10-24',
  '2025-11-03','2025-11-07','2025-11-14','2025-11-19','2025-11-20','2025-11-21',
  '2025-12-17','2025-12-18','2025-12-22','2025-12-23','2025-12-26','2025-12-29','2025-12-30',
])

const EXCEL: Record<string, number> = {
  '2025-08-01':101,'2025-08-04':93,'2025-08-07':111,'2025-08-08':107,
  '2025-08-11':82,'2025-08-12':79,'2025-08-13':72,'2025-08-18':58,
  '2025-08-19':53,'2025-08-20':84,'2025-08-25':69,'2025-08-26':68,
  '2025-08-27':78,'2025-08-29':56,
  '2025-09-02':93,'2025-09-03':72,'2025-09-04':83,'2025-09-17':79,
  '2025-09-26':90,'2025-09-30':63,
  '2025-10-01':61,'2025-10-06':67,'2025-10-07':68,'2025-10-09':71,
  '2025-10-10':50,'2025-10-13':85,'2025-10-14':60,'2025-10-15':81,
  '2025-10-16':60,'2025-10-20':94,'2025-10-22':86,'2025-10-23':82,'2025-10-24':80,
  '2025-11-03':109,'2025-11-07':62,'2025-11-14':99,'2025-11-19':77,
  '2025-11-20':79,'2025-11-21':81,
  '2025-12-17':93,'2025-12-18':76,'2025-12-22':101,'2025-12-23':89,
  '2025-12-26':43,'2025-12-29':69,'2025-12-30':57,
}

const MONTH_TARGET: Record<number, number> = {
  8:1594, 9:1553, 10:1608, 11:1347, 12:1553
}

function stripHtml(h: string) { return h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() }
function normDate(r: string) {
  const s = r.trim().replace(/\D/g,'')
  if (s.length===8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = r.match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:''
}
function parseTrk(h: string) {
  const n:string[]=[]; const re=/>(\s*1Z[0-9A-Z]+\s*)</g; let m:RegExpExecArray|null
  while((m=re.exec(h))!==null){const t=m[1].trim();if(!n.includes(t))n.push(t)}; return n
}
function parseRef(h: string) {
  const c=h.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ')
  return c.split('\n').map(l=>l.trim()).filter(Boolean).find(l=>/^\d+$/.test(l))??''
}
function parseAddr(h: string) {
  return h.replace(/<br\s*\/?>/gi,', ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ')
    .replace(/,\s*,/g,',').replace(/\s+/g,' ').trim().replace(/^,\s*/,'').replace(/,\s*$/,'')
}

interface CancelledRow {
  date: string
  email: string
  refNo: string
  shipperAddr: string
  receiverAddr: string
}

function parseCancelledRows(file: string, targets: Set<string>): CancelledRow[] {
  const html = fs.readFileSync(file, 'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: CancelledRow[] = []
  for (const chunk of chunks) {
    const tds = (chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
    if (tds.length < 9) continue
    const cells = tds.map(td=>td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email = stripHtml(cells[1]); if (!email||email==='ID'||!email.includes('@')) continue
    const date = normDate(stripHtml(cells[2])); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!targets.has(date)) continue
    // Only cancelled rows: no tracking
    const trackings = parseTrk(cells[6])
    if (trackings.length > 0) continue  // skip normal rows
    rows.push({
      date, email,
      refNo: parseRef(cells[6]),
      shipperAddr: parseAddr(cells[3]),
      receiverAddr: parseAddr(cells[4]),
    })
  }
  return rows
}

async function main() {
  // Get current DB counts
  const dbRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date >= '2025-08-01' AND date <= '2025-12-31'
    GROUP BY date ORDER BY date`)
  const dbCounts = new Map<string,number>()
  for(const row of dbRes.rows as Array<{date:string;cnt:string}>)
    dbCounts.set(row.date.slice(0,10), parseInt(row.cnt))

  // Customer map
  const custRes = await pool.query('SELECT id,email,name,sales_person FROM customers')
  const emap = new Map<string,{id:string;name:string;salesPerson:string}>(
    (custRes.rows as Array<{id:string;email:string;name:string;sales_person:string}>)
      .map(r=>[r.email.trim().toLowerCase(),{id:r.id,name:r.name,salesPerson:r.sales_person??''}])
  )

  // Check existing VOID tracking numbers to avoid duplicates
  const voidRes = await pool.query(`SELECT tracking_no FROM orders WHERE tracking_no LIKE 'VOID-%'`)
  const existVoid = new Set<string>((voidRes.rows as Array<{tracking_no:string}>).map(r=>r.tracking_no))

  let grandInserted = 0
  const monthCounters: Record<number, number> = {}

  for (const [monthStr, xlsFile] of Object.entries(XLS_FILES)) {
    const month = parseInt(monthStr)
    const mm = String(month).padStart(2,'0')

    if (!fs.existsSync(xlsFile)) { console.log(`2025-${mm}: XLS not found`); continue }

    const rows = parseCancelledRows(xlsFile, SHORT_DATES)
    const byDate: Record<string, CancelledRow[]> = {}
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = []
      byDate[r.date].push(r)
    }

    console.log(`\n── 2025-${mm} ──`)
    let monthInserted = 0

    for (const [date, cancelledRows] of Object.entries(byDate).sort()) {
      const dbCur = dbCounts.get(date) ?? 0
      const target = EXCEL[date] ?? 0
      const need = target - dbCur
      if (need <= 0) { console.log(`  ${date}: already at target`); continue }

      // Build a counter for VOID tracking numbers for this date
      const dateKey = date.replace(/-/g,'')
      let seq = 1

      let inserted = 0
      for (const row of cancelledRows) {
        if (inserted >= need) break

        // Generate unique VOID tracking
        let voidTrk: string
        do {
          voidTrk = `VOID-${dateKey}-${String(seq).padStart(3,'0')}`
          seq++
        } while (existVoid.has(voidTrk))
        existVoid.add(voidTrk)

        const email = row.email.trim().toLowerCase()
        const cust = emap.get(email) ?? null
        const pkgs = [{
          tracking_no: voidTrk,
          weight: 0, width: 0, length: 0, height: 0,
          ref_no: row.refNo, cod_amount: 0,
          shipper_name: '', shipper_addr: row.shipperAddr,
          receiver_name: '', receiver_addr: row.receiverAddr,
        }]

        await pool.query(
          `INSERT INTO orders (id,tracking_no,date,customer_id,customer_email,customer_name,
             service_type,ups_cost,customer_charge,cod_amount,sales_person,
             total_packages,packages,ref_no)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
          [voidTrk, row.date, cust?.id??null, email, cust?.name??email,
           'Ground', 0, 0, 0, cust?.salesPerson??null,
           1, JSON.stringify(pkgs), row.refNo||null]
        )
        dbCounts.set(date, (dbCounts.get(date)??0) + 1)
        inserted++
      }
      monthInserted += inserted
      grandInserted += inserted
      console.log(`  ${date}: inserted ${inserted} cancelled orders (DB=${(dbCounts.get(date)??0)} / target=${target})`)
    }
    monthCounters[month] = monthInserted
    console.log(`  → 2025-${mm} inserted: ${monthInserted}`)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Grand total cancelled orders inserted: ${grandInserted}`)

  // Final verification
  const finalRes = await pool.query(`
    SELECT EXTRACT(MONTH FROM date)::int as m, COUNT(*) as cnt
    FROM orders WHERE date >= '2025-04-01' AND date <= '2025-12-31'
    GROUP BY m ORDER BY m`)

  console.log('\n=== Final monthly totals ===')
  const MON=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const TARGETS: Record<number,number> = {4:1538,6:1454,8:1594,9:1553,10:1608,11:1347,12:1553}
  for(const row of finalRes.rows as Array<{m:number;cnt:string}>){
    const target = TARGETS[row.m]
    const diff = parseInt(row.cnt) - (target??0)
    const flag = target==null ? '' : diff===0 ? '✓' : diff>0 ? `+${diff}(excess)` : `${diff}(short)`
    console.log(`  ${MON[row.m]} (${row.m}): ${row.cnt}${target?` / ${target} ${flag}`:''}`)
  }
}

main().catch(e=>console.error('ERROR:',e.message)).finally(()=>pool.end())
