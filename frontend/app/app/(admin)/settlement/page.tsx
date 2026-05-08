'use client'
import { useState, useMemo } from 'react'
import styles from './settlement.module.css'

// ── Types ──────────────────────────────────────────────────────
type PaymentMethod = 'Zelle' | 'Check' | 'Wire' | 'ACH' | 'Cash' | ''

type SplitLine = {
  id: string
  amount: string
  method: PaymentMethod
  date: string
  memo: string
}

type PayRecord = {
  id: string
  month: string
  target: 'baeko' | 'sales'
  salesPerson: string
  lines: SplitLine[]
}

type Shipment = {
  id: string; date: string; trackingNo: string; customer: string
  salesPerson: string; customerCharge: number; upsCost: number
}

type HistoryRow = {
  month: string; revenue: number; upsCost: number
  netProfit: number; baekoAmt: number; salesAmt: number; overheadAmt: number
}

// ── Constants ──────────────────────────────────────────────────
const SALES_PERSONS = ['Alice Yoon', 'Brian Cho', 'Carol Lim', 'David Park']
const ALL_METHODS: PaymentMethod[] = ['Zelle', 'Check', 'Wire', 'ACH', 'Cash']
const HISTORY_MONTHS = ['2026-02', '2026-01', '2025-12', '2025-11']

