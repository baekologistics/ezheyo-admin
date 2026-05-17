/**
 * reconcile2025Q2Q4.ts
 * Reconcile 2025-04 ~ 2025-12 against Excel targets.
 * Only imports are needed (no deletes — DB is all short).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

// ── Excel targets (date → expected count) ────────────────────
const EXCEL: Record<string, number> = {
  // April
  '2025-04-01':83,'2025-04-02':51,'2025-04-03':94,'2025-04-04':60,
  '2025-04-06':3,'2025-04-07':83,'2025-04-08':70,'2025-04-09':65,
  '2025-04-10':91,'2025-04-11':77,'2025-04-12':3,'2025-04-13':1,
  '2025-04-14':76,'2025-04-15':69,'2025-04-16':60,'2025-04-17':69,
  '2025-04-18':52,'2025-04-19':1,'2025-04-21':75,'2025-04-22':68,
  '2025-04-23':53,'2025-04-24':62,'2025-04-25':57,'2025-04-28':74,
  '2025-04-29':82,'2025-04-30':59,
  // June
  '2025-06-02':56,'2025-06-03':57,'2025-06-04':77,'2025-06-05':136,
  '2025-06-06':76,'2025-06-07':2,'2025-06-09':46,'2025-06-10':48,
  '2025-06-11':54,'2025-06-12':58,'2025-06-13':62,'2025-06-16':48,
  '2025-06-17':65,'2025-06-18':84,'2025-06-19':78,'2025-06-20':48,
  '2025-06-23':93,'2025-06-24':92,'2025-06-25':67,'2025-06-26':78,
  '2025-06-27':67,'2025-06-28':3,'2025-06-29':1,'2025-06-30':58,
  // August
  '2025-08-01':101,'2025-08-04':93,'2025-08-05':48,'2025-08-06':114,
  '2025-08-07':111,'2025-08-08':107,'2025-08-09':3,'2025-08-11':82,
  '2025-08-12':79,'2025-08-13':72,'2025-08-14':67,'2025-08-15':88,
  '2025-08-17':1,'2025-08-18':58,'2025-08-19':53,'2025-08-20':84,
  '2025-08-21':51,'2025-08-22':48,'2025-08-25':69,'2025-08-26':68,
  '2025-08-27':78,'2025-08-28':61,'2025-08-29':56,'2025-08-30':1,'2025-08-31':1,
  // September
  '2025-09-02':93,'2025-09-03':72,'2025-09-04':83,'2025-09-05':61,
  '2025-09-08':52,'2025-09-09':77,'2025-09-10':68,'2025-09-11':82,
  '2025-09-12':81,'2025-09-15':74,'2025-09-16':61,'2025-09-17':79,
  '2025-09-18':80,'2025-09-19':91,'2025-09-20':2,'2025-09-21':1,
  '2025-09-22':78,'2025-09-23':54,'2025-09-24':68,'2025-09-25':85,
  '2025-09-26':90,'2025-09-29':58,'2025-09-30':63,
  // October
  '2025-10-01':61,'2025-10-02':55,'2025-10-03':69,'2025-10-06':67,
  '2025-10-07':68,'2025-10-08':68,'2025-10-09':71,'2025-10-10':50,
  '2025-10-11':3,'2025-10-13':85,'2025-10-14':60,'2025-10-15':81,
  '2025-10-16':60,'2025-10-17':58,'2025-10-18':11,'2025-10-20':94,
  '2025-10-21':71,'2025-10-22':86,'2025-10-23':82,'2025-10-24':80,
  '2025-10-25':1,'2025-10-26':1,'2025-10-27':81,'2025-10-28':45,
  '2025-10-29':67,'2025-10-30':66,'2025-10-31':67,
  // November
  '2025-11-03':109,'2025-11-04':62,'2025-11-05':64,'2025-11-06':74,
  '2025-11-07':62,'2025-11-08':1,'2025-11-10':71,'2025-11-11':61,
  '2025-11-12':54,'2025-11-13':67,'2025-11-14':99,'2025-11-15':1,
  '2025-11-16':1,'2025-11-17':55,'2025-11-18':66,'2025-11-19':77,
  '2025-11-20':79,'2025-11-21':81,'2025-11-22':10,'2025-11-24':68,
  '2025-11-25':75,'2025-11-26':56,'2025-11-28':53,'2025-11-29':1,
  // December
  '2025-12-01':45,'2025-12-02':60,'2025-12-03':71,'2025-12-04':57,
  '2025-12-05':57,'2025-12-06':2,'2025-12-08':85,'2025-12-09':73,
  '2025-12-10':63,'2025-12-11':87,'2025-12-12':96,'2025-12-13':2,
  '2025-12-15':94,'2025-12-16':80,'2025-12-17':93,'2025-12-18':76,
  '2025-12-19':80,'2025-12-20':7,'2025-12-22':101,'2025-12-23':89,
  '2025-12-24':37,'2025-12-26':43,'2025-12-27':2,'2025-12-28':1,
  '2025-12-29':69,'2025-12-30':57,'2025-12-31':26,
}

// XLS file per month
const XLS_FILES: Record<number, string> = {
  4:  '/Users/js/Downloads/종합현황(20250401_20250430).xls',
  6:  '/Users/js/Downloads/종합현황(20250601_20250630).xls',
  8:  '/Users/js/Downloads/종합현황(20250801_20250831).xls',
  9:  '/Users/js/Downloads/종합현황(20250901_20250930).xls',
  10: '/Users/js/Downloads/종합현황(20251001_20251031).xls',
  11: '/Users/js/Downloads/종합현황(20251101_20251130).xls',
  12: '/Users/js/Downloads/종합현황(20251201_20251231).xls',
}

// Month target totals
const MONTH_TARGET: Record<number, number> = {
  4:1538, 6:1454, 8:1594, 9:1553, 10:1608, 11:1347, 12:1553
}

// ── XLS parser ────────────────────────────────────────────────
const SERVICE_MAP: Record<string, string> = {
  'ups ground':'Ground','ground':'Ground',
  'ups next day air early':'Next Day Air Early','next day air early':'Next Day Air Early',
  'ups next day air':'Next Day Air','next day air':'Next Day Air',
  'ups 2nd day air':'2nd Day Air','2nd day air':'2nd Day Air',
}
function stripHtml(h:string){return h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}
function normDate(r:string){const s=r.trim().replace(/\D/g,'');if(s.length===8)return`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;const m=r.match(/(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
function parsePrice(h:string){const m=stripHtml(h).replace(/[$,]/g,'').match(/[\d.]+/);return m?parseFloat(m[0]):0}
function parseSvc(h:string){const t=stripHtml(h).toLowerCase();for(const[k,v]of Object.entries(SERVICE_MAP))if(t.includes(k))return v;return'Ground'}
function parseTrk(h:string){const n:string[]=[],re=/>(\s*1Z[0-9A-Z]+\s*)</g;let m:RegExpExecArray|null;while((m=re.exec(h))!==null){const t=m[1].trim();if(!n.includes(t))n.push(t)};return n}
function parseRef(h:string){const c=h.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ');return c.split('\n').map(l=>l.trim()).filter(Boolean).find(l=>/^\d+$/.test(l))??''}
function parseAddr(h:string){return h.replace(/<br\s*\/?>/gi,', ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/,\s*,/g,',').replace(/\s+/g,' ').trim().replace(/^,\s*/,'').replace(/,\s*$/,'')}

