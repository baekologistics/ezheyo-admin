/**
 * importJanApr2026.ts  (v2)
 * Import missing orders from XLS for 2026-01 ~ 2026-04.
 * - 날짜별 XLS 건수 vs DB 건수 비교 → 부족분만 insert
 * - normal rows: tracking_no 중복 skip
 * - cancelled rows (charge=0, no tracking): VOID placeholder
 * - 2026 전체 >= 2025-07-29 → ups_cost × 1.15
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'
import { pool } from '../config/database'

const XLS_FILES: Record<number, string> = {
  1: '/Users/js/Downloads/종합현황(20260101_20260131).xls',
  2: '/Users/js/Downloads/종합현황(20260201_20260228).xls',
  3: '/Users/js/Downloads/종합현황(20260301_20260331).xls',
  4: '/Users/js/Downloads/종합현황(20260401_20260430).xls',
}

const MONTH_TARGET: Record<number, number> = {
  1: 1533, 2: 1437, 3: 1754, 4: 1867,
}

const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr']

// ── XLS 파서 ──────────────────────────────────────────────────
const SERVICE_MAP: Record<string, string> = {
  'ups ground': 'Ground', 'ground': 'Ground',
  'ups next day air early': 'Next Day Air Early', 'next day air early': 'Next Day Air Early',
  'ups next day air': 'Next Day Air', 'next day air': 'Next Day Air',
  'ups 2nd day air': '2nd Day Air', '2nd day air': '2nd Day Air',
}
function stripHtml(h: string) { return h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() }
function normDate(r: string) {
  const s = r.trim().replace(/\D/g, '')
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = r.match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''
}
function parsePrice(h: string) { const m = stripHtml(h).replace(/[$,]/g, '').match(/[\d.]+/); return m ? parseFloat(m[0]) : 0 }
function parseSvc(h: string) { const t = stripHtml(h).toLowerCase(); for (const [k, v] of Object.entries(SERVICE_MAP)) if (t.includes(k)) return v; return 'Ground' }
function parseTrk(h: string) {
  const n: string[] = [], re = />(\s*1Z[0-9A-Z]+\s*)</g; let m: RegExpExecArray | null
  while ((m = re.exec(h)) !== null) { const t = m[1].trim(); if (!n.includes(t)) n.push(t) }
  return n
}
function parseRef(h: string) {
  const c = h.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
  return c.split('\n').map((l: string) => l.trim()).filter(Boolean).find((l: string) => /^\d+$/.test(l)) ?? ''
}
function parseAddr(h: string) {
  return h.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim().replace(/^,\s*/, '').replace(/,\s*$/, '')
}

interface XlsRow {
  email: string; date: string; trackings: string[]; refNo: string
  service: string; charge: number; rawUpsCost: number; cod: number
  shipperAddr: string; receiverAddr: string
}

