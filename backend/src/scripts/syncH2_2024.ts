/**
 * syncH2_2024.ts
 * Reconcile Jul–Dec 2024 DB against Excel ground-truth.
 * - Excess dates → DELETE by customer_charge ASC
 * - Short dates  → INSERT from XLS (regex parser)
 * - DB dates not in Excel → DELETE all
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

// ── Excel ground-truth ────────────────────────────────────────
const EXCEL: Record<string, number> = {
  // July
  '2024-07-01':34,'2024-07-02':26,'2024-07-03':34,'2024-07-04':33,'2024-07-05':37,
  '2024-07-07':1, '2024-07-08':19,'2024-07-09':29,'2024-07-10':44,'2024-07-11':39,
  '2024-07-12':58,'2024-07-15':34,'2024-07-16':52,'2024-07-17':49,'2024-07-18':45,
  '2024-07-19':35,'2024-07-22':48,'2024-07-23':48,'2024-07-24':46,'2024-07-25':42,
  '2024-07-26':26,'2024-07-29':50,'2024-07-30':42,'2024-07-31':42,
  // August
  '2024-08-01':39,'2024-08-02':27,'2024-08-03':1, '2024-08-05':49,'2024-08-06':44,
  '2024-08-07':44,'2024-08-08':46,'2024-08-09':63,'2024-08-12':35,'2024-08-13':48,
  '2024-08-14':38,'2024-08-15':41,'2024-08-16':29,'2024-08-19':40,'2024-08-20':46,
  '2024-08-21':73,'2024-08-22':93,'2024-08-23':68,'2024-08-25':5, '2024-08-26':43,
  '2024-08-27':57,'2024-08-28':85,'2024-08-29':51,'2024-08-30':40,'2024-08-31':2,
  // September
  '2024-09-03':66,'2024-09-04':45,'2024-09-05':70,'2024-09-06':74,'2024-09-09':23,
  '2024-09-10':62,'2024-09-11':52,'2024-09-12':49,'2024-09-13':58,'2024-09-14':1,
  '2024-09-16':36,'2024-09-17':54,'2024-09-18':44,'2024-09-19':83,'2024-09-20':68,
  '2024-09-23':59,'2024-09-24':71,'2024-09-25':62,'2024-09-26':90,'2024-09-27':66,
  '2024-09-30':72,
  // October
  '2024-10-01':74,'2024-10-02':89,'2024-10-03':114,'2024-10-04':50,'2024-10-07':41,
  '2024-10-08':57,'2024-10-09':61,'2024-10-10':68,'2024-10-11':48,'2024-10-12':3,
  '2024-10-14':46,'2024-10-15':62,'2024-10-16':53,'2024-10-17':68,'2024-10-18':53,
  '2024-10-21':47,'2024-10-22':76,'2024-10-23':43,'2024-10-24':50,'2024-10-25':44,
  '2024-10-26':4, '2024-10-28':38,'2024-10-29':71,'2024-10-30':78,'2024-10-31':70,
  // November
  '2024-11-01':43,'2024-11-03':2, '2024-11-04':51,'2024-11-05':56,'2024-11-06':55,
  '2024-11-07':65,'2024-11-08':55,'2024-11-10':1, '2024-11-11':58,'2024-11-12':93,
  '2024-11-13':64,'2024-11-14':77,'2024-11-15':60,'2024-11-16':1, '2024-11-18':85,
  '2024-11-19':79,'2024-11-20':77,'2024-11-21':76,'2024-11-22':55,'2024-11-25':78,
  '2024-11-26':92,'2024-11-27':72,'2024-11-29':18,
  // December
  '2024-12-02':52,'2024-12-03':61,'2024-12-04':65,'2024-12-05':66,'2024-12-06':68,
  '2024-12-08':1, '2024-12-09':52,'2024-12-10':57,'2024-12-11':64,'2024-12-12':60,
  '2024-12-13':69,'2024-12-14':3, '2024-12-16':54,'2024-12-17':68,'2024-12-18':65,
  '2024-12-19':67,'2024-12-20':60,'2024-12-21':1, '2024-12-22':2, '2024-12-23':63,
  '2024-12-24':38,'2024-12-26':36,'2024-12-27':30,'2024-12-29':1, '2024-12-30':44,
  '2024-12-31':9,
}

const XLS_FILES: Record<string, string> = {
  '07': '/Users/js/Downloads/종합현황(20240701_20240731).xls',
  '08': '/Users/js/Downloads/종합현황(20240801_20240831).xls',
  '09': '/Users/js/Downloads/종합현황(20240901_20240930).xls',
  '10': '/Users/js/Downloads/종합현황(20241001_20241031).xls',
  '11': '/Users/js/Downloads/종합현황(20241101_20241130).xls',
  '12': '/Users/js/Downloads/종합현황(20241201_20241231).xls',
}

// ── XLS regex parser (handles missing </tr>) ──────────────────
const SERVICE_MAP: Record<string, string> = {
  'ups ground': 'Ground', 'ground': 'Ground',
  'ups next day air early': 'Next Day Air Early', 'next day air early': 'Next Day Air Early',
  'ups next day air': 'Next Day Air', 'next day air': 'Next Day Air',
  'ups 2nd day air': '2nd Day Air', '2nd day air': '2nd Day Air',
}
function stripHtml(h: string) { return h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() }
function normalizeDate(r: string) {
  const s = r.trim().replace(/\D/g,'')
  if (s.length===8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = r.match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:''
}
function parsePrice(h: string) { const m=stripHtml(h).replace(/[$,]/g,'').match(/[\d.]+/); return m?parseFloat(m[0]):0 }
function parseService(h: string) { const t=stripHtml(h).toLowerCase(); for(const[k,v]of Object.entries(SERVICE_MAP))if(t.includes(k))return v; return'Ground' }
function parseTrackings(h: string) {
  const nums: string[]=[]; const re=/>(\s*1Z[0-9A-Z]+\s*)</g; let m: RegExpExecArray|null
  while((m=re.exec(h))!==null){const t=m[1].trim();if(!nums.includes(t))nums.push(t)}; return nums
}
function parseRefNo(h: string) {
  const noLinks=h.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'')
  const lines=noLinks.replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ').split('\n').map(l=>l.trim()).filter(Boolean)
  return lines.find(l=>/^\d+$/.test(l))??''
}
function parseAddr(h: string) {
  return h.replace(/<br\s*\/?>/gi,', ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ')
    .replace(/,\s*,/g,',').replace(/\s+/g,' ').trim().replace(/^,\s*/,'').replace(/,\s*$/,'')
}

