/**
 * diagnoseMissingRows.ts
 * Check XLS rows with no tracking or price=0 for short dates.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import * as fs from 'fs'

const XLS_FILES: Record<number, string> = {
  8:  '/Users/js/Downloads/종합현황(20250801_20250831).xls',
  9:  '/Users/js/Downloads/종합현황(20250901_20250930).xls',
  10: '/Users/js/Downloads/종합현황(20251001_20251031).xls',
  11: '/Users/js/Downloads/종합현황(20251101_20251130).xls',
  12: '/Users/js/Downloads/종합현황(20251201_20251231).xls',
}

// Short dates per month
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

function stripHtml(h: string) { return h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim() }
function normDate(r: string) {
  const s = r.trim().replace(/\D/g,'')
  if (s.length===8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  const m = r.match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:''
}
function parsePrice(h: string) { const m=stripHtml(h).replace(/[$,]/g,'').match(/[\d.]+/); return m?parseFloat(m[0]):0 }
function parseTrk(h: string) {
  const n:string[]=[]; const re=/>(\s*1Z[0-9A-Z]+\s*)</g; let m:RegExpExecArray|null
  while((m=re.exec(h))!==null){const t=m[1].trim();if(!n.includes(t))n.push(t)}; return n
}

interface RawRow {
  date: string
  email: string
  charge: number
  upsCost: number
  trackings: string[]
}

function parseXlsAll(file: string, targets: Set<string>): RawRow[] {
  const html = fs.readFileSync(file, 'utf8')
  const chunks = html.split(/<tr\b[^>]*>/i).slice(1)
  const rows: RawRow[] = []
  for (const chunk of chunks) {
    const tds = (chunk.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
    if (tds.length < 9) continue
    const cells = tds.map(td=>td.replace(/^<td[^>]*>/i,'').replace(/<\/td>\s*$/i,''))
    const email = stripHtml(cells[1]); if (!email||email==='ID'||!email.includes('@')) continue
    const date = normDate(stripHtml(cells[2])); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!targets.has(date)) continue
    rows.push({
      date,
      email,
      charge:  parsePrice(cells[7]),
      upsCost: parsePrice(cells[8]),
      trackings: parseTrk(cells[6]),
    })
  }
  return rows
}

function main() {
  console.log('=== Diagnosing missing rows (no tracking / price=0) ===\n')

  const summary: Record<string, {total:number; noTrk:number; zeroPrice:number; both:number}> = {}

  for (const [monthStr, file] of Object.entries(XLS_FILES)) {
    const month = parseInt(monthStr)
    const mm = String(month).padStart(2, '0')
    if (!fs.existsSync(file)) { console.log(`2025-${mm}: file missing`); continue }

    const rows = parseXlsAll(file, SHORT_DATES)
    const byDate: Record<string, RawRow[]> = {}
    for (const r of rows) {
      if (!byDate[r.date]) byDate[r.date] = []
      byDate[r.date].push(r)
    }

    console.log(`\n── 2025-${mm} ──`)
    for (const [date, rws] of Object.entries(byDate).sort()) {
      const noTrk    = rws.filter(r => r.trackings.length === 0)
      const zeroP    = rws.filter(r => r.charge === 0 && r.upsCost === 0 && r.trackings.length > 0)
      const bothZero = rws.filter(r => r.charge === 0 && r.upsCost === 0 && r.trackings.length === 0)

      summary[date] = {
        total:     rws.length,
        noTrk:     noTrk.length,
        zeroPrice: zeroP.length,
        both:      bothZero.length,
      }

      if (noTrk.length > 0 || zeroP.length > 0 || bothZero.length > 0) {
        console.log(`  ${date}: total=${rws.length}  no-tracking=${noTrk.length}  zero-price(has-trk)=${zeroP.length}  no-trk+zero=${bothZero.length}`)
        // Show samples
        for (const r of [...noTrk, ...zeroP, ...bothZero].slice(0, 3)) {
          console.log(`    → email=${r.email}  charge=${r.charge}  upsCost=${r.upsCost}  trackings=[${r.trackings.join(',')}]`)
        }
      } else {
        console.log(`  ${date}: total=${rws.length}  (no zero/no-trk rows)`)
      }
    }
  }

  console.log('\n=== Summary: dates where no-trk + zero-price rows exist ===')
  let totalNoTrk = 0, totalZeroP = 0
  for (const [date, s] of Object.entries(summary).sort()) {
    if (s.noTrk > 0 || s.zeroPrice > 0 || s.both > 0) {
      totalNoTrk += s.noTrk + s.both
      totalZeroP += s.zeroPrice
      console.log(`  ${date}: no-trk=${s.noTrk+s.both}  zero-price(w/trk)=${s.zeroPrice}`)
    }
  }
  console.log(`\nTotal no-tracking rows: ${totalNoTrk}`)
  console.log(`Total zero-price (has tracking): ${totalZeroP}`)
}

main()