interface Row{email:string;date:string;trackings:string[];refNo:string;service:string;charge:number;upsCost:number;cod:number;shipperAddr:string;receiverAddr:string}

function parseXls(file:string, targets:Set<string>):Row[]{
  const html=fs.readFileSync(file,'utf8')
  const chunks=html.split(/<tr\b[^>]*>/i).slice(1)
  const rows:Row[]=[]
  for(const chunk of chunks){
    const tds=(chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
    if(tds.length<9)continue
    const cells=tds.map(td=>td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email=stripHtml(cells[1]);if(!email||email==='ID'||!email.includes('@'))continue
    const date=normDate(stripHtml(cells[2]));if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue
    if(!targets.has(date))continue
    const trackings=parseTrk(cells[6]);if(trackings.length===0)continue
    rows.push({email,date,trackings,refNo:parseRef(cells[6]),service:parseSvc(cells[5]),
      charge:parsePrice(cells[7]),upsCost:parsePrice(cells[8]),
      cod:cells[9]?parsePrice(cells[9]):0,
      shipperAddr:parseAddr(cells[3]),receiverAddr:parseAddr(cells[4])})
  }
  return rows
}

async function main() {
  // ── Step 1: Get current DB counts ────────────────────────────
  const dbRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date >= '2025-04-01' AND date <= '2025-12-31'
    GROUP BY date ORDER BY date`)
  const dbCounts = new Map<string,number>()
  for(const row of dbRes.rows as Array<{date:string;cnt:string}>)
    dbCounts.set(row.date.slice(0,10), parseInt(row.cnt))

  // ── Step 2: Find dates that need import ──────────────────────
  const needImport = new Map<string, number>() // date → how many short
  for(const [date, target] of Object.entries(EXCEL)){
    const db = dbCounts.get(date) ?? 0
    const diff = target - db
    if(diff > 0) needImport.set(date, diff)
  }

  console.log(`\n=== Gap Analysis ===`)
  const byMonth: Record<number, {dates:string[];total:number}> = {}
  for(const [date, short] of [...needImport.entries()].sort()){
    const m = parseInt(date.slice(5,7))
    if(!byMonth[m]) byMonth[m] = {dates:[],total:0}
    byMonth[m].dates.push(date)
    byMonth[m].total += short
    console.log(`  ${date}: DB=${dbCounts.get(date)??0}, target=${EXCEL[date]}, short=${short}`)
  }
  if(needImport.size === 0){ console.log('  All dates match!'); await pool.end(); return }

  // ── Step 3: Load existing trackings ──────────────────────────
  const existRes = await pool.query(`
    SELECT tracking_no FROM orders
    UNION
    SELECT pkg->>'tracking_no' FROM orders, jsonb_array_elements(packages) AS pkg
    WHERE packages IS NOT NULL AND jsonb_typeof(packages)='array'`)
  const exist = new Set<string>((existRes.rows as Array<{tracking_no:string}>).map(r=>r.tracking_no).filter(Boolean))

  // ── Step 4: Customer map ──────────────────────────────────────
  const custRes = await pool.query('SELECT id,email,name,sales_person FROM customers')
  const emap = new Map<string,{id:string;name:string;salesPerson:string}>(
    (custRes.rows as Array<{id:string;email:string;name:string;sales_person:string}>)
      .map(r=>[r.email.trim().toLowerCase(),{id:r.id,name:r.name,salesPerson:r.sales_person??''}])
  )

  // ── Step 5: Import month by month ────────────────────────────
  let grandInserted = 0, grandSkipped = 0

  for(const [monthStr, {dates}] of Object.entries(byMonth).sort(([a],[b])=>parseInt(a)-parseInt(b))){
    const month = parseInt(monthStr)
    const xlsFile = XLS_FILES[month]
    const mm = String(month).padStart(2,'0')

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`2025-${mm}: importing ${dates.length} dates`)
    if(!xlsFile || !fs.existsSync(xlsFile)){
      console.log(`  ⚠ XLS file missing: ${xlsFile ?? '(not configured)'}`)
      continue
    }

    const targetSet = new Set(dates)
    const rows = parseXls(xlsFile, targetSet)
    const byDate: Record<string,number> = {}
    rows.forEach(r => byDate[r.date]=(byDate[r.date]??0)+1)
    console.log(`  XLS parsed: ${rows.length} rows`)
    for(const d of dates) console.log(`    ${d}: XLS=${byDate[d]??0}, need=${needImport.get(d)??0}`)

    let inserted = 0, skipped = 0
    for(const row of rows){
      if(row.trackings.some(t=>exist.has(t))){ skipped++; continue }
      // Check if this date still needs more rows
      const d = row.date
      const target = EXCEL[d] ?? 0
      const cur = dbCounts.get(d) ?? 0
      if(cur >= target){ skipped++; continue }
      dbCounts.set(d, cur + 1)

      const email = row.email.trim().toLowerCase()
      const cust = emap.get(email) ?? null
      const pkgs = row.trackings.map((t,i)=>({
        tracking_no:t, weight:0, width:0, length:0, height:0,
        ref_no:i===0?row.refNo:'', cod_amount:i===0?row.cod:0,
        shipper_name:'', shipper_addr:row.shipperAddr,
        receiver_name:'', receiver_addr:row.receiverAddr,
      }))
      await pool.query(
        `INSERT INTO orders (id,tracking_no,date,customer_id,customer_email,customer_name,
           service_type,ups_cost,customer_charge,cod_amount,sales_person,
           total_packages,packages,ref_no)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
        [row.trackings[0],row.date,cust?.id??null,email,cust?.name??email,
         row.service,row.upsCost,row.charge,row.cod,cust?.salesPerson??null,
         row.trackings.length,JSON.stringify(pkgs),row.refNo||null]
      )
      row.trackings.forEach(t=>exist.add(t))
      inserted++
    }
    grandInserted += inserted
    grandSkipped  += skipped
    console.log(`  Inserted: ${inserted} | Skipped: ${skipped}`)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Grand total: Inserted=${grandInserted} | Skipped=${grandSkipped}`)

  // ── Step 6: Final verification ────────────────────────────────
  const finalRes = await pool.query(`
    SELECT EXTRACT(MONTH FROM date)::int as m, COUNT(*) as cnt
    FROM orders WHERE date >= '2025-04-01' AND date <= '2025-12-31'
    GROUP BY m ORDER BY m`)

  console.log('\n=== Final monthly totals ===')
  const MON=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  for(const row of finalRes.rows as Array<{m:number;cnt:string}>){
    const target = MONTH_TARGET[row.m]
    const diff = parseInt(row.cnt) - (target??0)
    const flag = target==null ? '' : diff===0 ? '✓' : diff>0 ? `+${diff}(excess)` : `${diff}(short)`
    console.log(`  ${MON[row.m]} (${row.m}): ${row.cnt}${target?` / ${target} ${flag}`:''}`)
  }
}

main().catch(e=>console.error('ERROR:',e.message)).finally(()=>pool.end())
