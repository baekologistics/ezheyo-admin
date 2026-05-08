'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import styles from './cod.module.css'
import EmailPreviewModal from './EmailPreviewModal'

// ── Types ─────────────────────────────────────────────────────
export type CodRecord = {
  id: string; statementDate: string; statementNo: string
  referenceNo: string; trackingNo: string; pickupDate: string; deliveryDate: string
  codAmount: number; checkNo: string; serviceFee: number; premiumFee: number
  checkAmount: number; customerEmail: string; customer: string
  returned: boolean; claimedPayment: boolean; emailSent: boolean
  quickbookStatus: 'none' | 'bill_created' | 'paid'; paid: boolean
}
// kept for PaymentHistoryModal / CodDetailModal backward compat
export type PaymentBatch = {
  id: string; batchDate: string; customer: string; totalAmount: number
  trackingNos: string[]; status: 'pending' | 'paid'; paidDate: string; memo: string
}
export type Flag = 'returned' | 'claimedPayment' | 'emailSent' | 'paid'

type CodStatement = {
  id: string; statementNo: string; statementDate: string
  source: 'Auto' | 'Manual'; uploadedDate: string
  parsedStatus: 'Pending' | 'Parsed' | 'Failed'
  recordCount: number; usedInBatch: boolean
}
type EmailHistoryEntry = {
  id: string; date: string; customer: string; email: string
  statementNos: string[]; trackingNos: string[]; totalAmount: number
}
type PayMethod = 'QB Bill' | 'Zelle' | 'Cash' | 'Check' | ''
type PaymentEntry = {
  id: string; date: string; customer: string; amount: number
  method: PayMethod; qbBillNo: string; statementNos: string[]; memo: string; paid: boolean
}
type QbGroup = { customer: string; email: string; records: CodRecord[]; qbBillNo: string }

// ── Constants ─────────────────────────────────────────────────
const fmt   = (n: number) => `$${n.toFixed(2)}`
const today = () => new Date().toISOString().slice(0, 10)

// ── Mock data ─────────────────────────────────────────────────
const MOCK_RECORDS: CodRecord[] = [
  { id:'COD001', statementDate:'2026-01-27', statementNo:'022D1-00488', referenceNo:'REF-001', trackingNo:'1Z888BB20234567895', pickupDate:'2026-01-20', deliveryDate:'2026-01-22', codAmount:320.00, checkNo:'CHK-10041', serviceFee:5.50, premiumFee:2.00, checkAmount:312.50, customerEmail:'spark@email.com', customer:'Sarah Park',  returned:false, claimedPayment:false, emailSent:true,  quickbookStatus:'bill_created', paid:false },
  { id:'COD002', statementDate:'2026-01-27', statementNo:'022D1-00488', referenceNo:'REF-002', trackingNo:'1Z333GG70789012340', pickupDate:'2026-01-21', deliveryDate:'2026-01-23', codAmount:560.00, checkNo:'CHK-10042', serviceFee:5.50, premiumFee:2.00, checkAmount:552.50, customerEmail:'ghan@email.com',  customer:'Grace Han',   returned:false, claimedPayment:false, emailSent:false, quickbookStatus:'none',         paid:false },
  { id:'COD003', statementDate:'2026-02-10', statementNo:'022D1-00512', referenceNo:'REF-003', trackingNo:'1Z555EE50567890128', pickupDate:'2026-02-03', deliveryDate:'2026-02-05', codAmount:180.00, checkNo:'CHK-10088', serviceFee:5.50, premiumFee:0.00, checkAmount:174.50, customerEmail:'mlee@email.com',   customer:'Mike Lee',    returned:false, claimedPayment:true,  emailSent:true,  quickbookStatus:'paid',         paid:true  },
  { id:'COD004', statementDate:'2026-02-10', statementNo:'022D1-00512', referenceNo:'REF-004', trackingNo:'1Z000JJ01012345673', pickupDate:'2026-02-04', deliveryDate:'2026-02-06', codAmount:220.00, checkNo:'CHK-10089', serviceFee:5.50, premiumFee:2.00, checkAmount:212.50, customerEmail:'spark@email.com', customer:'Sarah Park',  returned:false, claimedPayment:false, emailSent:true,  quickbookStatus:'none',         paid:false },
  { id:'COD005', statementDate:'2026-03-05', statementNo:'022D1-00534', referenceNo:'REF-005', trackingNo:'1Z999BB30111222333', pickupDate:'2026-02-26', deliveryDate:'2026-02-28', codAmount:450.00, checkNo:'CHK-10120', serviceFee:5.50, premiumFee:2.00, checkAmount:442.50, customerEmail:'',               customer:'',            returned:true,  claimedPayment:false, emailSent:false, quickbookStatus:'none',         paid:false },
]

