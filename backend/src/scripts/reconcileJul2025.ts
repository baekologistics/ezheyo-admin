/**
 * reconcileJul2025.ts
 * Reconcile 2025-07 against Excel targets (1569 total).
 * Gap analysis → delete excess | import missing (normal + cancelled)
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

const XLS_FILE = '/Users/js/Downloads/종합현황(20250701_20250731).xls'

const EXCEL: Record<string, number> = {
  '2025-07-01':61, '2025-07-02':61, '2025-07-03':95, '2025-07-04':2,
  '2025-07-07':95, '2025-07-08':64, '2025-07-09':67, '2025-07-10':60,
  '2025-07-11':60, '2025-07-12':1,  '2025-07-14':65, '2025-07-15':77,
  '2025-07-16':68, '2025-07-17':83, '2025-07-18':43, '2025-07-19':2,
  '2025-07-21':63, '2025-07-22':100,'2025-07-23':81, '2025-07-24':56,
  '2025-07-25':51, '2025-07-28':65, '2025-07-29':30, '2025-07-30':131,
  '2025-07-31':88,
}

// ── XLS parsers ───────────────────────────────────────────────
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
function parseRef(h:string){const c=h.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&nbsp;/g,' ');return c.split('\n').map((l:string)=>l.trim()).filter(Boolean).find((l:string)=>/^\d+$/.test(l))??''}
function parseAddr(h:string){return h.replace(/<br\s*\/?>/gi,', ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/,\s*,/g,',').replace(/\s+/g,' ').trim().replace(/^,\s*/,'').replace(/,\s*$/,'')}

interface XlsRow {
  email:string; date:string; trackings:string[]; refNo:string
  service:string; charge:number; upsCost:number; cod:number
  shipperAddr:string; receiverAddr:string
}