interface Row { email:string;date:string;trackings:string[];refNo:string;service:string;charge:number;upsCost:number;cod:number;shipperAddr:string;receiverAddr:string }

function parseXls(file: string, targetDates: Set<string>): Row[] {
  const html = fs.readFileSync(file,'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: Row[] = []
  for(const chunk of chunks){
    const tds=(chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
    if(tds.length<9)continue
    const cells=tds.map(td=>td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email=stripHtml(cells[1]); if(!email||email==='ID'||!email.includes('@'))continue
    const date=normalizeDate(stripHtml(cells[2])); if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue
    if(!targetDates.has(date))continue
    const trackings=parseTrackings(cells[6]); if(trackings.length===0)continue
    rows.push({email,date,trackings,refNo:parseRefNo(cells[6]),service:parseService(cells[5]),
      charge:parsePrice(cells[7]),upsCost:parsePrice(cells[8]),
      cod:cells[9]?parsePrice(cells[9]):0,shipperAddr:parseAddr(cells[3]),receiverAddr:parseAddr(cells[4])})
  }
  return rows
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // Current DB counts
  const dbRes = await pool.query(`
    SELECT date::text,COUNT(*) as cnt FROM orders
    WHERE date>='2024-07-01' AND date<='2024-12-31' GROUP BY date ORDER BY date`)
  const dbCounts: Record<string,number> = {}
  for(const r of dbRes.rows as Array<{date:string;cnt:string}>)
    dbCounts[r.date.slice(0,10)]=parseInt(r.cnt)

  // Find all DB dates not in Excel (delete all)
  const dbDates = new Set(Object.keys(dbCounts))
  const excelDates = new Set(Object.keys(EXCEL))
  const toDeleteAll: string[] = []
  for(const d of dbDates) if(!excelDates.has(d)) toDeleteAll.push(d)

  // Classify each Excel date
  const excess: Record<string,number> = {}   // DB > Excel
  const short:  Record<string,number> = {}   // DB < Excel

  for(const[date, target] of Object.entries(EXCEL)){
    const cur = dbCounts[date]??0
    if(cur > target) excess[date] = cur-target
    else if(cur < target) short[date] = target-cur
  }

  console.log(`\nDB dates not in Excel: ${toDeleteAll.length} dates`)
  console.log(`Excess (DB>Excel): ${Object.keys(excess).length} dates, ${Object.values(excess).reduce((a,b)=>a+b,0)} rows to delete`)
  console.log(`Short  (DB<Excel): ${Object.keys(short).length} dates, ${Object.values(short).reduce((a,b)=>a+b,0)} rows needed`)

  let totalDeleted = 0, totalInserted = 0

  // ── 1. Delete dates not in Excel ──────────────────────────
  for(const date of toDeleteAll){
    const r = await pool.query('DELETE FROM orders WHERE date=$1 RETURNING id',[date])
    console.log(`  DELETE all ${date}: ${r.rowCount} rows`)
    totalDeleted += r.rowCount??0
  }

  // ── 2. Delete excess ──────────────────────────────────────
  for(const[date, n] of Object.entries(excess)){
    await pool.query(`DELETE FROM orders WHERE id IN (
      SELECT id FROM orders WHERE date=$1 ORDER BY customer_charge ASC,id ASC LIMIT $2)`,[date,n])
    console.log(`  DELETE excess ${date}: -${n}`)
    totalDeleted += n
  }

  // ── 3. Insert short dates from XLS ───────────────────────
  // Get existing trackings
  const existRes = await pool.query(`
    SELECT tracking_no FROM orders
    UNION
    SELECT pkg->>'tracking_no' FROM orders,jsonb_array_elements(packages) AS pkg
    WHERE packages IS NOT NULL AND jsonb_typeof(packages)='array'`)
  const existingT = new Set<string>((existRes.rows as Array<{tracking_no:string}>).map(r=>r.tracking_no).filter(Boolean))

  // Customer map
  const custRes = await pool.query('SELECT id,email,name,sales_person FROM customers')
  const emailMap = new Map<string,{id:string;name:string;salesPerson:string}>(
    (custRes.rows as Array<{id:string;email:string;name:string;sales_person:string}>)
      .map(r=>[r.email.trim().toLowerCase(),{id:r.id,name:r.name,salesPerson:r.sales_person??''}])
  )

  // Group short dates by month
  const shortByMonth: Record<string,Set<string>> = {}
  for(const date of Object.keys(short)){
    const mo = date.slice(5,7)
    if(!shortByMonth[mo]) shortByMonth[mo]=new Set()
    shortByMonth[mo].add(date)
  }

  for(const[mo, dates] of Object.entries(shortByMonth).sort()){
    const file = XLS_FILES[mo]
    if(!file||!fs.existsSync(file)){ console.log(`  MISSING file for month ${mo}: ${file}`); continue }
    console.log(`\n── Month ${mo}: importing from ${path.basename(file)} ──`)
    const rows = parseXls(file, dates)

    // Count by date from XLS
    const xlsByDate: Record<string,number>={}
    for(const r of rows) xlsByDate[r.date]=(xlsByDate[r.date]??0)+1
    for(const d of dates) console.log(`  XLS ${d}: ${xlsByDate[d]??0} rows  (need +${short[d]})`)

    let ins=0, skip=0
    for(const row of rows){
      if(row.trackings.some(t=>existingT.has(t))){skip++;continue}
      const email=row.email.trim().toLowerCase()
      const cust=emailMap.get(email)??null
      const pkgs=row.trackings.map((t,i)=>({
        tracking_no:t,weight:0,width:0,length:0,height:0,
        ref_no:i===0?row.refNo:'',cod_amount:i===0?row.cod:0,
        shipper_name:'',shipper_addr:row.shipperAddr,
        receiver_name:'',receiver_addr:row.receiverAddr,
      }))
      await pool.query(
        `INSERT INTO orders(id,tracking_no,date,customer_id,customer_email,customer_name,
           service_type,ups_cost,customer_charge,cod_amount,sales_person,
           total_packages,packages,ref_no)
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
        [row.trackings[0],row.date,cust?.id??null,email,cust?.name??email,
         row.service,row.upsCost,row.charge,row.cod,cust?.salesPerson??null,
         row.trackings.length,JSON.stringify(pkgs),row.refNo||null]
      )
      row.trackings.forEach(t=>existingT.add(t))
      ins++
    }
    console.log(`  Inserted: ${ins} | Skipped: ${skip}`)
    totalInserted += ins
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`Total deleted: ${totalDeleted} | Total inserted: ${totalInserted}`)

  // ── Final verification ────────────────────────────────────
  const finalRes = await pool.query(`
    SELECT EXTRACT(MONTH FROM date)::int as mo, COUNT(*) as cnt
    FROM orders WHERE date>='2024-07-01' AND date<='2024-12-31'
    GROUP BY mo ORDER BY mo`)

  const targets: Record<number,number> = {7:913,8:1107,9:1205,10:1408,11:1313,12:1156}
  console.log('\n=== Final monthly counts ===')
  for(const r of finalRes.rows as Array<{mo:number;cnt:string}>){
    const t=targets[r.mo]??'?'
    const diff=parseInt(r.cnt)-(t as number)
    const flag = diff===0?' ✓':diff>0?` +${diff} (excess)`:`${diff} (short)`
    console.log(`  ${r.mo}월: ${r.cnt} / ${t}${flag}`)
  }
}

main().catch(e=>console.error('ERROR:',e.message)).finally(()=>pool.end())