const INIT_STATEMENTS: CodStatement[] = [
  { id:'STMT001', statementNo:'022D1-00488', statementDate:'2026-01-27', source:'Manual', uploadedDate:'2026-01-28', parsedStatus:'Parsed',  recordCount:2, usedInBatch:false },
  { id:'STMT002', statementNo:'022D1-00512', statementDate:'2026-02-10', source:'Auto',   uploadedDate:'2026-02-10', parsedStatus:'Parsed',  recordCount:2, usedInBatch:true  },
  { id:'STMT003', statementNo:'022D1-00534', statementDate:'2026-03-05', source:'Manual', uploadedDate:'2026-03-05', parsedStatus:'Pending', recordCount:1, usedInBatch:false },
]

const INIT_EMAIL_HISTORY: EmailHistoryEntry[] = [
  { id:'EH001', date:'2026-01-28', customer:'Sarah Park', email:'spark@email.com', statementNos:['022D1-00488'], trackingNos:['1Z888BB20234567895'], totalAmount:312.50 },
  { id:'EH002', date:'2026-02-11', customer:'Mike Lee',   email:'mlee@email.com',  statementNos:['022D1-00512'], trackingNos:['1Z555EE50567890128'], totalAmount:174.50 },
  { id:'EH003', date:'2026-02-11', customer:'Sarah Park', email:'spark@email.com', statementNos:['022D1-00512'], trackingNos:['1Z000JJ01012345673'], totalAmount:212.50 },
]
const INIT_PAY_HISTORY: PaymentEntry[] = [
  { id:'PH001', date:'2026-02-12', customer:'Mike Lee', amount:174.50, method:'Zelle', qbBillNo:'', statementNos:['022D1-00512'], memo:'Zelle transfer', paid:true },
]