function parseXlsAll(file: string, month: number): XlsRow[] {
  const html = fs.readFileSync(file, 'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: XlsRow[] = []
  const prefix = `2026-${String(month).padStart(2, '0')}`
  for (const chunk of chunks) {
    const tds = (chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
    if (tds.length < 9) continue
    const cells = tds.map(td => td.replace(/^<td[^>]*>/i, '').replace(/<\/td>\s*$/i, ''))
    const email = stripHtml(cells[1]); if (!email || email === 'ID' || !email.includes('@')) continue
    const date  = normDate(stripHtml(cells[2])); if (!date.startsWith(prefix)) continue
    rows.push({
      email, date,
      trackings:    parseTrk(cells[6]),
      refNo:        parseRef(cells[6]),
      service:      parseSvc(cells[5]),
      charge:       parsePrice(cells[7]),
      rawUpsCost:   parsePrice(cells[8]),
      cod:          cells[9] ? parsePrice(cells[9]) : 0,
      shipperAddr:  parseAddr(cells[3]),
      receiverAddr: parseAddr(cells[4]),
    })
  }
  return rows
}

// ── insert helpers ─────────────────────────────────────────────
async function insertNormal(
  row: XlsRow,
  emap: Map<string, { id: string; name: string; salesPerson: string }>,
  existTrk: Set<string>
): Promise<'inserted' | 'skipped'> {
  const primaryTrk = row.trackings[0]
  if (existTrk.has(primaryTrk)) return 'skipped'

  const email   = row.email.trim().toLowerCase()
  const cust    = emap.get(email) ?? null
  // 2026 전체 >= 2025-07-29 → ×1.15
  const upsCost = row.charge === 0 ? 0 : Math.round(row.rawUpsCost * 1.15 * 100) / 100
  const pkgs    = row.trackings.map((t, i) => ({
    tracking_no: t, weight: 0, width: 0, length: 0, height: 0,
    ref_no: i === 0 ? row.refNo : '', cod_amount: i === 0 ? row.cod : 0,
    shipper_name: '', shipper_addr: row.shipperAddr,
    receiver_name: '', receiver_addr: row.receiverAddr,
  }))

  const res = await pool.query(
    `INSERT INTO orders
       (id,tracking_no,date,customer_id,customer_email,customer_name,
        service_type,ups_cost,customer_charge,cod_amount,
        sales_person,total_packages,packages,ref_no)
     VALUES
       (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     ON CONFLICT (tracking_no) DO NOTHING`,
    [primaryTrk, row.date,
     cust?.id ?? null, email, cust?.name ?? email,
     row.service, upsCost, row.charge, row.cod,
     cust?.salesPerson ?? null,
     pkgs.length, JSON.stringify(pkgs), row.refNo || null]
  )
  if ((res.rowCount ?? 0) > 0) { existTrk.add(primaryTrk); return 'inserted' }
  return 'skipped'
}

async function insertCancelled(
  row: XlsRow,
  voidTrk: string,
  emap: Map<string, { id: string; name: string; salesPerson: string }>
): Promise<void> {
  const email = row.email.trim().toLowerCase()
  const cust  = emap.get(email) ?? null
  const pkgs  = [{
    tracking_no: voidTrk, weight: 0, width: 0, length: 0, height: 0,
    ref_no: row.refNo, cod_amount: 0,
    shipper_name: '', shipper_addr: row.shipperAddr,
    receiver_name: '', receiver_addr: row.receiverAddr,
  }]
  await pool.query(
    `INSERT INTO orders
       (id,tracking_no,date,customer_id,customer_email,customer_name,
        service_type,ups_cost,customer_charge,cod_amount,
        sales_person,total_packages,packages,ref_no)
     VALUES
       (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
    [voidTrk, row.date,
     cust?.id ?? null, email, cust?.name ?? email,
     'Ground', 0, 0, 0,
     cust?.salesPerson ?? null,
     1, JSON.stringify(pkgs), row.refNo || null]
  )
}

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  // 고객 맵
  const custRes = await pool.query('SELECT id, email, name, sales_person FROM customers')
  const emap = new Map<string, { id: string; name: string; salesPerson: string }>(
    (custRes.rows as Array<{ id: string; email: string; name: string; sales_person: string }>)
      .map(r => [r.email.trim().toLowerCase(), { id: r.id, name: r.name, salesPerson: r.sales_person ?? '' }])
  )

  // 2026년 기존 tracking_no
  const trkRes = await pool.query(`
    SELECT tracking_no FROM orders
    WHERE date >= '2026-01-01' AND date <= '2026-04-30'`)
  const existTrk = new Set<string>(
    (trkRes.rows as Array<{ tracking_no: string }>).map(r => r.tracking_no).filter(Boolean)
  )

  // 전체 VOID tracking_no
  const voidRes = await pool.query(`SELECT tracking_no FROM orders WHERE tracking_no LIKE 'VOID-%'`)
  const existVoid = new Set<string>(
    (voidRes.rows as Array<{ tracking_no: string }>).map(r => r.tracking_no)
  )

  let grandInserted = 0

  for (const [mStr, xlsFile] of Object.entries(XLS_FILES)) {
    const month  = parseInt(mStr)
    const target = MONTH_TARGET[month]
    const mm     = String(month).padStart(2, '0')
    const label  = `2026-${mm}`
    const lastDay = new Date(2026, month, 0).getDate()
    const dateStart = `${label}-01`
    const dateEnd   = `${label}-${lastDay}`

    console.log(`\n${'═'.repeat(62)}`)
    console.log(`▶  ${label} (${MON[month]})  target=${target}`)
    console.log(`${'═'.repeat(62)}`)

    if (!fs.existsSync(xlsFile)) { console.log(`  ✗ File not found`); continue }

    // DB 날짜별 현황
    const dbByDateRes = await pool.query(
      `SELECT date::text, COUNT(*) as cnt FROM orders
       WHERE date >= $1 AND date <= $2 GROUP BY date`,
      [dateStart, dateEnd]
    )
    const dbDateMap = new Map<string, number>(
      (dbByDateRes.rows as Array<{ date: string; cnt: string }>)
        .map(r => [r.date.slice(0, 10), parseInt(r.cnt)])
    )

    // XLS 파싱 → 날짜별 그룹
    const rows = parseXlsAll(xlsFile, month)
    const byDate: Record<string, { normal: XlsRow[]; cancelled: XlsRow[] }> = {}
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = { normal: [], cancelled: [] }
      if (r.trackings.length > 0) byDate[r.date].normal.push(r)
      else                         byDate[r.date].cancelled.push(r)
    }

    console.log(`  XLS: ${rows.length} rows  (normal=${rows.filter(r=>r.trackings.length>0).length}, cancelled=${rows.filter(r=>r.trackings.length===0).length})`)

    let mInserted = 0, mSkipped = 0

    for (const [date, { normal: normalRows, cancelled: cancelledRows }] of Object.entries(byDate).sort()) {
      const dbCur    = dbDateMap.get(date) ?? 0
      const xlsTotal = normalRows.length + cancelledRows.length
      let   dateDb   = dbCur  // running count for this date

      if (dateDb >= xlsTotal) continue  // already at or above target for this date

      // 1) Normal rows
      for (const row of normalRows) {
        if (dateDb >= xlsTotal) break
        const result = await insertNormal(row, emap, existTrk)
        if (result === 'inserted') { dateDb++; mInserted++ }
        else mSkipped++
      }

      // 2) Cancelled rows — insert until this date is filled
      const dateKey = date.replace(/-/g, '')
      let seq = 1
      for (const row of cancelledRows) {
        if (dateDb >= xlsTotal) break

        let voidTrk: string
        do {
          voidTrk = `VOID-${dateKey}-${String(seq).padStart(3, '0')}`
          seq++
        } while (existVoid.has(voidTrk))
        existVoid.add(voidTrk)
        existTrk.add(voidTrk)

        await insertCancelled(row, voidTrk, emap)
        dateDb++
        mInserted++
      }
    }

    grandInserted += mInserted

    const finalRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM orders WHERE date >= $1 AND date <= $2`,
      [dateStart, dateEnd]
    )
    const finalCount = parseInt((finalRes.rows[0] as { cnt: string }).cnt)
    const flag = finalCount === target ? '✓ MATCH' : `✗ (off ${finalCount - target})`
    console.log(`  Inserted=${mInserted}  Skipped=${mSkipped}`)
    console.log(`  DB: ${finalCount} / ${target} ${flag}`)
  }

  // ── 최종 요약 ────────────────────────────────────────────
  console.log(`\n${'═'.repeat(62)}`)
  console.log(`Grand total inserted: ${grandInserted}`)

  const summary = await pool.query(`
    SELECT EXTRACT(MONTH FROM date)::int as month,
           COUNT(*) as total,
           COUNT(CASE WHEN customer_charge = 0 THEN 1 END) as cancelled
    FROM orders
    WHERE date >= '2026-01-01' AND date <= '2026-04-30'
    GROUP BY month ORDER BY month`)

  console.log('\n=== 최종 현황 ===')
  for (const row of summary.rows as Array<{ month: number; total: string; cancelled: string }>) {
    const target = MONTH_TARGET[row.month]
    const total  = parseInt(row.total)
    const flag   = total === target ? '✓' : `✗ (off ${total - target})`
    console.log(`  ${MON[row.month]} (${row.month}): ${total} / ${target} ${flag}  cancelled=${row.cancelled}`)
  }
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