// ── Mock Shipments ─────────────────────────────────────────────
const MOCK_SHIPMENTS: Shipment[] = [
  // 2026-01
  { id:'S001', date:'2026-01-03', trackingNo:'1Z999AA10123456784', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:28.40, upsCost:18.20 },
  { id:'S002', date:'2026-01-05', trackingNo:'1Z888BB20234567895', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:54.10, upsCost:38.60 },
  { id:'S003', date:'2026-01-08', trackingNo:'1Z777CC30345678906', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:19.80, upsCost:12.40 },
  { id:'S004', date:'2026-01-12', trackingNo:'1Z666DD40456789017', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:42.00, upsCost:29.50 },
  { id:'S005', date:'2026-01-15', trackingNo:'1Z555EE50567890128', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:33.60, upsCost:21.80 },
  { id:'S006', date:'2026-01-18', trackingNo:'1Z444FF60678901239', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:61.20, upsCost:44.30 },
  { id:'S007', date:'2026-01-20', trackingNo:'1Z333GG70789012340', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:25.50, upsCost:16.70 },
  { id:'S008', date:'2026-01-22', trackingNo:'1Z222HH80890123451', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:47.90, upsCost:33.10 },
  { id:'S009', date:'2026-01-25', trackingNo:'1Z111II90901234562', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:38.00, upsCost:25.60 },
  { id:'S010', date:'2026-01-28', trackingNo:'1Z000JJ01012345673', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:72.40, upsCost:51.20 },
  // 2026-02
  { id:'S011', date:'2026-02-02', trackingNo:'1Z999AA11234567891', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:31.60, upsCost:20.40 },
  { id:'S012', date:'2026-02-05', trackingNo:'1Z888BB21234567892', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:58.20, upsCost:41.30 },
  { id:'S013', date:'2026-02-07', trackingNo:'1Z777CC31234567893', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:45.80, upsCost:31.60 },
  { id:'S014', date:'2026-02-10', trackingNo:'1Z666DD41234567894', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:22.40, upsCost:14.80 },
  { id:'S015', date:'2026-02-12', trackingNo:'1Z555EE51234567895', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:67.10, upsCost:48.20 },
  { id:'S016', date:'2026-02-14', trackingNo:'1Z444FF61234567896', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:39.50, upsCost:26.90 },
  { id:'S017', date:'2026-02-17', trackingNo:'1Z333GG71234567897', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:83.00, upsCost:60.10 },
  { id:'S018', date:'2026-02-19', trackingNo:'1Z222HH81234567898', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:29.80, upsCost:19.20 },
  { id:'S019', date:'2026-02-21', trackingNo:'1Z111II91234567899', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:54.60, upsCost:38.40 },
  { id:'S020', date:'2026-02-24', trackingNo:'1Z000JJ01234567900', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:36.20, upsCost:24.50 },
  { id:'S021', date:'2026-02-26', trackingNo:'1Z999AA21234567901', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:44.70, upsCost:30.80 },
  // 2026-03
  { id:'S022', date:'2026-03-03', trackingNo:'1Z888BB31234567902', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:62.30, upsCost:44.80 },
  { id:'S023', date:'2026-03-05', trackingNo:'1Z777CC31234567903', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:50.10, upsCost:35.60 },
  { id:'S024', date:'2026-03-07', trackingNo:'1Z666DD41234567904', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:27.90, upsCost:18.10 },
  { id:'S025', date:'2026-03-10', trackingNo:'1Z555EE51234567905', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:91.40, upsCost:66.30 },
  { id:'S026', date:'2026-03-12', trackingNo:'1Z444FF61234567906', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:34.20, upsCost:22.50 },
  { id:'S027', date:'2026-03-14', trackingNo:'1Z333GG71234567907', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:48.80, upsCost:33.70 },
  { id:'S028', date:'2026-03-17', trackingNo:'1Z222HH81234567908', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:71.50, upsCost:51.90 },
  { id:'S029', date:'2026-03-19', trackingNo:'1Z111II91234567909', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:23.60, upsCost:15.40 },
  { id:'S030', date:'2026-03-21', trackingNo:'1Z000JJ01234567910', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:55.80, upsCost:39.20 },
  { id:'S031', date:'2026-03-24', trackingNo:'1Z999AA31234567911', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:38.90, upsCost:26.10 },
  { id:'S032', date:'2026-03-26', trackingNo:'1Z888BB41234567912', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:66.40, upsCost:47.60 },
  { id:'S033', date:'2026-03-28', trackingNo:'1Z777CC41234567913', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:43.70, upsCost:29.90 },
  // 2026-04
  { id:'S034', date:'2026-04-01', trackingNo:'1Z666DD51234567914', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:78.20, upsCost:56.10 },
  { id:'S035', date:'2026-04-03', trackingNo:'1Z555EE61234567915', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:31.50, upsCost:20.80 },
  { id:'S036', date:'2026-04-05', trackingNo:'1Z444FF71234567916', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:19.60, upsCost:12.30 },
  { id:'S037', date:'2026-04-08', trackingNo:'1Z333GG81234567917', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:53.40, upsCost:37.80 },
  { id:'S038', date:'2026-04-10', trackingNo:'1Z222HH91234567918', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:44.90, upsCost:31.20 },
  { id:'S039', date:'2026-04-12', trackingNo:'1Z111II01234567919', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:36.70, upsCost:24.50 },
  { id:'S040', date:'2026-04-14', trackingNo:'1Z000JJ11234567920', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:62.80, upsCost:44.90 },
  { id:'S041', date:'2026-04-16', trackingNo:'1Z999AA41234567921', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:27.30, upsCost:17.60 },
  { id:'S042', date:'2026-04-18', trackingNo:'1Z888BB51234567922', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:71.60, upsCost:51.40 },
  { id:'S043', date:'2026-04-21', trackingNo:'1Z777CC51234567923', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:49.30, upsCost:34.70 },
  { id:'S044', date:'2026-04-23', trackingNo:'1Z666DD61234567924', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:85.10, upsCost:61.80 },
  { id:'S045', date:'2026-04-25', trackingNo:'1Z555EE71234567925', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:40.20, upsCost:27.40 },
  // 2026-05
  { id:'S046', date:'2026-05-01', trackingNo:'1Z444FF81234567926', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:24.80, upsCost:16.10 },
  { id:'S047', date:'2026-05-02', trackingNo:'1Z333GG91234567927', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:58.60, upsCost:41.70 },
  { id:'S048', date:'2026-05-03', trackingNo:'1Z222HH01234567928', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:47.30, upsCost:33.40 },
  { id:'S049', date:'2026-05-05', trackingNo:'1Z111II11234567929', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:35.90, upsCost:23.60 },
  { id:'S050', date:'2026-05-06', trackingNo:'1Z000JJ21234567930', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:69.40, upsCost:49.80 },
]

// ── Mock History ───────────────────────────────────────────────
function makeRow(month: string, revenue: number, upsCost: number): HistoryRow {
  const netProfit = revenue - upsCost
  return { month, revenue, upsCost, netProfit, baekoAmt: netProfit * 0.30, salesAmt: netProfit * 0.10, overheadAmt: netProfit * 0.60 }
}
const INIT_HISTORY: HistoryRow[] = [
  makeRow('2025-11', 3840.50, 2620.30),
  makeRow('2025-12', 4510.80, 3120.60),
  makeRow('2026-01',  422.90,  291.40),
  makeRow('2026-02',  512.90,  356.20),
]