// ── QB Bill Modal ─────────────────────────────────────────────
function QbBillModal({ groups, onConfirm, onClose }: {
  groups: QbGroup[]
  onConfirm: (g: QbGroup[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<QbGroup[]>(groups.map(g => ({ ...g })))
  const update = (i: number, v: string) =>
    setDraft(p => p.map((g, j) => j === i ? { ...g, qbBillNo: v } : g))
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Create QB Bill{draft.length > 1 ? 's' : ''}</div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {draft.map((g, i) => (
            <div key={g.customer} className={styles.qbGroupBox}>
              <div className={styles.qbGroupRow}>
                <div>
                  <div className={styles.qbGroupName}>{g.customer}</div>
                  <div className={styles.qbGroupEmail}>{g.email}</div>
                </div>
                <div className={styles.qbGroupAmt}>{fmt(g.records.reduce((a, r) => a + r.checkAmount, 0))}</div>
              </div>
              <div className={styles.qbGroupField}>
                <label className={styles.fieldLabel}>QB Bill #</label>
                <input className={styles.modalInput} placeholder="e.g. BILL-00001"
                  value={g.qbBillNo} onChange={e => update(i, e.target.value)} />
              </div>
              <div className={styles.qbGroupTracking}>
                {g.records.map(r => (
                  <span key={r.id} className={styles.trackPill}>{r.trackingNo}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.sendBtn} onClick={() => onConfirm(draft)}>Confirm &amp; Create</button>
        </div>
      </div>
    </div>
  )
}

// ── Mark Paid Modal ───────────────────────────────────────────
function MarkPaidModal({ entry, onConfirm, onClose }: {
  entry: PaymentEntry
  onConfirm: (method: PayMethod, memo: string) => void
  onClose: () => void
}) {
  const [method, setMethod] = useState<PayMethod>(entry.method || 'Zelle')
  const [memo,   setMemo]   = useState(entry.memo)
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Mark as Paid</div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.markPaidInfo}>
            <span className={styles.markPaidCustomer}>{entry.customer}</span>
            <span className={styles.markPaidAmt}>{fmt(entry.amount)}</span>
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Payment Method</label>
            <select className={styles.modalInput} value={method}
              onChange={e => setMethod(e.target.value as PayMethod)}>
              {(['QB Bill', 'Zelle', 'Cash', 'Check'] as const).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Memo</label>
            <input className={styles.modalInput} placeholder="Optional note…"
              value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.sendBtn} onClick={() => onConfirm(method, memo)}>Confirm Paid</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CodPage() {
  const [records,      setRecords]      = useState<CodRecord[]>(MOCK_RECORDS)
  const [statements,   setStatements]   = useState<CodStatement[]>(INIT_STATEMENTS)
  const [selectedStmts, setSelectedStmts] = useState<Set<string>>(new Set())
  const [showAllStmts, setShowAllStmts] = useState(false)
  const [emailHistory, setEmailHistory] = useState<EmailHistoryEntry[]>(INIT_EMAIL_HISTORY)
  const [payHistory,   setPayHistory]   = useState<PaymentEntry[]>(INIT_PAY_HISTORY)
  const [historyTab,   setHistoryTab]   = useState<'email' | 'payment'>('email')
  const [recordSearch, setRecordSearch] = useState('')
  const [toast,        setToast]        = useState('')

  const [emailModal,    setEmailModal]    = useState<CodRecord[] | null>(null)
  const [qbModal,       setQbModal]       = useState<QbGroup[] | null>(null)
  const [markPaidModal, setMarkPaidModal] = useState<PaymentEntry | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Statement display ────────────────────────────────────────
  const displayedStmts = useMemo(() => {
    if (showAllStmts) return statements
    return statements.filter(s => {
      if (s.parsedStatus !== 'Parsed') return true
      return records.some(r => r.statementNo === s.statementNo && !r.paid && !r.returned)
    })
  }, [statements, records, showAllStmts])

  const parsedStmts     = displayedStmts.filter(s => s.parsedStatus === 'Parsed')
  const allStmtChecked  = parsedStmts.length > 0 && parsedStmts.every(s => selectedStmts.has(s.id))
  const someStmtChecked = parsedStmts.some(s => selectedStmts.has(s.id)) && !allStmtChecked

  const toggleAllStmts = () => {
    if (allStmtChecked) setSelectedStmts(new Set())
    else setSelectedStmts(new Set(parsedStmts.map(s => s.id)))
  }
  const toggleStmt = (id: string) =>
    setSelectedStmts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Records from selected statements ────────────────────────
  const selectedNos = useMemo(() =>
    statements.filter(s => selectedStmts.has(s.id)).map(s => s.statementNo),
    [statements, selectedStmts])

  const selectedRecords = useMemo(() =>
    selectedNos.length === 0 ? [] : records.filter(r => selectedNos.includes(r.statementNo)),
    [records, selectedNos])

  const groupedRecords = useMemo<Record<string, CodRecord[]>>(() => {
    const src = recordSearch
      ? selectedRecords.filter(r =>
          r.customer.toLowerCase().includes(recordSearch.toLowerCase()) ||
          r.trackingNo.toLowerCase().includes(recordSearch.toLowerCase()))
      : selectedRecords
    const map: Record<string, CodRecord[]> = {}
    src.forEach(r => {
      const key = r.customer || '__unmatched__'
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return map
  }, [selectedRecords, recordSearch])

  // ── Stats ────────────────────────────────────────────────────
  const unpaidCount    = records.filter(r => !r.paid && !r.returned).length
  const unmatchedCount = records.filter(r => !r.customer).length
  const totalCod       = records.reduce((a, r) => a + r.codAmount, 0)
  const totalPaidOut   = payHistory.filter(p => p.paid).reduce((a, p) => a + p.amount, 0)

  // ── File upload ───────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    setStatements(prev => [{
      id: `STMT${Date.now()}`, statementNo: 'Parsing…', statementDate: 'Parsing…',
      source: 'Manual', uploadedDate: today(), parsedStatus: 'Pending',
      recordCount: 0, usedInBatch: false,
    }, ...prev])
    e.target.value = ''
  }

  // ── Email handlers ────────────────────────────────────────────
  const handleEmailSend = (targets: CodRecord[]) => {
    const grouped: Record<string, CodRecord[]> = {}
    targets.forEach(r => { if (!grouped[r.customer]) grouped[r.customer] = []; grouped[r.customer].push(r) })
    const entries: EmailHistoryEntry[] = Object.entries(grouped).map(([customer, rows]) => ({
      id: `EH${Date.now()}${Math.random().toString(36).slice(2,6)}`,
      date: today(), customer, email: rows[0].customerEmail,
      statementNos: Array.from(new Set(rows.map(r => r.statementNo))),
      trackingNos: rows.map(r => r.trackingNo),
      totalAmount: rows.reduce((a, r) => a + r.checkAmount, 0),
    }))
    setEmailHistory(prev => [...entries, ...prev])
    setRecords(prev => prev.map(r => targets.some(t => t.id === r.id) ? { ...r, emailSent: true } : r))
    setEmailModal(null)
  }

  // ── QB Bill handlers ──────────────────────────────────────────
  const handleQbConfirm = (filled: QbGroup[]) => {
    const entries: PaymentEntry[] = filled.map(g => ({
      id: `PH${Date.now()}${Math.random().toString(36).slice(2,6)}`,
      date: today(), customer: g.customer,
      amount: g.records.reduce((a, r) => a + r.checkAmount, 0),
      method: 'QB Bill', qbBillNo: g.qbBillNo,
      statementNos: Array.from(new Set(g.records.map(r => r.statementNo))),
      memo: '', paid: false,
    }))
    setPayHistory(prev => [...entries, ...prev])
    const ids = filled.flatMap(g => g.records.map(r => r.id))
    setRecords(prev => prev.map(r => ids.includes(r.id) ? { ...r, quickbookStatus: 'bill_created' } : r))
    setQbModal(null)
  }

  // ── Mark paid ─────────────────────────────────────────────────
  const handleMarkPaid = (entry: PaymentEntry, method: PayMethod, memo: string) => {
    setPayHistory(prev => prev.map(e => e.id === entry.id ? { ...e, method, memo, paid: true } : e))
    setRecords(prev => prev.map(r =>
      entry.statementNos.includes(r.statementNo) && r.customer === entry.customer
        ? { ...r, paid: true } : r))
    setMarkPaidModal(null)
  }

  // ── QB group builder ──────────────────────────────────────────
  const makeQbGroups = (recs: CodRecord[]): QbGroup[] => {
    const map: Record<string, CodRecord[]> = {}
    recs.filter(r => r.customer && r.quickbookStatus === 'none').forEach(r => {
      if (!map[r.customer]) map[r.customer] = []
      map[r.customer].push(r)
    })
    return Object.entries(map).map(([customer, rows]) => ({
      customer, email: rows[0].customerEmail, records: rows, qbBillNo: '',
    }))
  }

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Records</span>
          <span className={styles.statVal}>{records.length}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>COD Total</span>
          <span className={styles.statVal}>{fmt(totalCod)}</span>
        </div>
        <div className={`${styles.stat} ${unpaidCount > 0 ? styles.statWarn : ''}`}>
          <span className={styles.statLabel}>Unpaid</span>
          <span className={styles.statVal}>{unpaidCount}</span>
        </div>
        <div className={`${styles.stat} ${unmatchedCount > 0 ? styles.statDanger : ''}`}>
          <span className={styles.statLabel}>Unmatched</span>
          <span className={styles.statVal}>{unmatchedCount}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Paid Out</span>
          <span className={styles.statVal}>{fmt(totalPaidOut)}</span>
        </div>
      </div>

      {/* ── Section 1: COD Statements ──────────────────────── */}
      <div className={styles.stmtSection}>
        <div className={styles.stmtHeader}>
          <div>
            <div className={styles.stmtTitle}>COD Statements</div>
            <div className={styles.stmtSub}>Select statement(s) to view and process records below</div>
          </div>
          <div className={styles.stmtActions}>
            <button className={styles.showAllToggle} onClick={() => setShowAllStmts(p => !p)}>
              {showAllStmts ? 'Unpaid Only' : 'Show All'}
            </button>
            <button className={styles.btnUpload} onClick={() => fileInputRef.current?.click()}>
              + Upload PDF
            </button>
            <button className={styles.btnGmail} onClick={() => setToast('Backend connection required')}>
              Auto Import from Gmail
              <span className={styles.comingSoon}>Coming Soon</span>
            </button>
          </div>
        </div>

        <div className={styles.stmtTableWrap}>
          <table className={styles.stmtTable}>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allStmtChecked}
                    ref={el => { if (el) el.indeterminate = someStmtChecked }}
                    onChange={toggleAllStmts} />
                </th>
                <th>Statement No</th>
                <th>Statement Date</th>
                <th>Source</th>
                <th>Uploaded Date</th>
                <th>Parsed Status</th>
                <th className={styles.thCenter}>Records</th>
                <th className={styles.thCenter}>Used in Batch</th>
              </tr>
            </thead>
            <tbody>
              {displayedStmts.length === 0 && (
                <tr><td colSpan={8} className={styles.empty}>No statements found.</td></tr>
              )}
              {displayedStmts.map(s => (
                <tr key={s.id}
                  className={selectedStmts.has(s.id) ? styles.stmtRowSelected : ''}
                  style={{ cursor: s.parsedStatus === 'Parsed' ? 'pointer' : 'default' }}
                  onClick={() => s.parsedStatus === 'Parsed' && toggleStmt(s.id)}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedStmts.has(s.id)}
                      disabled={s.parsedStatus !== 'Parsed'}
                      onChange={() => toggleStmt(s.id)} />
                  </td>
                  <td className={styles.stmtNo}>{s.statementNo}</td>
                  <td className={styles.muted}>{s.statementDate}</td>
                  <td>
                    <span className={`${styles.sourceBadge} ${s.source === 'Auto' ? styles.sourceAuto : styles.sourceManual}`}>
                      {s.source}
                    </span>
                  </td>
                  <td className={styles.muted}>{s.uploadedDate}</td>
                  <td>
                    <span className={`${styles.parsedBadge} ${
                      s.parsedStatus === 'Parsed' ? styles.parsedOk :
                      s.parsedStatus === 'Failed' ? styles.parsedFail : styles.parsedPending
                    }`}>{s.parsedStatus}</span>
                  </td>
                  <td className={styles.thCenter}>{s.recordCount > 0 ? s.recordCount : '—'}</td>
                  <td className={styles.thCenter}>
                    {s.usedInBatch
                      ? <span className={styles.usedYes}>Yes</span>
                      : <span className={styles.usedNo}>No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 2: COD Records (grouped by customer) ───── */}
      <div className={styles.recordsSection}>
        <div className={styles.recordsHeader}>
          <div>
            <div className={styles.stmtTitle}>
              COD Records
              {selectedNos.length > 0 && (
                <span className={styles.recordsCount}>
                  {selectedRecords.length} records · {selectedNos.length} statement(s)
                </span>
              )}
            </div>
            {selectedNos.length === 0 && (
              <div className={styles.stmtSub}>Select statement(s) above to view records</div>
            )}
          </div>
          {selectedNos.length > 0 && (
            <div className={styles.stmtActions}>
              <input className={styles.recordsSearch} placeholder="Search customer or tracking…"
                value={recordSearch} onChange={e => setRecordSearch(e.target.value)} />
              <button className={styles.bulkEmailBtn}
                onClick={() => {
                  const targets = selectedRecords.filter(r => r.customer && !r.emailSent)
                  targets.length > 0 ? setEmailModal(targets) : setToast('No new records to email')
                }}>
                ✉ Email to All
              </button>
              <button className={styles.bulkQbBtn}
                onClick={() => {
                  const groups = makeQbGroups(selectedRecords)
                  groups.length > 0 ? setQbModal(groups) : setToast('No records eligible for QB bills')
                }}>
                📒 QB Bills for All
              </button>
            </div>
          )}
        </div>

        {selectedNos.length === 0 ? (
          <div className={styles.recordsEmpty}>
            ☝ Select one or more statements above to view COD records grouped by customer
          </div>
        ) : Object.keys(groupedRecords).length === 0 ? (
          <div className={styles.recordsEmpty}>No matching records.</div>
        ) : (
          <div className={styles.customerGroups}>
            {Object.entries(groupedRecords).map(([key, rows]) => {
              const isUnmatched = key === '__unmatched__'
              const email       = rows[0].customerEmail
              const total       = rows.reduce((a, r) => a + r.checkAmount, 0)
              const allEmailed  = rows.every(r => r.emailSent)
              const hasUnqb     = rows.some(r => r.quickbookStatus === 'none' && !r.returned)
              return (
                <div key={key} className={styles.customerGroup}>
                  <div className={styles.customerGroupHeader}>
                    <div className={styles.customerGroupInfo}>
                      {isUnmatched
                        ? <span className={styles.unmatchedBadge}>⚠ Unmatched Records</span>
                        : <span className={styles.cgName}>{key}</span>}
                      {email && <span className={styles.cgEmail}>{email}</span>}
                    </div>
                    <div className={styles.cgRight}>
                      <span className={styles.cgTotal}>{fmt(total)}</span>
                      {!isUnmatched && (
                        <>
                          <button
                            className={`${styles.cgBtn} ${allEmailed ? styles.cgBtnDone : ''}`}
                            disabled={allEmailed}
                            onClick={() => setEmailModal(rows)}
                          >
                            {allEmailed ? '✓ Emailed' : '✉ Send Email'}
                          </button>
                          <button
                            className={`${styles.cgBtn} ${!hasUnqb ? styles.cgBtnDone : ''}`}
                            disabled={!hasUnqb}
                            onClick={() => {
                              const groups = makeQbGroups(rows)
                              if (groups.length > 0) setQbModal(groups)
                            }}
                          >
                            {hasUnqb ? '📒 Create QB Bill' : '✓ QB Created'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={styles.customerGroupRows}>
                    <table className={styles.cgTable}>
                      <thead>
                        <tr>
                          <th>Tracking No</th>
                          <th>Pickup</th>
                          <th>Delivery</th>
                          <th>COD Amt</th>
                          <th>Check #</th>
                          <th>Svc Fee</th>
                          <th>Prem</th>
                          <th>Check Amt</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className={r.returned ? styles.rowReturned : r.paid ? styles.rowPaid : ''}>
                            <td className={styles.tracking}>{r.trackingNo}</td>
                            <td className={styles.muted}>{r.pickupDate}</td>
                            <td className={styles.muted}>{r.deliveryDate}</td>
                            <td className={styles.bold}>{fmt(r.codAmount)}</td>
                            <td className={styles.mono}>{r.checkNo}</td>
                            <td className={styles.muted}>{fmt(r.serviceFee)}</td>
                            <td className={styles.muted}>{fmt(r.premiumFee)}</td>
                            <td className={styles.bold}>{fmt(r.checkAmount)}</td>
                            <td>
                              {r.returned
                                ? <span className={`${styles.cgStatus} ${styles.cgStatusReturned}`}>Returned</span>
                                : r.paid
                                  ? <span className={`${styles.cgStatus} ${styles.cgStatusPaid}`}>✓ Paid</span>
                                  : r.quickbookStatus === 'bill_created'
                                    ? <span className={`${styles.cgStatus} ${styles.cgStatusQb}`}>QB Created</span>
                                    : <span className={`${styles.cgStatus} ${styles.cgStatusPending}`}>Pending</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: COD History ──────────────────────────── */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <div className={styles.stmtTitle}>COD History</div>
          <div className={styles.historyTabs}>
            <button
              className={`${styles.historyTab} ${historyTab === 'email' ? styles.historyTabActive : ''}`}
              onClick={() => setHistoryTab('email')}>
              Email History ({emailHistory.length})
            </button>
            <button
              className={`${styles.historyTab} ${historyTab === 'payment' ? styles.historyTabActive : ''}`}
              onClick={() => setHistoryTab('payment')}>
              Payment History ({payHistory.length})
            </button>
          </div>
        </div>

        {historyTab === 'email' && (
          <div className={styles.histTableWrap}>
            <table className={styles.histTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Statement(s)</th>
                  <th>Tracking(s)</th>
                  <th className={styles.thRight}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {emailHistory.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>No email history yet.</td></tr>
                )}
                {emailHistory.map(e => (
                  <tr key={e.id}>
                    <td className={styles.muted}>{e.date}</td>
                    <td className={styles.bold}>{e.customer}</td>
                    <td className={styles.muted}>{e.email}</td>
                    <td>{e.statementNos.map(s => <span key={s} className={styles.stmtPill}>{s}</span>)}</td>
                    <td>
                      <div className={styles.trackingList}>
                        {e.trackingNos.map(t => <span key={t} className={styles.trackPill}>{t}</span>)}
                      </div>
                    </td>
                    <td className={`${styles.bold} ${styles.thRight}`}>{fmt(e.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {historyTab === 'payment' && (
          <div className={styles.histTableWrap}>
            <table className={styles.histTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className={styles.thRight}>Amount</th>
                  <th>Method</th>
                  <th>QB Bill #</th>
                  <th>Statement(s)</th>
                  <th>Memo</th>
                  <th className={styles.thCenter}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {payHistory.length === 0 && (
                  <tr><td colSpan={8} className={styles.empty}>No payment history yet.</td></tr>
                )}
                {payHistory.map(p => (
                  <tr key={p.id} className={p.paid ? styles.rowPaid : ''}>
                    <td className={styles.muted}>{p.date}</td>
                    <td className={styles.bold}>{p.customer}</td>
                    <td className={`${styles.bold} ${styles.thRight}`}>{fmt(p.amount)}</td>
                    <td>
                      {p.method
                        ? <span className={styles.methodBadge}>{p.method}</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.mono}>{p.qbBillNo || '—'}</td>
                    <td>{p.statementNos.map(s => <span key={s} className={styles.stmtPill}>{s}</span>)}</td>
                    <td className={styles.muted}>{p.memo || '—'}</td>
                    <td className={styles.thCenter}>
                      {p.paid
                        ? <span className={`${styles.badge} ${styles.badgePaid}`}>✓ Paid</span>
                        : <button className={styles.markPaidBtn} onClick={() => setMarkPaidModal(p)}>
                            Mark Paid
                          </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {emailModal && (
        <EmailPreviewModal records={emailModal} onSend={handleEmailSend} onClose={() => setEmailModal(null)} />
      )}
      {qbModal && (
        <QbBillModal groups={qbModal} onConfirm={handleQbConfirm} onClose={() => setQbModal(null)} />
      )}
      {markPaidModal && (
        <MarkPaidModal entry={markPaidModal}
          onConfirm={(m, memo) => handleMarkPaid(markPaidModal, m, memo)}
          onClose={() => setMarkPaidModal(null)} />
      )}
    </div>
  )
}
