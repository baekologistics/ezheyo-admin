/**
 * importFeb2025Gap.ts
 * Import missing orders for 2025-02-11 (-26) and 2025-02-27 (-32) from XLS.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

const FILE         = '/Users/js/Downloads/종합현황(20250201_20250228).xls'
const TARGET_DATES = new Set(['2025-02-11', '2025-02-27'])

const EXCEL: Record<string, number> = {
  '2025-02-11': 56,
  '2025-02-27': 62,
}

const SERVICE_MAP: Record<string, string> = {
  'ups ground': 'Ground', 'ground': 'Ground',
  'ups next day air early': 'Next Day Air Early', 'next day air early': 'Next Day Air Early',
  'ups next day air': 'Next Day Air', 'next day air': 'Next Day Air',
  'ups 2nd day air': '2nd Day Air', '2nd day air': '2nd Day Air',
}

function stripHtml(h: string) { return h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() }
function normDate(r: string) {
  const s = r.trim().replace(/\D/g,'')
  if (s.length===8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = r.match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:''
}
function parsePrice(h: string) { const m=stripHtml(h).replace(/[$,]/g,'').match(/[\d.]+/); return m?parseFloat(m[0]):0 }
function parseSvc(h: string) { const t=stripHtml(h).toLowerCase(); for(const[k,v]of Object.entries(SERVICE_MAP))if(t.includes(k))return v; return'Ground' }
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

interface Row {
  email:string; date:string; trackings:string[]; refNo:string; service:string
  charge:number; upsCost:number; cod:number; shipperAddr:string; receiverAddr:string
}

function parseXls(file: string, targets: Set<string>): Row[] {
  const html = fs.readFileSync(file,'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: Row[] = []
  for(const chunk of chunks) {
    const tds = (chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
    if(tds.length<9) continue
    const cells = tds.map(td=>td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email=stripHtml(cells[1]); if(!email||email==='ID'||!email.includes('@')) continue
    const date=normDate(stripHtml(cells[2])); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if(!targets.has(date)) continue
    const trackings=parseTrk(cells[6]); if(trackings.length===0) continue
    rows.push({ email, date, trackings,
      refNo:parseRef(cells[6]), service:parseSvc(cells[5]),
      charge:parsePrice(cells[7]), upsCost:parsePrice(cells[8]),
      cod:cells[9]?parsePrice(cells[9]):0,
      shipperAddr:parseAddr(cells[3]), receiverAddr:parseAddr(cells[4]) })
  }
  return rows
}

async function main() {
  if (!fs.existsSync(FILE)) { console.error('File not found:', FILE); process.exit(1) }

  const rows = parseXls(FILE, TARGET_DATES)
  const byDate: Record<string,number> = {}
  rows.forEach(r => byDate[r.date]=(byDate[r.date]??0)+1)
  console.log('XLS parsed:', rows.length, 'rows for target dates')
  Object.entries(byDate).sort().forEach(([d,n]) => console.log(`  ${d}: ${n} (target: ${EXCEL[d]})`))

  // Existing trackings
  const existRes = await pool.query(`
    SELECT tracking_no FROM orders
    UNION
    SELECT pkg->>'tracking_no' FROM orders, jsonb_array_elements(packages) AS pkg
    WHERE packages IS NOT NULL AND jsonb_typeof(packages)='array'`)
  const exist = new Set<string>((existRes.rows as Array<{tracking_no:string}>).map(r=>r.tracking_no).filter(Boolean))

  // Customer map
  const custRes = await pool.query('SELECT id,email,name,sales_person FROM customers')
  const emap = new Map<string,{id:string;name:string;salesPerson:string}>(
    (custRes.rows as Array<{id:string;email:string;name:string;sales_person:string}>)
      .map(r=>[r.email.trim().toLowerCase(),{id:r.id,name:r.name,salesPerson:r.sales_person??''}])
  )

  let inserted=0, skipped=0
  for(const row of rows) {
    if(row.trackings.some(t=>exist.has(t))) { skipped++; continue }
    const email=row.email.trim().toLowerCase()
    const cust=emap.get(email)??null
    const pkgs=row.trackings.map((t,i)=>({
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

  console.log(`\nInserted: ${inserted} | Skipped (dup): ${skipped}`)

  // Final verification
  const res = await pool.query(`
    SELECT date::text, COUNT(*) as cnt FROM orders
    WHERE date>='2025-02-01' AND date<='2025-02-28' GROUP BY date ORDER BY date`)

  console.log('\n=== February 2025 final ===')
  const FULL_EXCEL: Record<string,number> = {
    '2025-02-01':1,'2025-02-02':14,'2025-02-03':54,
    '2025-02-04':34,'2025-02-05':34,'2025-02-06':38,
    '2025-02-07':48,'2025-02-08':2,'2025-02-10':55,
    '2025-02-11':56,'2025-02-12':35,'2025-02-13':54,
    '2025-02-14':51,'2025-02-17':41,'2025-02-18':33,
    '2025-02-19':45,'2025-02-20':41,'2025-02-21':42,
    '2025-02-24':67,'2025-02-25':36,'2025-02-26':52,
    '2025-02-27':62,'2025-02-28':42
  }
  for(const row of res.rows as Array<{date:string;cnt:string}>) {
    const d=row.date.slice(0,10); const t=FULL_EXCEL[d]??0; const diff=parseInt(row.cnt)-t
    console.log(`  ${d}: ${row.cnt} / ${t} ${diff===0?'✓':diff>0?'+'+diff+' (excess)':diff+' (short)'}`)
  }
  const total = await pool.query("SELECT COUNT(*) FROM orders WHERE date>='2025-02-01' AND date<='2025-02-28'")
  console.log(`\nFebruary 2025 total: ${total.rows[0].count} / 937`)
}

main().catch(e=>console.error('ERROR:',e.message)).finally(()=>pool.end())