// Parses ALL rows (normal + cancelled)
function parseXlsAll(file:string, targets:Set<string>): XlsRow[] {
  const html = fs.readFileSync(file, 'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: XlsRow[] = []
  for (const chunk of chunks) {
    const tds = (chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
    if (tds.length < 9) continue
    const cells = tds.map(td => td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email = stripHtml(cells[1]); if (!email || email === 'ID' || !email.includes('@')) continue
    const date  = normDate(stripHtml(cells[2])); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!targets.has(date)) continue
    rows.push({
      email, date,
      trackings:   parseTrk(cells[6]),
      refNo:       parseRef(cells[6]),
      service:     parseSvc(cells[5]),
      charge:      parsePrice(cells[7]),
      upsCost:     parsePrice(cells[8]),
      cod:         cells[9] ? parsePrice(cells[9]) : 0,
      shipperAddr: parseAddr(cells[3]),
      receiverAddr:parseAddr(cells[4]),
    })
  }
  return rows
}

async function main() {
  // ── 1. DB current counts ──────────────────────────────────
  const dbRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt
    FROM orders
    WHERE date >= '2025-07-01' AND date <= '2025-07-31'
    GROUP BY date ORDER BY date`)
  const dbCounts = new Map<string,number>()
  for (const r of dbRes.rows as Array<{date:string;cnt:string}>)
    dbCounts.set(r.date.slice(0,10), parseInt(r.cnt))

  // ── 2. Gap analysis ───────────────────────────────────────
  const excelDates  = new Set(Object.keys(EXCEL))
  const allDates    = new Set([...excelDates, ...dbCounts.keys()])
  let   totalDelete = 0, totalInsert = 0

  console.log('=== Gap Analysis ===')
  const shortDates  = new Set<string>()
  const excessDates = new Set<string>()
  const orphanDates = new Set<string>()

  for (const date of [...allDates].sort()) {
    const db     = dbCounts.get(date) ?? 0
    const target = EXCEL[date] ?? 0
    if (!excelDates.has(date) && db > 0) {
      console.log(`  ${date}: DB=${db}, Excel=NONE → DELETE ALL`); orphanDates.add(date)
    } else if (db > target) {
      console.log(`  ${date}: DB=${db}, Excel=${target} → DELETE ${db - target}`); excessDates.add(date)
    } else if (db < target) {
      console.log(`  ${date}: DB=${db}, Excel=${target} → INSERT ${target - db}`); shortDates.add(date)
    } else {
      console.log(`  ${date}: DB=${db} ✓`)
    }
  }

  // ── 3. Delete orphan dates ────────────────────────────────
  for (const date of orphanDates) {
    const r = await pool.query(`DELETE FROM orders WHERE date = $1`, [date])
    totalDelete += r.rowCount ?? 0
    console.log(`\nDeleted ALL ${r.rowCount} orders on ${date}`)
  }

  // ── 4. Delete excess ─────────────────────────────────────
  for (const date of excessDates) {
    const excess = (dbCounts.get(date)!) - EXCEL[date]
    const r = await pool.query(`
      DELETE FROM orders WHERE id IN (
        SELECT id FROM orders WHERE date = $1
        ORDER BY customer_charge ASC, id ASC LIMIT $2
      )`, [date, excess])
    totalDelete += r.rowCount ?? 0
    console.log(`\nDeleted ${r.rowCount} excess on ${date}`)
  }

  // ── 5. Insert from XLS ────────────────────────────────────
  if (shortDates.size === 0) {
    console.log('\nNo insertions needed.')
  } else {
    if (!fs.existsSync(XLS_FILE)) {
      console.error(`\nERROR: XLS not found: ${XLS_FILE}`); process.exit(1)
    }

    // Customer map
    const custRes = await pool.query('SELECT id, email, name, sales_person FROM customers')
    const emap = new Map<string,{id:string;name:string;salesPerson:string}>(
      (custRes.rows as Array<{id:string;email:string;name:string;sales_person:string}>)
        .map(r => [r.email.trim().toLowerCase(), {id:r.id, name:r.name, salesPerson:r.sales_person??''}])
    )

    // Existing tracking numbers (normal) already in DB for July
    const trkRes = await pool.query(`
      SELECT DISTINCT jsonb_array_elements(packages)->>'tracking_no' AS trk
      FROM orders
      WHERE date >= '2025-07-01' AND date <= '2025-07-31'
        AND packages IS NOT NULL`)
    const existTrk = new Set<string>(
      (trkRes.rows as Array<{trk:string}>).map(r => r.trk).filter(Boolean)
    )

    // Existing VOID tracking numbers (all time) to avoid seq collisions
    const voidRes = await pool.query(`SELECT tracking_no FROM orders WHERE tracking_no LIKE 'VOID-%'`)
    const existVoid = new Set<string>(
      (voidRes.rows as Array<{tracking_no:string}>).map(r => r.tracking_no)
    )

    // Parse ALL rows (including cancelled) for short dates
    const xlsRows = parseXlsAll(XLS_FILE, shortDates)
    const byDate: Record<string, XlsRow[]> = {}
    for (const r of xlsRows) {
      if (!byDate[r.date]) byDate[r.date] = []
      byDate[r.date].push(r)
    }

    console.log(`\n── Inserting from XLS ──`)
    for (const date of [...shortDates].sort()) {
      const db     = dbCounts.get(date) ?? 0
      let   need   = EXCEL[date] - db
      const rows   = byDate[date] ?? []

      const normalRows    = rows.filter(r => r.trackings.length > 0 && r.trackings.every(t => !existTrk.has(t)))
      const cancelledRows = rows.filter(r => r.trackings.length === 0)
      console.log(`  ${date}: need=${need}, normal-new=${normalRows.length}, cancelled=${cancelledRows.length}`)

      let inserted = 0
      const dateKey = date.replace(/-/g,'')
      let   seq = 1

      // Insert normal rows first (should be 0 here since all are already in DB)
      for (const row of normalRows) {
        if (inserted >= need) break
        const email = row.email.trim().toLowerCase()
        const cust  = emap.get(email) ?? null
        const pkgs  = row.trackings.map((t, i) => ({
          tracking_no: t, weight:0, width:0, length:0, height:0,
          ref_no: i === 0 ? row.refNo : '', cod_amount: i === 0 ? row.cod : 0,
          shipper_name:'', shipper_addr:row.shipperAddr,
          receiver_name:'', receiver_addr:row.receiverAddr,
        }))
        await pool.query(
          `INSERT INTO orders
             (id,tracking_no,date,customer_id,customer_email,customer_name,
              service_type,ups_cost,customer_charge,profit,cod_amount,
              sales_person,total_packages,packages,ref_no)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
           ON CONFLICT (tracking_no) DO NOTHING`,
          [row.trackings[0], row.date, cust?.id??null, email, cust?.name??email,
           row.service, row.upsCost, row.charge, Math.max(row.charge-row.upsCost,0), row.cod,
           cust?.salesPerson??null, pkgs.length, JSON.stringify(pkgs), row.refNo||null]
        )
        row.trackings.forEach(t => existTrk.add(t))
        inserted++
      }
      need -= inserted

      // Insert cancelled rows with VOID tracking placeholder
      for (const row of cancelledRows) {
        if (inserted >= EXCEL[date] - db) break
        // Generate unique VOID tracking
        let voidTrk: string
        do {
          voidTrk = `VOID-${dateKey}-${String(seq).padStart(3,'0')}`
          seq++
        } while (existVoid.has(voidTrk))
        existVoid.add(voidTrk)

        const email = row.email.trim().toLowerCase()
        const cust  = emap.get(email) ?? null
        const pkgs  = [{
          tracking_no:voidTrk, weight:0, width:0, length:0, height:0,
          ref_no:row.refNo, cod_amount:0,
          shipper_name:'', shipper_addr:row.shipperAddr,
          receiver_name:'', receiver_addr:row.receiverAddr,
        }]
        await pool.query(
          `INSERT INTO orders
             (id,tracking_no,date,customer_id,customer_email,customer_name,
              service_type,ups_cost,customer_charge,cod_amount,
              sales_person,total_packages,packages,ref_no)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
          [voidTrk, row.date, cust?.id??null, email, cust?.name??email,
           'Ground', 0, 0, 0,
           cust?.salesPerson??null, 1, JSON.stringify(pkgs), row.refNo||null]
        )
        inserted++
      }

      totalInsert += inserted
      const dbAfter = db + inserted
      console.log(`    → inserted ${inserted} | DB now ${dbAfter} / target ${EXCEL[date]}`)
    }
  }

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`Total deleted: ${totalDelete} | Total inserted: ${totalInsert}`)

  // ── 6. Final verification ─────────────────────────────────
  const finalRes = await pool.query(`
    SELECT date::text, COUNT(*) as cnt
    FROM orders
    WHERE date >= '2025-07-01' AND date <= '2025-07-31'
    GROUP BY date ORDER BY date`)

  console.log('\n=== Final July 2025 counts ===')
  let grandTotal = 0
  for (const row of finalRes.rows as Array<{date:string;cnt:string}>) {
    const cnt    = parseInt(row.cnt)
    const target = EXCEL[row.date]
    const flag   = target == null ? '⚠(extra!)' : cnt === target ? '✓' : `✗(target=${target})`
    console.log(`  ${row.date}: ${cnt} ${flag}`)
    grandTotal += cnt
  }
  const totalTarget = Object.values(EXCEL).reduce((a,b) => a+b, 0)
  const flag = grandTotal === totalTarget ? '✓ MATCH' : `✗ off by ${grandTotal - totalTarget}`
  console.log(`\n  July total: ${grandTotal} / ${totalTarget} ${flag}`)
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