// ── Mock Payments ──────────────────────────────────────────────
const INIT_PAYMENTS: PayRecord[] = [
  { id:'PR001', month:'2025-11', target:'baeko',  salesPerson:'',
    lines:[{ id:'PL001', amount:'366.06', method:'Zelle', date:'2025-12-05', memo:'Nov settlement paid' }] },
  { id:'PR002', month:'2025-11', target:'sales',  salesPerson:'Alice Yoon',
    lines:[{ id:'PL002', amount:'73.21',  method:'Zelle', date:'2025-12-05', memo:'Nov commission' }] },
  { id:'PR003', month:'2025-11', target:'sales',  salesPerson:'Brian Cho',
    lines:[{ id:'PL003', amount:'48.81',  method:'Zelle', date:'2025-12-05', memo:'Nov commission' }] },
  { id:'PR004', month:'2025-12', target:'baeko',  salesPerson:'',
    lines:[{ id:'PL004', amount:'417.06', method:'Check', date:'2026-01-08', memo:'Dec settlement paid' }] },
]

// ── Helpers ────────────────────────────────────────────────────
const fmt      = (n: number) => `$${n.toFixed(2)}`
const pct      = (n: number, total: number) => total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`
const mLabel   = (m: string) => { const [y, mo] = m.split('-'); return `${y} / ${mo}` }
const sumLines = (lines: SplitLine[]) => lines.reduce((a, l) => a + (parseFloat(l.amount) || 0), 0)
let _lid = 0
const newLine  = (amount = ''): SplitLine => ({ id: `L${++_lid}`, amount, method: '', date: '', memo: '' })

function computePersonCommission(month: string, person: string): number {
  return MOCK_SHIPMENTS
    .filter(s => s.date.startsWith(month) && s.salesPerson === person)
    .reduce((a, s) => a + (s.customerCharge - s.upsCost) * 0.10, 0)
}

// Fully-paid check: paid > 0 AND (no commission data OR paid covers ≥99% of commission)
function isPersonPaid(month: string, person: string, payments: PayRecord[]): boolean {
  const paid = payments
    .filter(p => p.month === month && p.target === 'sales' && p.salesPerson === person)
    .reduce((a, r) => a + sumLines(r.lines), 0)
  if (paid <= 0) return false
  const commission = computePersonCommission(month, person)
  return commission === 0 || paid >= commission * 0.99
}

function isBaekoPaid(month: string, baekoAmt: number, payments: PayRecord[]): boolean {
  const paid = payments
    .filter(p => p.month === month && p.target === 'baeko')
    .reduce((a, r) => a + sumLines(r.lines), 0)
  return paid > 0 && paid >= baekoAmt * 0.99
}

const SHIPMENT_MONTHS = Array.from(new Set(MOCK_SHIPMENTS.map(s => s.date.slice(0, 7)))).sort().reverse()

// ── Pay Modal (3-step) ─────────────────────────────────────────
function PayModal({ history, payments, onSave, onClose }: {
  history: HistoryRow[]
  payments: PayRecord[]
  onSave: (r: PayRecord) => void
  onClose: () => void
}) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [selMonth, setSelMonth]   = useState(HISTORY_MONTHS[0])
  const [target, setTarget]       = useState<'baeko' | 'sales' | null>(null)
  const [selPerson, setSelPerson] = useState('')
  const [lines, setLines]         = useState<SplitLine[]>([newLine()])

  const histRow = history.find(r => r.month === selMonth)

  const personCommissions = useMemo(() => {
    const map: Record<string, number> = {}
    SALES_PERSONS.forEach(p => { map[p] = computePersonCommission(selMonth, p) })
    return map
  }, [selMonth])

  // Availability for selected month
  const paidStatus = useMemo(() => {
    const baekoDone = isBaekoPaid(selMonth, histRow?.baekoAmt ?? 0, payments)
    const unpaidPersons = SALES_PERSONS.filter(p => !isPersonPaid(selMonth, p, payments))
    const allDone = baekoDone && unpaidPersons.length === 0
    return { baekoDone, unpaidPersons, allDone }
  }, [selMonth, payments, histRow])

  const showBaeko = !paidStatus.baekoDone
  const showSales = paidStatus.unpaidPersons.length > 0

  const selectedCommission = selPerson ? (personCommissions[selPerson] ?? 0) : 0
  const canNext2 = (target === 'baeko' && showBaeko) || (target === 'sales' && !!selPerson)
  const total    = sumLines(lines)

  const handleMonthChange = (m: string) => {
    setSelMonth(m)
    setTarget(null)
    setSelPerson('')
  }

  const handleNext2 = () => {
    if (!canNext2) return
    let amt = ''
    if (target === 'baeko' && histRow) amt = histRow.baekoAmt.toFixed(2)
    else if (target === 'sales' && selectedCommission > 0) amt = selectedCommission.toFixed(2)
    setLines([newLine(amt)])
    setStep(3)
  }

  const updateLine = (id: string, patch: Partial<SplitLine>) =>
    setLines(p => p.map(l => l.id === id ? { ...l, ...patch } : l))

  const handleSave = () => {
    if (!target) return
    const validLines = lines.filter(l => parseFloat(l.amount) > 0)
    if (!validLines.length) return
    onSave({
      id:          `PR${Date.now()}`,
      month:       selMonth,
      target,
      salesPerson: target === 'sales' ? selPerson : '',
      lines:       validLines,
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>New Payment</div>
            <div className={styles.stepRow}>
              {([1, 2, 3] as const).map(s => (
                <span key={s} className={`${styles.stepDot} ${step >= s ? styles.stepDotOn : ''}`} />
              ))}
              <span className={styles.stepLabel}>Step {step} / 3</span>
            </div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* ── Step 1: Month ── */}
          {step === 1 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>Select Settlement Month</div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Month</label>
                <select className={styles.select} value={selMonth} onChange={e => handleMonthChange(e.target.value)}>
                  {HISTORY_MONTHS.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
                </select>
              </div>
              {histRow && (
                <div className={styles.monthSummary}>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>Net Profit</span>
                    <span className={styles.montSummaryVal}>{fmt(histRow.netProfit)}</span>
                  </div>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>BAEKO (30%)</span>
                    <span className={styles.montSummaryVal} style={{ color: '#FD4C1D' }}>{fmt(histRow.baekoAmt)}</span>
                  </div>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>Sales Pool (10%)</span>
                    <span className={styles.montSummaryVal} style={{ color: '#F59E0B' }}>{fmt(histRow.salesAmt)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Target ── */}
          {step === 2 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>Who are you paying? — {mLabel(selMonth)}</div>

              {/* All done */}
              {paidStatus.allDone ? (
                <div className={styles.allDoneBox}>
                  <span className={styles.allDoneIcon}>✓</span>
                  <div>
                    <div className={styles.allDoneTitle}>All payments for this month are completed.</div>
                    <div className={styles.allDoneSub}>Go back and select a different month.</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.targetOptions}>
                    {/* BAEKO option */}
                    {showBaeko && (
                      <label className={`${styles.targetOpt} ${target === 'baeko' ? styles.targetOptOn : ''}`}>
                        <input type="radio" name="target" value="baeko" checked={target === 'baeko'}
                          onChange={() => { setTarget('baeko'); setSelPerson('') }} />
                        <div className={styles.targetOptBody}>
                          <div className={styles.targetOptName}>
                            <span className={styles.payDot} style={{ background: '#FD4C1D' }} />
                            BAEKO (30%)
                          </div>
                          <div className={styles.targetOptAmt}>{histRow ? fmt(histRow.baekoAmt) : '—'}</div>
                        </div>
                      </label>
                    )}

                    {/* Sales Person option */}
                    {showSales && (
                      <label className={`${styles.targetOpt} ${target === 'sales' ? styles.targetOptOn : ''}`}>
                        <input type="radio" name="target" value="sales" checked={target === 'sales'}
                          onChange={() => setTarget('sales')} />
                        <div className={styles.targetOptBody}>
                          <div className={styles.targetOptName}>
                            <span className={styles.payDot} style={{ background: '#F59E0B' }} />
                            Sales Person (10%)
                          </div>
                          <div className={styles.targetOptAmt}>
                            {histRow ? `Pool: ${fmt(histRow.salesAmt)}` : '—'}
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  {target === 'sales' && (
                    <div className={styles.formField} style={{ marginTop: 16 }}>
                      <label className={styles.fieldLabel}>Sales Person</label>
                      <select className={styles.select} value={selPerson}
                        onChange={e => setSelPerson(e.target.value)}>
                        <option value="">Select person…</option>
                        {paidStatus.unpaidPersons.map(p => {
                          const c = personCommissions[p]
                          return (
                            <option key={p} value={p}>
                              {p}{c > 0 ? ` — ${fmt(c)}` : ''}
                            </option>
                          )
                        })}
                      </select>
                      {selPerson && (
                        <div className={styles.commissionHint}>
                          {selectedCommission > 0
                            ? <>Commission: <strong>{fmt(selectedCommission)}</strong></>
                            : <span style={{ color: 'var(--muted)' }}>No shipment data — enter amount manually</span>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Amount & Method ── */}
          {step === 3 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>
                {target === 'baeko' ? 'BAEKO Payment' : `${selPerson} — Commission`}
                {histRow && (
                  <span className={styles.paySectionRef}>
                    ref: {target === 'baeko' ? fmt(histRow.baekoAmt) : selectedCommission > 0 ? fmt(selectedCommission) : 'manual'}
                  </span>
                )}
              </div>

              <div className={styles.splitList}>
                {lines.map((line, idx) => (
                  <div key={line.id} className={styles.splitLine}>
                    <div className={styles.splitLineTop}>
                      <span className={styles.splitLineNum}>Line {idx + 1}</span>
                      {lines.length > 1 && (
                        <button className={styles.removeSplitBtn}
                          onClick={() => setLines(p => p.filter(l => l.id !== line.id))}>
                          ✕ Remove
                        </button>
                      )}
                    </div>
                    <div className={styles.splitLineGrid}>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Amount</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00"
                          className={styles.input} value={line.amount}
                          onChange={e => updateLine(line.id, { amount: e.target.value })} />
                      </div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Method</label>
                        <select className={styles.select} value={line.method}
                          onChange={e => updateLine(line.id, { method: e.target.value as PaymentMethod })}>
                          <option value="">Select…</option>
                          {ALL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Date</label>
                        <input type="date" className={styles.input} value={line.date}
                          onChange={e => updateLine(line.id, { date: e.target.value })} />
                      </div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Memo</label>
                        <input type="text" placeholder="Optional note…"
                          className={styles.input} value={line.memo}
                          onChange={e => updateLine(line.id, { memo: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.splitFooter}>
                <button className={styles.addSplitBtn}
                  onClick={() => setLines(p => [...p, newLine()])}>
                  + Add Split
                </button>
                <div className={styles.splitTotal}>Total: <strong>{fmt(total)}</strong></div>
              </div>
            </div>
          )}

        </div>

        {/* Footer nav */}
        <div className={styles.modalFooter}>
          {step === 1 && <>
            <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button className={styles.btnSave} onClick={() => setStep(2)}>Next →</button>
          </>}
          {step === 2 && <>
            <button className={styles.btnCancel} onClick={() => setStep(1)}>← Back</button>
            {!paidStatus.allDone && (
              <button className={styles.btnSave} disabled={!canNext2} onClick={handleNext2}>Next →</button>
            )}
          </>}
          {step === 3 && <>
            <button className={styles.btnCancel} onClick={() => setStep(2)}>← Back</button>
            <button className={styles.btnSave} disabled={total === 0} onClick={handleSave}>Save</button>
          </>}
        </div>
      </div>
    </div>
  )
}

// ── Detail Modal (row click) — with edit & delete ──────────────
function DetailModal({ row, payments, onUpdate, onDelete, onClose }: {
  row: HistoryRow
  payments: PayRecord[]
  onUpdate: (record: PayRecord) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editDraft, setEditDraft]       = useState<PayRecord | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const records = payments.filter(p => p.month === row.month)

  const startEdit = (rec: PayRecord) => {
    setConfirmDeleteId(null)
    setEditingId(rec.id)
    setEditDraft(JSON.parse(JSON.stringify(rec)))
  }

  const cancelEdit = () => { setEditingId(null); setEditDraft(null) }

  const saveEdit = () => {
    if (editDraft) { onUpdate(editDraft); setEditingId(null); setEditDraft(null) }
  }

  const updateDraftLine = (lineId: string, patch: Partial<SplitLine>) => {
    setEditDraft(prev => prev
      ? { ...prev, lines: prev.lines.map(l => l.id === lineId ? { ...l, ...patch } : l) }
      : null)
  }

  const handleDelete = (id: string) => { onDelete(id); setConfirmDeleteId(null) }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Payment Records — {mLabel(row.month)}</div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {records.length === 0 ? (
            <div className={styles.empty}>No payment records for this month.</div>
          ) : (
            records.map(rec => {
              const isEditing = editingId === rec.id
              const draft     = isEditing ? editDraft! : rec
              const isConfirmDelete = confirmDeleteId === rec.id

              return (
                <div key={rec.id} className={`${styles.detailRecord} ${isEditing ? styles.detailRecordEditing : ''}`}>

                  {/* Record header */}
                  <div className={styles.detailRecordHead}>
                    <span className={styles.payDot}
                      style={{ background: rec.target === 'baeko' ? '#FD4C1D' : '#F59E0B' }} />
                    <span className={styles.detailRecordTarget}>
                      {rec.target === 'baeko' ? 'BAEKO (30%)' : `${rec.salesPerson} — Sales`}
                    </span>
                    <span className={styles.detailRecordTot}>{fmt(sumLines(rec.lines))}</span>

                    {/* Action buttons — hidden while editing */}
                    {!isEditing && !isConfirmDelete && (
                      <div className={styles.detailRecordActions}>
                        <button className={styles.editRecBtn} onClick={() => startEdit(rec)}>Edit</button>
                        <button className={styles.deleteRecBtn} onClick={() => setConfirmDeleteId(rec.id)}>Delete</button>
                      </div>
                    )}

                    {/* Confirm delete */}
                    {isConfirmDelete && (
                      <div className={styles.confirmDelete}>
                        <span className={styles.confirmDeleteMsg}>Delete this record?</span>
                        <button className={styles.confirmYesBtn} onClick={() => handleDelete(rec.id)}>Yes, Delete</button>
                        <button className={styles.confirmNoBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </div>
                    )}
                  </div>

                  {/* Lines — view or edit */}
                  <div className={styles.detailLines}>
                    {draft.lines.map((l, i) => (
                      isEditing ? (
                        /* Edit form */
                        <div key={l.id} className={styles.editLineGrid}>
                          <div className={styles.editLineNum}>#{i + 1}</div>
                          <div className={styles.formField}>
                            <label className={styles.fieldLabel}>Amount</label>
                            <input type="number" min="0" step="0.01" className={styles.input}
                              value={l.amount}
                              onChange={e => updateDraftLine(l.id, { amount: e.target.value })} />
                          </div>
                          <div className={styles.formField}>
                            <label className={styles.fieldLabel}>Method</label>
                            <select className={styles.select} value={l.method}
                              onChange={e => updateDraftLine(l.id, { method: e.target.value as PaymentMethod })}>
                              <option value="">Select…</option>
                              {ALL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className={styles.formField}>
                            <label className={styles.fieldLabel}>Date</label>
                            <input type="date" className={styles.input} value={l.date}
                              onChange={e => updateDraftLine(l.id, { date: e.target.value })} />
                          </div>
                          <div className={`${styles.formField} ${styles.editLineMemo}`}>
                            <label className={styles.fieldLabel}>Memo</label>
                            <input type="text" className={styles.input} value={l.memo}
                              onChange={e => updateDraftLine(l.id, { memo: e.target.value })} />
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div key={l.id} className={styles.detailLine}>
                          <span className={styles.detailLineIdx}>#{i + 1}</span>
                          <span className={styles.detailLineAmt}>{fmt(parseFloat(l.amount) || 0)}</span>
                          <span className={`${styles.badge} ${styles.badgeMethod}`}>{l.method || '—'}</span>
                          <span className={styles.detailLineDate}>{l.date || '—'}</span>
                          {l.memo && <span className={styles.detailLineMemo}>{l.memo}</span>}
                        </div>
                      )
                    ))}
                  </div>

                  {/* Edit save/cancel */}
                  {isEditing && (
                    <div className={styles.editActions}>
                      <button className={styles.btnCancel} onClick={cancelEdit}>Cancel</button>
                      <button className={styles.btnSave} onClick={saveEdit}>Save Changes</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSave} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── History cell helpers ───────────────────────────────────────
function BaekoCell({ row, payments }: { row: HistoryRow; payments: PayRecord[] }) {
  const recs  = payments.filter(p => p.month === row.month && p.target === 'baeko')
  const paid  = recs.reduce((a, r) => a + sumLines(r.lines), 0)
  const count = recs.length
  if (paid === 0) return <span className={`${styles.badge} ${styles.badgeUnpaid}`}>Unpaid</span>
  const full  = paid >= row.baekoAmt * 0.99
  return (
    <div className={styles.payCellStack}>
      <span className={`${styles.badge} ${full ? styles.badgePaid : styles.badgePartial}`}>
        {full ? '✓' : '~'} {fmt(paid)}
      </span>
      <span className={styles.payCellSub}>{count} payment{count > 1 ? 's' : ''}</span>
    </div>
  )
}

function SalesCell({ row, payments }: { row: HistoryRow; payments: PayRecord[] }) {
  const recs = payments.filter(p => p.month === row.month && p.target === 'sales')
  if (recs.length === 0) return <span className={`${styles.badge} ${styles.badgeUnpaid}`}>Unpaid</span>
  const byPerson: Record<string, number> = {}
  recs.forEach(r => { byPerson[r.salesPerson] = (byPerson[r.salesPerson] ?? 0) + sumLines(r.lines) })
  return (
    <div className={styles.salesCellStack}>
      {Object.entries(byPerson).map(([person, amt]) => (
        <div key={person} className={styles.salesCellRow}>
          <span className={`${styles.badge} ${styles.badgePaid}`}>✓ {person.split(' ')[0]}</span>
          <span className={styles.salesCellAmt}>{fmt(amt)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function SettlementPage() {
  const [month, setMonth]               = useState(SHIPMENT_MONTHS[0])
  const [history]                       = useState<HistoryRow[]>(INIT_HISTORY)
  const [payments, setPayments]         = useState<PayRecord[]>(INIT_PAYMENTS)
  const [showPayModal, setShowPayModal] = useState(false)
  const [detailRow, setDetailRow]       = useState<HistoryRow | null>(null)

  const filtered = useMemo(
    () => MOCK_SHIPMENTS.filter(s => s.date.startsWith(month)),
    [month],
  )

  const totals = useMemo(() => {
    const revenue = filtered.reduce((a, s) => a + s.customerCharge, 0)
    const cost    = filtered.reduce((a, s) => a + s.upsCost, 0)
    const profit  = revenue - cost
    return { revenue, cost, profit, baeko: profit * 0.30, sales: profit * 0.10, overhead: profit * 0.60 }
  }, [filtered])

  const byPerson = useMemo(() => {
    const map: Record<string, { revenue: number; cost: number; count: number }> = {}
    filtered.forEach(s => {
      if (!map[s.salesPerson]) map[s.salesPerson] = { revenue: 0, cost: 0, count: 0 }
      map[s.salesPerson].revenue += s.customerCharge
      map[s.salesPerson].cost    += s.upsCost
      map[s.salesPerson].count   += 1
    })
    return Object.entries(map)
      .map(([name, d]) => ({ name, revenue: d.revenue, cost: d.cost,
        profit: d.revenue - d.cost, commission: (d.revenue - d.cost) * 0.10, count: d.count }))
      .sort((a, b) => b.commission - a.commission)
  }, [filtered])

  const DIST = [
    { label: 'BAEKO (30%)',    pctVal: 30, value: totals.baeko,    color: '#FD4C1D' },
    { label: 'Sales (10%)',    pctVal: 10, value: totals.sales,    color: '#F59E0B' },
    { label: 'Overhead (60%)', pctVal: 60, value: totals.overhead, color: '#10B981' },
  ]

  const handleUpdatePayment = (updated: PayRecord) =>
    setPayments(prev => prev.map(p => p.id === updated.id ? updated : p))

  const handleDeletePayment = (id: string) =>
    setPayments(prev => prev.filter(p => p.id !== id))

  return (
    <div className={styles.page}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Settlement</div>
          <div className={styles.subtitle}>Monthly profit & commission breakdown</div>
        </div>
        <div className={styles.headerActions}>
          <select className={styles.monthSelect} value={month} onChange={e => setMonth(e.target.value)}>
            {SHIPMENT_MONTHS.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
          </select>
          <button className={styles.btnPay} onClick={() => setShowPayModal(true)}>+ Pay</button>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────── */}
      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Customer Revenue</div>
          <div className={styles.cardValue}>{fmt(totals.revenue)}</div>
          <div className={styles.cardSub}>{filtered.length} shipments</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>UPS Cost</div>
          <div className={`${styles.cardValue} ${styles.negative}`}>{fmt(totals.cost)}</div>
          <div className={styles.cardSub} style={{ color: '#EF4444' }}>{pct(totals.cost, totals.revenue)} of revenue</div>
        </div>
        <div className={`${styles.card} ${styles.cardProfit}`}>
          <div className={styles.cardLabel}>Net Profit</div>
          <div className={`${styles.cardValue} ${styles.profit}`}>{fmt(totals.profit)}</div>
          <div className={styles.cardSub} style={{ color: '#10B981' }}>{pct(totals.profit, totals.revenue)} margin</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>BAEKO (30%)</div>
          <div className={styles.cardValue} style={{ color: '#FD4C1D' }}>{fmt(totals.baeko)}</div>
          <div className={styles.cardSub}>of net profit</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Sales Commission (10%)</div>
          <div className={styles.cardValue} style={{ color: '#F59E0B' }}>{fmt(totals.sales)}</div>
          <div className={styles.cardSub}>{byPerson.length} sales persons</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Overhead (60%)</div>
          <div className={styles.cardValue} style={{ color: '#10B981' }}>{fmt(totals.overhead)}</div>
          <div className={styles.cardSub}>operating expenses</div>
        </div>
      </div>

      {/* ── Distribution + Commission ───────────────────────── */}
      <div className={styles.row}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Profit Distribution</div>
          <div className={styles.distList}>
            {DIST.map(d => (
              <div key={d.label} className={styles.distItem}>
                <div className={styles.distHeader}>
                  <div className={styles.distLabel}>
                    <span className={styles.distDot} style={{ background: d.color }} />
                    {d.label}
                  </div>
                  <span className={styles.distValue}>{fmt(d.value)}</span>
                </div>
                <div className={styles.barBg}>
                  <div className={styles.barFill} style={{ width: `${d.pctVal}%`, background: d.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className={styles.formula}>
            <div className={styles.formulaRow}>
              <span className={styles.formulaLabel}>Revenue</span>
              <span>{fmt(totals.revenue)}</span>
            </div>
            <div className={styles.formulaRow}>
              <span className={styles.formulaLabel}>− UPS Cost</span>
              <span className={styles.negative}>{fmt(totals.cost)}</span>
            </div>
            <div className={`${styles.formulaRow} ${styles.formulaTotal}`}>
              <span className={styles.formulaLabel}>= Net Profit</span>
              <span className={styles.profit}>{fmt(totals.profit)}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Sales Person Commission</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sales Person</th>
                  <th className={styles.thRight}>Shipments</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Profit</th>
                  <th className={styles.thRight}>Commission (10%)</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>No data for this month.</td></tr>
                )}
                {byPerson.map(p => (
                  <tr key={p.name}>
                    <td><div className={styles.personName}>{p.name}</div></td>
                    <td className={styles.tdRight}>{p.count}</td>
                    <td className={styles.tdRight}>{fmt(p.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(p.cost)}</td>
                    <td className={styles.tdRight}>{fmt(p.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(p.commission)}</td>
                  </tr>
                ))}
              </tbody>
              {byPerson.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel}>Total</td>
                    <td className={styles.tdRight}>{filtered.length}</td>
                    <td className={styles.tdRight}>{fmt(totals.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(totals.cost)}</td>
                    <td className={styles.tdRight}>{fmt(totals.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(totals.sales)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ── Settlement History ──────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Settlement History
          <span className={styles.sectionHint}>Click a row to view & edit payment records</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={styles.thRight}>Revenue</th>
                <th className={styles.thRight}>UPS Cost</th>
                <th className={styles.thRight}>Net Profit</th>
                <th className={styles.thRight}>BAEKO (30%)</th>
                <th className={styles.thRight}>Sales (10%)</th>
                <th className={styles.thRight}>Overhead (60%)</th>
                <th className={styles.thCenter}>BAEKO Payment</th>
                <th className={styles.thCenter}>Sales Payment</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(row => (
                <tr key={row.month} className={styles.historyRow} onClick={() => setDetailRow(row)}>
                  <td className={styles.monthCell}>{mLabel(row.month)}</td>
                  <td className={styles.tdRight}>{fmt(row.revenue)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(row.upsCost)}</td>
                  <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(row.netProfit)}</td>
                  <td className={styles.tdRight} style={{ color: '#FD4C1D', fontWeight: 600 }}>{fmt(row.baekoAmt)}</td>
                  <td className={styles.tdRight} style={{ color: '#F59E0B', fontWeight: 600 }}>{fmt(row.salesAmt)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(row.overheadAmt)}</td>
                  <td className={styles.tdCenter}><BaekoCell row={row} payments={payments} /></td>
                  <td className={styles.tdCenter}><SalesCell row={row} payments={payments} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {showPayModal && (
        <PayModal
          history={history}
          payments={payments}
          onSave={rec => { setPayments(p => [...p, rec]); setShowPayModal(false) }}
          onClose={() => setShowPayModal(false)}
        />
      )}
      {detailRow && (
        <DetailModal
          row={detailRow}
          payments={payments}
          onUpdate={handleUpdatePayment}
          onDelete={handleDeletePayment}
          onClose={() => setDetailRow(null)}
        />
      )}

    </div>
  )
}
