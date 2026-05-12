import { PDFParse } from 'pdf-parse'

// ── Public types ──────────────────────────────────────────────

export interface ParsedRecord {
  referenceNo:  string    // 수령인 상호 (Package Reference Number)
  trackingNo:   string    // UPS 1Z tracking
  pickupDate:   string    // YYYY-MM-DD
  deliveryDate: string    // YYYY-MM-DD
  checkNo:      string    // check number (empty string if none)
  codAmount:    number    // C.O.D. Amount
  serviceFee:   number
  premiumFee:   number
  checkAmount:  number
  isReturned:   boolean   // true if this tracking appears in returnedChecks
}

export interface ReturnedCheck {
  statementNo:  string
  referenceNo:  string
  reason:       string    // "Stop Payment", "NSF", etc.
  amount:       number    // positive value (stored as negative in deposits)
  returnedDate: string    // YYYY-MM-DD
}

export interface ParsedStatement {
  statementDate:      string    // YYYY-MM-DD
  statementNo:        string
  depositTotal:       number
  codCheckTotal:      number
  returnChecksTotal:  number    // 0 if none
  totalPackages:      number
  totalChecks:        number
  records:            ParsedRecord[]
  returnedChecks:     ReturnedCheck[]
}

// ── Helpers ───────────────────────────────────────────────────

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[$,()]/g, '')) || 0
}

const MONTH_MAP: Record<string, string> = {
  january:   '01', february: '02', march:    '03',
  april:     '04', may:      '05', june:     '06',
  july:      '07', august:   '08', september:'09',
  october:   '10', november: '11', december: '12',
}

