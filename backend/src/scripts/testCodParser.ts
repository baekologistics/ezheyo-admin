import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import { parseCodStatement } from '../services/codPdfParser'

const PDFS = [
  '/Users/js/Downloads/Returned Sample UPS_20Capital_20Statement_202025-12-24.pdf',
  '/Users/js/Downloads/Sample UPS_20Capital_20Statement_202026-01-02.pdf',
]

function sep(title: string) {
  console.log('\n' + '═'.repeat(70))
  console.log(`  ${title}`)
  console.log('═'.repeat(70))
}

function fmt(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

async function main() {
  for (const filePath of PDFS) {
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠  File not found: ${filePath}`)
      continue
    }

    const buf = fs.readFileSync(filePath)
    let stmt

    try {
      stmt = await parseCodStatement(buf)
    } catch (err) {
      console.error(`\n❌ Failed to parse ${path.basename(filePath)}: ${(err as Error).message}`)
      continue
    }

    sep(path.basename(filePath))

    console.log(`  Statement Date  : ${stmt.statementDate}`)
    console.log(`  Statement No    : ${stmt.statementNo}`)
    console.log(`  Deposit Total   : ${fmt(stmt.depositTotal)}`)
    console.log(`  COD Check Total : ${fmt(stmt.codCheckTotal)}`)
    if (stmt.returnChecksTotal > 0)
      console.log(`  Return Checks   : (${fmt(stmt.returnChecksTotal)})`)
    console.log(`  Total Packages  : ${stmt.totalPackages}`)
    console.log(`  Total Checks    : ${stmt.totalChecks}`)
    console.log(`  Records parsed  : ${stmt.records.length}`)

    console.log(`\n  ${'Tracking'.padEnd(22)} ${'Reference'.padEnd(28)} ${'Pickup'.padEnd(12)} ${'COD Amt'.padEnd(10)} ${'Chk Amt'.padEnd(10)} ${'Check#'.padEnd(7)} Ret`)
    console.log('  ' + '─'.repeat(102))

    for (const r of stmt.records) {
      const ret = r.isReturned ? '⚠ YES' : ''
      console.log(
        `  ${r.trackingNo.padEnd(22)} ${r.referenceNo.substring(0,27).padEnd(28)} ` +
        `${r.pickupDate.padEnd(12)} ${fmt(r.codAmount).padEnd(10)} ` +
        `${fmt(r.checkAmount).padEnd(10)} ${r.checkNo.padEnd(7)} ${ret}`
      )
    }

    if (stmt.returnedChecks.length > 0) {
      console.log(`\n  ── Returned Checks ──`)
      for (const rc of stmt.returnedChecks) {
        console.log(`  ${rc.statementNo}  ${rc.referenceNo}  ${rc.reason}  (${fmt(rc.amount)})  ${rc.returnedDate}`)
      }
    } else {
      console.log(`\n  Returned Checks: none`)
    }
  }

  console.log('\n✅ Done')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