/** "March 15, 2025" → { year:2025, month:'03', day:'15' } */
function parseStatementDate(raw: string): { year: number; month: string; day: string } | null {
  const m = raw.trim().match(/^(\w+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (!m) return null
  const month = MONTH_MAP[m[1].toLowerCase()]
  if (!month) return null
  return {
    year:  parseInt(m[3]),
    month,
    day:   m[2].padStart(2, '0'),
  }
}

/**
 * Convert MM/DD to YYYY-MM-DD using statement year.
 * If statementMonth is Jan (01) and pickupMonth is Dec (12) → previous year.
 */
function toFullDate(mmdd: string, stmtYear: number, stmtMonth: string): string {
  const [mm, dd] = mmdd.split('/')
  let year = stmtYear
  if (stmtMonth === '01' && mm === '12') year -= 1
  if (stmtMonth === '12' && mm === '01') year += 1  // edge case: new year crossing
  return `${year}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
}

/** "12/23/2025" → "2025-12-23" */
function fullDateFromSlash(s: string): string {
  const [mm, dd, yyyy] = s.split('/')
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
}

// ── Core parser ───────────────────────────────────────────────

export async function parseCodStatement(buffer: Buffer): Promise<ParsedStatement> {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text   = result.text as string

  const lines = text.split('\n').map(l => l.trimEnd())

  // ── 1. Statement header ──────────────────────────────────────

  // "February 04, 2025\tStatement Date" or just "February 04, 2025  Statement Date"
  let statementDateRaw = ''
  let statementNo      = ''
  let depositTotal     = 0
  let codCheckTotal    = 0
  let returnChecksTotal = 0
  let totalPackages    = 0
  let totalChecks      = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Statement Date
    if (!statementDateRaw && /Statement Date/.test(line)) {
      const m = line.match(/^(.+?)\s*(?:\t|\s{2,})Statement Date/)
      if (m) statementDateRaw = m[1].trim()
    }

    // Statement Number
    if (!statementNo) {
      const m = line.match(/Statement Number\s+(\S+)/)
      if (m) statementNo = m[1]
    }

    // Deposit Total (Remittance Summary line: "Deposit Total: $X.XX")
    if (!depositTotal) {
      const m = line.match(/Deposit Total:\s*\$([\d,]+\.\d{2})/)
      if (m) depositTotal = parseDollar(m[1])
    }

    // COD Check Total — two formats:
    //   Format A (same line):  "C.O.D. Check Total $4,003.50"
    //   Format B (split lines): "C.O.D. Check Total\n...\nReturn Checks\n...\n$3,671.10\n($615.00)"
    if (!codCheckTotal) {
      const mSame = line.match(/C\.O\.D\. Check Total\s*\$([\d,]+\.\d{2})/)
      if (mSame) {
        codCheckTotal = parseDollar(mSame[1])
      } else if (/C\.O\.D\. Check Total/.test(line)) {
        // Amount is on a later line — scan forward for the next bare dollar amount
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
          const next = lines[j].trim()
          const mAmt = next.match(/^\$([\d,]+\.\d{2})$/)
          if (mAmt) { codCheckTotal = parseDollar(mAmt[1]); break }
        }
      }
    }

    // Return Checks — three formats:
    //   Format A (same line): "Return Checks ($615.00)"
    //   Format B (split):     "Return Checks\n...\n($615.00)"  (parenthesised = negative)
    //   Format C (in header): standalone line "Return Checks" then bare parenthesised amt
    if (!returnChecksTotal) {
      const mSame = line.match(/Return Checks?\s+\(\$([\d,]+\.\d{2})\)/)
      if (mSame) {
        returnChecksTotal = parseDollar(mSame[1])
      } else if (/^Return Checks?\s*$/.test(line)) {
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
          const next = lines[j].trim()
          const mAmt = next.match(/^\(\$([\d,]+\.\d{2})\)$/)
          if (mAmt) { returnChecksTotal = parseDollar(mAmt[1]); break }
        }
      }
    }

    // Total Packages/Checks — numbers appear on lines BEFORE their labels
    // Pattern: "\n10\n10\nTotal Packages Processed:\nTotal Checks Processed:"
    if (/Total Packages Processed/.test(line) && !totalPackages) {
      // look back for a number
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const prev = lines[j].trim()
        if (/^\d+$/.test(prev)) {
          if (!totalPackages) totalPackages = parseInt(prev)
          else if (!totalChecks) { totalChecks = parseInt(prev); break }
        }
      }
    }
    if (/Total Checks Processed/.test(line) && !totalChecks) {
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const prev = lines[j].trim()
        if (/^\d+$/.test(prev)) { totalChecks = parseInt(prev); break }
      }
    }
  }

  // Parse statement date into components
  const dateParsed = parseStatementDate(statementDateRaw)
  const statementDate = dateParsed
    ? `${dateParsed.year}-${dateParsed.month}-${dateParsed.day}`
    : ''

  // ── 2. Remittance Detail records ─────────────────────────────

  const records: ParsedRecord[] = []

  for (const line of lines) {
    // All record lines start with a UPS 1Z tracking number
    if (!/^1Z[A-Z0-9]{16,}/.test(line)) continue

    // Split on tab characters
    const parts = line.split('\t')
    if (parts.length < 2) continue

    const trackingNo = parts[0].trim()

    // ── Parse part[1]: "REFERENCE_NAME MM/DD $COD_AMT"
    //    or for multi-check continuations: "REFERENCE_NAME $0.00"
    const part1 = parts[1].trim()

    // Extract dollar amount at end of part1
    const codMatch = part1.match(/\$([\d,]+\.\d{2})$/)
    const codAmount = codMatch ? parseDollar(codMatch[1]) : 0

    // Extract pickup date (MM/DD) — may not be present in continuation rows
    const pickupMatch = part1.match(/(\d{1,2}\/\d{2})\s+\$[\d,]+\.\d{2}$/)
    let pickupDate = ''
    if (pickupMatch && dateParsed) {
      pickupDate = toFullDate(pickupMatch[1], dateParsed.year, dateParsed.month)
    }

    // Reference name = everything before the date (or before the dollar if no date)
    const refEnd = pickupMatch
      ? part1.indexOf(pickupMatch[1])
      : (codMatch ? part1.lastIndexOf('$' + codMatch[1]) : part1.length)
    const referenceNo = part1.substring(0, refEnd).trim()

    // ── Parse remaining parts for check_no, delivery_date, amounts
    let checkNo      = ''
    let deliveryDate = ''
    let checkAmount  = 0
    let serviceFee   = 0
    let premiumFee   = 0

    // Determine if the next part is a check number or already delivery+amounts
    // Check number: pure integer (3-6 digits)
    // Delivery+amounts: starts with a date or a dollar sign
    let deliveryPart = ''
    let partIdx = 2

    if (parts.length > 2) {
      const candidate = parts[2].trim()
      if (/^\d{2,6}$/.test(candidate)) {
        // It's a check number
        checkNo     = candidate
        deliveryPart = parts[3]?.trim() ?? ''
        partIdx = 3
      } else {
        deliveryPart = candidate
      }
    }

    // Parse delivery part: "[MM/DD] $CHECK_AMT $SVC_FEE $PREM_FEE [NOTE_FLAGS]"
    if (deliveryPart) {
      const delivMatch = deliveryPart.match(/^(\d{1,2}\/\d{2})/)
      if (delivMatch && dateParsed) {
        deliveryDate = toFullDate(delivMatch[1], dateParsed.year, dateParsed.month)
      }

      // All dollar amounts in order: check_amount, service_fee, premium_fee
      const amtMatches = [...deliveryPart.matchAll(/\$([\d,]+\.\d{2})/g)]
      if (amtMatches[0]) checkAmount = parseDollar(amtMatches[0][1])
      if (amtMatches[1]) serviceFee  = parseDollar(amtMatches[1][1])
      if (amtMatches[2]) premiumFee  = parseDollar(amtMatches[2][1])
    }

    records.push({
      referenceNo,
      trackingNo,
      pickupDate,
      deliveryDate,
      checkNo,
      codAmount,
      serviceFee,
      premiumFee,
      checkAmount,
      isReturned: false,  // filled in below
    })
  }

  // ── 3. Activity Summary — Returned Checks ───────────────────

  const returnedChecks: ReturnedCheck[] = []

  // Find "Activity Summary" section
  let inActivity = false
  for (const line of lines) {
    if (/Activity Summary/.test(line)) { inActivity = true; continue }
    if (!inActivity) continue
    if (/Estimated Pending Settlements/.test(line)) break  // end of section

    // Skip table header lines
    if (/Statement Date|Package Reference|Returned Date|Returned Checks/.test(line)) continue

    // Actual returned check line format (from real PDF):
    //   "12/24/2025 353D1-00126 Stop Payment ($615.00) 12/23/2025\tVIP BEAUTY SUPPLY"
    //   stmtDate   stmtNo      reason        amount    returnedDate  tab  reference
    const mNew = line.match(
      /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+-\d+)\s+(.+?)\s+\(\$([\d,]+\.\d{2})\)\s+(\d{1,2}\/\d{1,2}\/\d{4})\t(.+)$/
    )
    if (mNew) {
      returnedChecks.push({
        statementNo:  mNew[2],
        referenceNo:  mNew[6].trim(),
        reason:       mNew[3].trim(),
        amount:       parseDollar(mNew[4]),
        returnedDate: fullDateFromSlash(mNew[5]),
      })
      continue
    }

    // Legacy / alternate format: "<STMT_NO> <REFERENCE> <REASON> ($AMT) <DATE>"
    const mLegacy = line.match(
      /^(\w+-\d+)\s+(.+?)\s+([\w\s]+)\s+\(\$([\d,]+\.\d{2})\)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/
    )
    if (mLegacy) {
      returnedChecks.push({
        statementNo:  mLegacy[1],
        referenceNo:  mLegacy[2].trim(),
        reason:       mLegacy[3].trim(),
        amount:       parseDollar(mLegacy[4]),
        returnedDate: fullDateFromSlash(mLegacy[5]),
      })
    }
  }

  // ── 3b. Forward pickup_date from first occurrence to continuation rows ──
  // e.g. JARY RAMIREZ split across 3 rows — rows 2,3 have empty pickupDate
  const lastPickup = new Map<string, string>()
  for (const rec of records) {
    if (rec.pickupDate) {
      lastPickup.set(rec.trackingNo, rec.pickupDate)
    } else {
      const prev = lastPickup.get(rec.trackingNo)
      if (prev) rec.pickupDate = prev
    }
  }

  // ── 4. Mark returned records ─────────────────────────────────
  // Map returned by referenceNo (tracking not directly in Activity Summary)
  const returnedRefs = new Set(returnedChecks.map(r => r.referenceNo.toLowerCase()))
  for (const rec of records) {
    if (returnedRefs.has(rec.referenceNo.toLowerCase())) {
      rec.isReturned = true
    }
  }

  return {
    statementDate,
    statementNo,
    depositTotal,
    codCheckTotal,
    returnChecksTotal,
    totalPackages,
    totalChecks,
    records,
    returnedChecks,
  }
}
