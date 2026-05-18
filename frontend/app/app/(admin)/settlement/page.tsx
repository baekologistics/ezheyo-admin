'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import styles from './settlement.module.css'
import { usePageLog, authFetch } from '@/lib/usePageLog'

const HISTORY_START = '2024-12'

// ── Types ────────────────────────────────────────────────────────
type PaymentMethod = 'Zelle' | 'Check' | 'Wire' | 'ACH' | 'Cash' | ''
const ALL_METHODS: PaymentMethod[] = ['Zelle', 'Check', 'Wire', 'ACH', 'Cash']

type SplitLine = {
  id: string; amount: string; method: PaymentMethod; date: string; memo: string
}

type ApiPayment = {
  id: string
  settlement_id: string
  recipient_type: 'baeko' | 'sales_person'
  sales_person: string | null
  amount: string | number
  method: string
  paid_date: string
  memo: string | null
  created_at: string
}

type SalesPersonRow = {
  sales_person_id: string
  sales_person: string
  shipments: number
  revenue: string | number
  ups_cost: string | number
  profit: string | number
  commission: string | number
}

type SpCommission = {
  name: string
  commission: number
  paid: boolean
  paidAmount: number
}

type MonthData = {
  month: string
  settlement_id: string | null
  shipments: number
  revenue: string | number
  ups_cost: string | number
  net_profit: string | number
  baeko_amount: string | number
  sales_amount: string | number
  overhead_amount: string | number
  sales_persons: SalesPersonRow[]
  payments: ApiPayment[]
}

type RangeData = {
  from: string
  to: string
  shipments: number
  revenue: string | number
  ups_cost: string | number
  net_profit: string | number
  baeko_amount: string | number
  sales_amount: string | number
  overhead_amount: string | number
  sales_persons: SalesPersonRow[]
}

type HistoryRow = {
  month: string
  shipments: number
  revenue: string | number
  ups_cost: string | number
  net_profit: string | number
  baeko_amount: string | number
  sales_amount: string | number
  overhead_amount: string | number
  settlement_id: string | null
  payments: ApiPayment[]
  salesPersonCommissions: SpCommission[]
}

type SummarySpRow = {
  name: string
  totalEarned: number
  totalPaid: number
  totalUnpaid: number
}

type SummaryData = {
  baeko: { totalEarned: number; totalPaid: number; totalUnpaid: number }
  salesPersons: SummarySpRow[]
  totalPaid: number
  totalUnpaid: number
}

// Shared "display data" shape used by cards / distribution / commission table
type DisplayData = {
  shipments: number
  revenue: string | number
  ups_cost: string | number
  net_profit: string | number
  baeko_amount: string | number
  sales_amount: string | number
  overhead_amount: string | number
  sales_persons: SalesPersonRow[]
}

// ── Helpers ──────────────────────────────────────────────────────
const fmt      = (n: number) => `$${n.toFixed(2)}`
const n2       = (v: string | number | null | undefined) => Number(v) || 0
const pct      = (n: number, total: number) => total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`
const mLabel   = (m: string) => { const [y, mo] = m.split('-'); return `${y} / ${mo}` }
const sumLines = (ls: SplitLine[]) => ls.reduce((a, l) => a + (parseFloat(l.amount) || 0), 0)
const payTotal = (ps: ApiPayment[]) => ps.reduce((a, p) => a + n2(p.amount), 0)
let _lid = 0
const newLine  = (amount = ''): SplitLine => ({ id: `L${++_lid}`, amount, method: '', date: '', memo: '' })

function thisMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function firstDayOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── BAEKO cell (history table) ───────────────────────────────────
function BaekoCell({ row }: { row: HistoryRow }) {
  const pays    = row.payments.filter(p => p.recipient_type === 'baeko')
  const paid    = payTotal(pays)
  const baekoAmt = n2(row.baeko_amount)
  if (paid <= 0) return <span className={`${styles.badge} ${styles.badgeUnpaid}`}>Unpaid</span>
  const full = baekoAmt === 0 || paid >= baekoAmt * 0.99
  return (
    <div className={styles.payCellStack}>
      <span className={`${styles.badge} ${full ? styles.badgePaid : styles.badgePartial}`}>
        {full ? '✓' : '~'} {fmt(paid)}
      </span>
      <span className={styles.payCellSub}>{pays.length} pmt{pays.length !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ── Sales person cell (history table) ───────────────────────────
function SpCell({ row, name }: { row: HistoryRow; name: string }) {
  const spc = (row.salesPersonCommissions ?? []).find(s => s.name === name)
  if (!spc || spc.commission <= 0) {
    return <span className={styles.muted}>—</span>
  }
  return (
    <div className={styles.payCellStack}>
      <span className={styles.spCommAmt}>{fmt(spc.commission)}</span>
      <span className={`${styles.badge} ${spc.paid ? styles.badgePaid : styles.badgeUnpaid}`}>
        {spc.paid ? '✓ Paid' : 'Unpaid'}
      </span>
    </div>
  )
}

// ── Is a history row fully settled? ─────────────────────────────
function isRowFullyPaid(row: HistoryRow): boolean {
  const baekoAmt = n2(row.baeko_amount)
  if (baekoAmt > 0) {
    const baekoPaid = payTotal(row.payments.filter(p => p.recipient_type === 'baeko'))
    if (baekoPaid < baekoAmt * 0.99) return false
  }
  for (const spc of (row.salesPersonCommissions ?? [])) {
    if (spc.commission > 0 && !spc.paid) return false
  }
  return true
}

// ── Sum numeric columns across history rows ──────────────────────
function sumRows(rows: HistoryRow[]) {
  return {
    shipments:  rows.reduce((a, r) => a + n2(r.shipments), 0),
    revenue:    rows.reduce((a, r) => a + n2(r.revenue), 0),
    ups_cost:   rows.reduce((a, r) => a + n2(r.ups_cost), 0),
    net_profit: rows.reduce((a, r) => a + n2(r.net_profit), 0),
    baeko:      rows.reduce((a, r) => a + n2(r.baeko_amount), 0),
    sales:      rows.reduce((a, r) => a + n2(r.sales_amount), 0),
    overhead:   rows.reduce((a, r) => a + n2(r.overhead_amount), 0),
  }
}

// ── Pay Modal ────────────────────────────────────────────────────
function PayModal({
  historyRows,
  onFetchMonth,
  onSave,
  onClose,
}: {
  historyRows: HistoryRow[]
  onFetchMonth: (month: string) => Promise<MonthData>
  onSave: (payload: {
    month: string
    recipient_type: 'baeko' | 'sales_person'
    sales_person?: string
    amount: number
    method: string
    paid_date: string
    memo?: string
  }) => Promise<void>
  onClose: () => void
}) {
  const defaultMonth  = historyRows[0]?.month ?? thisMonthStr()
  const [step,        setStep]        = useState<1 | 2 | 3>(1)
  const [selMonth,    setSelMonth]    = useState(defaultMonth)
  const [target,      setTarget]      = useState<'baeko' | 'sales_person' | null>(null)
  const [selPerson,   setSelPerson]   = useState('')
  const [lines,       setLines]       = useState<SplitLine[]>([newLine()])
  const [modalData,   setModalData]   = useState<MonthData | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')

  const loadModalMonth = useCallback(async (m: string) => {
    setDataLoading(true)
    try { setModalData(await onFetchMonth(m)) } catch { /* ignore */ }
    finally { setDataLoading(false) }
  }, [onFetchMonth])

  useEffect(() => { loadModalMonth(selMonth) }, [selMonth, loadModalMonth])

  const histRow = historyRows.find(r => r.month === selMonth)

  const paidStatus = useMemo(() => {
    if (!modalData) return { baekoDone: false, unpaidPersons: [] as SalesPersonRow[], allDone: false }
    const pays     = modalData.payments
    const baekoAmt = n2(modalData.baeko_amount)
    const baekoPaid = payTotal(pays.filter(p => p.recipient_type === 'baeko'))
    const baekoDone = baekoAmt > 0 && baekoPaid >= baekoAmt * 0.99
    const unpaidPersons = modalData.sales_persons.filter(sp => {
      const spPaid = payTotal(pays.filter(p => p.sales_person === sp.sales_person))
      const comm   = n2(sp.commission)
      return comm <= 0 || spPaid < comm * 0.99
    })
    return { baekoDone, unpaidPersons, allDone: baekoDone && unpaidPersons.length === 0 }
  }, [modalData])

  const showBaeko = !paidStatus.baekoDone
  const showSales = paidStatus.unpaidPersons.length > 0

  const selectedCommission = selPerson
    ? n2(modalData?.sales_persons.find(sp => sp.sales_person === selPerson)?.commission)
    : 0
  const canNext2 = (target === 'baeko' && showBaeko) || (target === 'sales_person' && !!selPerson)
  const total    = sumLines(lines)

  const handleMonthChange = (m: string) => { setSelMonth(m); setTarget(null); setSelPerson('') }

  const handleNext2 = () => {
    if (!canNext2) return
    let amt = ''
    if      (target === 'baeko'        && histRow)              amt = n2(histRow.baeko_amount).toFixed(2)
    else if (target === 'sales_person' && selectedCommission > 0) amt = selectedCommission.toFixed(2)
    setLines([newLine(amt)]); setStep(3)
  }

  const updateLine = (id: string, patch: Partial<SplitLine>) =>
    setLines(p => p.map(l => l.id === id ? { ...l, ...patch } : l))

  const handleSave = async () => {
    if (!target) return
    const validLines = lines.filter(l => parseFloat(l.amount) > 0 && l.method && l.date)
    if (!validLines.length) { setSaveErr('Please fill amount, method and date'); return }
    setSaving(true); setSaveErr('')
    try {
      for (const line of validLines) {
        await onSave({
          month: selMonth, recipient_type: target,
          sales_person: target === 'sales_person' ? selPerson : undefined,
          amount: parseFloat(line.amount), method: line.method,
          paid_date: line.date, memo: line.memo || undefined,
        })
      }
      onClose()
    } catch (err) { setSaveErr((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
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
          {step === 1 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>Select Settlement Month</div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Month</label>
                <select className={styles.select} value={selMonth}
                  onChange={e => handleMonthChange(e.target.value)}>
                  {historyRows.map(r => (
                    <option key={r.month} value={r.month}>{mLabel(r.month)}</option>
                  ))}
                </select>
              </div>
              {dataLoading ? (
                <div className={styles.muted} style={{ fontSize: 13 }}>Loading…</div>
              ) : histRow && (
                <div className={styles.monthSummary}>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>Net Profit</span>
                    <span className={styles.montSummaryVal}>{fmt(n2(histRow.net_profit))}</span>
                  </div>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>BAEKO (30%)</span>
                    <span className={styles.montSummaryVal} style={{ color: '#FD4C1D' }}>
                      {fmt(n2(histRow.baeko_amount))}
                    </span>
                  </div>
                  <div className={styles.montSummaryItem}>
                    <span className={styles.montSummaryLabel}>Sales Pool (10%)</span>
                    <span className={styles.montSummaryVal} style={{ color: '#F59E0B' }}>
                      {fmt(n2(histRow.sales_amount))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>Who are you paying? — {mLabel(selMonth)}</div>
              {dataLoading ? (
                <div className={styles.muted} style={{ fontSize: 13 }}>Loading…</div>
              ) : paidStatus.allDone ? (
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
                    {showBaeko && (
                      <label className={`${styles.targetOpt} ${target === 'baeko' ? styles.targetOptOn : ''}`}>
                        <input type="radio" name="target" value="baeko" checked={target === 'baeko'}
                          onChange={() => { setTarget('baeko'); setSelPerson('') }} />
                        <div className={styles.targetOptBody}>
                          <div className={styles.targetOptName}>
                            <span className={styles.payDot} style={{ background: '#FD4C1D' }} />
                            BAEKO (30%)
                          </div>
                          <div className={styles.targetOptAmt}>{histRow ? fmt(n2(histRow.baeko_amount)) : '—'}</div>
                        </div>
                      </label>
                    )}
                    {showSales && (
                      <label className={`${styles.targetOpt} ${target === 'sales_person' ? styles.targetOptOn : ''}`}>
                        <input type="radio" name="target" value="sales_person"
                          checked={target === 'sales_person'} onChange={() => setTarget('sales_person')} />
                        <div className={styles.targetOptBody}>
                          <div className={styles.targetOptName}>
                            <span className={styles.payDot} style={{ background: '#F59E0B' }} />
                            Sales Person (10%)
                          </div>
                          <div className={styles.targetOptAmt}>
                            {histRow ? `Pool: ${fmt(n2(histRow.sales_amount))}` : '—'}
                          </div>
                        </div>
                      </label>
                    )}
                  </div>
                  {target === 'sales_person' && (
                    <div className={styles.formField} style={{ marginTop: 16 }}>
                      <label className={styles.fieldLabel}>Sales Person</label>
                      <select className={styles.select} value={selPerson}
                        onChange={e => setSelPerson(e.target.value)}>
                        <option value="">Select person…</option>
                        {paidStatus.unpaidPersons.map(sp => (
                          <option key={sp.sales_person_id} value={sp.sales_person}>
                            {sp.sales_person}{n2(sp.commission) > 0 ? ` — ${fmt(n2(sp.commission))}` : ''}
                          </option>
                        ))}
                      </select>
                      {selPerson && (
                        <div className={styles.commissionHint}>
                          {selectedCommission > 0
                            ? <>Commission: <strong>{fmt(selectedCommission)}</strong></>
                            : <span style={{ color: 'var(--muted)' }}>No commission data — enter amount manually</span>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className={styles.paySection}>
              <div className={styles.paySectionTitle}>
                {target === 'baeko' ? 'BAEKO Payment' : `${selPerson} — Commission`}
                {histRow && (
                  <span className={styles.paySectionRef}>
                    ref: {target === 'baeko'
                      ? fmt(n2(histRow.baeko_amount))
                      : selectedCommission > 0 ? fmt(selectedCommission) : 'manual'}
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
                <button className={styles.addSplitBtn} onClick={() => setLines(p => [...p, newLine()])}>
                  + Add Split
                </button>
                <div className={styles.splitTotal}>Total: <strong>{fmt(total)}</strong></div>
              </div>
              {saveErr && <div style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</div>}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          {step === 1 && <>
            <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button className={styles.btnSave} onClick={() => setStep(2)}>Next →</button>
          </>}
          {step === 2 && <>
            <button className={styles.btnCancel} onClick={() => setStep(1)}>← Back</button>
            {!paidStatus.allDone && !dataLoading && (
              <button className={styles.btnSave} disabled={!canNext2} onClick={handleNext2}>Next →</button>
            )}
          </>}
          {step === 3 && <>
            <button className={styles.btnCancel} onClick={() => setStep(2)}>← Back</button>
            <button className={styles.btnSave} disabled={total === 0 || saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>}
        </div>
      </div>
    </div>
  )
}

// ── Detail Modal ─────────────────────────────────────────────────
function DetailModal({
  row,
  onReload,
  onClose,
}: {
  row: HistoryRow
  onReload: () => void
  onClose: () => void
}) {
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editDraft,       setEditDraft]       = useState<ApiPayment | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [saving,          setSaving]          = useState(false)

  const payments = row.payments
  const startEdit = (p: ApiPayment) => { setConfirmDeleteId(null); setEditingId(p.id); setEditDraft({ ...p }) }
  const cancelEdit = () => { setEditingId(null); setEditDraft(null) }

  const saveEdit = async () => {
    if (!editDraft) return
    setSaving(true)
    try {
      await authFetch(`/api/settlements/payments/${editDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_type: editDraft.recipient_type,
          sales_person: editDraft.sales_person,
          amount: Number(editDraft.amount),
          method: editDraft.method,
          paid_date: editDraft.paid_date,
          memo: editDraft.memo,
        }),
      })
      setEditingId(null); setEditDraft(null); onReload()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      await authFetch(`/api/settlements/payments/${id}`, { method: 'DELETE' })
      setConfirmDeleteId(null); onReload()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const updateDraft = (patch: Partial<ApiPayment>) =>
    setEditDraft(prev => prev ? { ...prev, ...patch } : null)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Payment Records — {mLabel(row.month)}</div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {payments.length === 0 ? (
            <div className={styles.empty}>No payment records for this month.</div>
          ) : payments.map(pay => {
            const isEditing = editingId === pay.id
            const draft     = isEditing && editDraft ? editDraft : pay
            const isConfirm = confirmDeleteId === pay.id
            return (
              <div key={pay.id}
                className={`${styles.detailRecord} ${isEditing ? styles.detailRecordEditing : ''}`}>
                <div className={styles.detailRecordHead}>
                  <span className={styles.payDot}
                    style={{ background: pay.recipient_type === 'baeko' ? '#FD4C1D' : '#F59E0B' }} />
                  <span className={styles.detailRecordTarget}>
                    {pay.recipient_type === 'baeko' ? 'BAEKO (30%)' : `${pay.sales_person ?? '?'} — Sales`}
                  </span>
                  <span className={styles.detailRecordTot}>{fmt(n2(pay.amount))}</span>
                  {!isEditing && !isConfirm && (
                    <div className={styles.detailRecordActions}>
                      <button className={styles.editRecBtn} onClick={() => startEdit(pay)}>Edit</button>
                      <button className={styles.deleteRecBtn}
                        onClick={() => setConfirmDeleteId(pay.id)}>Delete</button>
                    </div>
                  )}
                  {isConfirm && (
                    <div className={styles.confirmDelete}>
                      <span className={styles.confirmDeleteMsg}>Delete this record?</span>
                      <button className={styles.confirmYesBtn} disabled={saving}
                        onClick={() => handleDelete(pay.id)}>Yes, Delete</button>
                      <button className={styles.confirmNoBtn}
                        onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                <div className={styles.detailLines}>
                  {isEditing ? (
                    <div className={styles.editLineGrid}>
                      <div className={styles.editLineNum}>#1</div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Amount</label>
                        <input type="number" min="0" step="0.01" className={styles.input}
                          value={String(draft.amount)}
                          onChange={e => updateDraft({ amount: e.target.value })} />
                      </div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Method</label>
                        <select className={styles.select} value={draft.method}
                          onChange={e => updateDraft({ method: e.target.value })}>
                          {ALL_METHODS.filter(Boolean).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formField}>
                        <label className={styles.fieldLabel}>Date</label>
                        <input type="date" className={styles.input}
                          value={draft.paid_date?.slice(0, 10) ?? ''}
                          onChange={e => updateDraft({ paid_date: e.target.value })} />
                      </div>
                      <div className={`${styles.formField} ${styles.editLineMemo}`}>
                        <label className={styles.fieldLabel}>Memo</label>
                        <input type="text" className={styles.input}
                          value={draft.memo ?? ''}
                          onChange={e => updateDraft({ memo: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.detailLine}>
                      <span className={styles.detailLineIdx}>#1</span>
                      <span className={styles.detailLineAmt}>{fmt(n2(pay.amount))}</span>
                      <span className={`${styles.badge} ${styles.badgeMethod}`}>{pay.method || '—'}</span>
                      <span className={styles.detailLineDate}>{pay.paid_date?.slice(0, 10) ?? '—'}</span>
                      {pay.memo && <span className={styles.detailLineMemo}>{pay.memo}</span>}
                    </div>
                  )}
                </div>
                {isEditing && (
                  <div className={styles.editActions}>
                    <button className={styles.btnCancel} onClick={cancelEdit}>Cancel</button>
                    <button className={styles.btnSave} disabled={saving} onClick={saveEdit}>
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSave} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function SettlementPage() {
  usePageLog('settlement')
  // ── Core state ────────────────────────────────────────────────
  const [historyRows,   setHistoryRows]   = useState<HistoryRow[]>([])
  const [monthData,     setMonthData]     = useState<MonthData | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr())
  const [histLoading,   setHistLoading]   = useState(true)
  const [monthLoading,  setMonthLoading]  = useState(true)
  const [showPayModal,  setShowPayModal]  = useState(false)
  const [detailRow,     setDetailRow]     = useState<HistoryRow | null>(null)

  // ── Payment summary state ─────────────────────────────────────
  const [summaryData,     setSummaryData]     = useState<SummaryData | null>(null)
  const [showPaidHistory, setShowPaidHistory] = useState(false)

  // ── View mode + custom range state ───────────────────────────
  const [viewMode,     setViewMode]     = useState<'monthly' | 'custom'>('monthly')
  const [rangeFrom,    setRangeFrom]    = useState(firstDayOfMonth())
  const [rangeTo,      setRangeTo]      = useState(todayStr())
  const [rangeData,    setRangeData]    = useState<RangeData | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  // ── Load summary ─────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    try {
      const res = await authFetch(`/api/settlements/summary`)
      setSummaryData((await res.json()) as SummaryData)
    } catch { /* ignore */ }
  }, [])

  // ── Load history ──────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const res  = await authFetch(`/api/settlements/history`)
      const data = (await res.json()) as HistoryRow[]
      setHistoryRows(data)
      const visible = data.filter(r => r.month >= HISTORY_START)
      const cur = visible.find(r => r.month === thisMonthStr())
      if (cur) setSelectedMonth(cur.month)
      else if (visible.length > 0) setSelectedMonth(visible[0].month)
    } catch { /* ignore */ }
    finally { setHistLoading(false) }
  }, [])

  // ── Load single month data ────────────────────────────────────
  const loadMonthData = useCallback(async (monthStr: string) => {
    setMonthLoading(true)
    try {
      const [y, m] = monthStr.split('-')
      const res  = await authFetch(`/api/settlements/month?year=${y}&month=${parseInt(m)}`)
      setMonthData((await res.json()) as MonthData)
    } catch { /* ignore */ }
    finally { setMonthLoading(false) }
  }, [])

  const fetchMonth = useCallback(async (monthStr: string): Promise<MonthData> => {
    const [y, m] = monthStr.split('-')
    const res = await authFetch(`/api/settlements/month?year=${y}&month=${parseInt(m)}`)
    return (await res.json()) as MonthData
  }, [])

  // ── Load range data ───────────────────────────────────────────
  const loadRangeData = useCallback(async (from: string, to: string) => {
    if (!from || !to) return
    setRangeLoading(true)
    try {
      const res = await authFetch(
        `/api/settlements/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
      setRangeData((await res.json()) as RangeData)
    } catch { /* ignore */ }
    finally { setRangeLoading(false) }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { if (selectedMonth) loadMonthData(selectedMonth) }, [selectedMonth, loadMonthData])

  // ── Post a payment ────────────────────────────────────────────
  const handleSavePayment = useCallback(async (payload: {
    month: string; recipient_type: 'baeko' | 'sales_person'
    sales_person?: string; amount: number; method: string; paid_date: string; memo?: string
  }) => {
    const res = await authFetch(`/api/settlements/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    await Promise.all([loadHistory(), loadMonthData(payload.month), loadSummary()])
  }, [loadHistory, loadMonthData, loadSummary])

  // ── Reload after detail edit/delete ──────────────────────────
  const handleDetailReload = useCallback(async () => {
    if (!detailRow) return
    const updated = await fetchMonth(detailRow.month)
    setHistoryRows(prev => prev.map(r =>
      r.month === detailRow.month
        ? { ...r, settlement_id: updated.settlement_id, payments: updated.payments }
        : r
    ))
    setDetailRow(prev => prev
      ? { ...prev, settlement_id: updated.settlement_id, payments: updated.payments }
      : null
    )
    if (selectedMonth === detailRow.month) setMonthData(updated)
  }, [detailRow, fetchMonth, selectedMonth])

  // ── Filtered history (2024-12 onwards) ───────────────────────
  const filteredHistory = useMemo(
    () => historyRows.filter(r => r.month >= HISTORY_START),
    [historyRows]
  )

  // ── Split history into unpaid / fully-paid ───────────────────
  const { unpaidRows, paidRows } = useMemo(() => ({
    unpaidRows: filteredHistory.filter(r => !isRowFullyPaid(r)),
    paidRows:   filteredHistory.filter(r =>  isRowFullyPaid(r)),
  }), [filteredHistory])

  // ── Active sales persons across filtered history ──────────────
  const activeSalesPersons = useMemo(() => {
    const names = new Set<string>()
    filteredHistory.forEach(row => {
      (row.salesPersonCommissions ?? []).forEach(spc => names.add(spc.name))
    })
    return Array.from(names).sort()
  }, [filteredHistory])

  // ── Active display data (monthly or range) ───────────────────
  const activeData: DisplayData | null = useMemo(() => {
    if (viewMode === 'custom') return rangeData ?? null
    return monthData ?? null
  }, [viewMode, monthData, rangeData])

  const activeLoading = viewMode === 'custom' ? rangeLoading : monthLoading

  const totals = useMemo(() => {
    if (!activeData) return { revenue: 0, cost: 0, profit: 0, baeko: 0, sales: 0, overhead: 0 }
    const revenue = n2(activeData.revenue)
    const cost    = n2(activeData.ups_cost)
    const profit  = n2(activeData.net_profit)
    return { revenue, cost, profit,
      baeko:    n2(activeData.baeko_amount),
      sales:    n2(activeData.sales_amount),
      overhead: n2(activeData.overhead_amount),
    }
  }, [activeData])

  const displaySalesPersons = activeData?.sales_persons ?? []
  const displayShipments    = activeData?.shipments ?? 0

  // Paid amounts for the current period (monthly mode only — payments live on monthData)
  const currentPeriodPaid = useMemo(() => {
    if (viewMode !== 'monthly' || !monthData) return null
    const pays = monthData.payments
    const baeko = payTotal(pays.filter(p => p.recipient_type === 'baeko'))
    const byPerson: Record<string, number> = {}
    for (const p of pays) {
      if (p.recipient_type === 'sales_person' && p.sales_person) {
        byPerson[p.sales_person] = (byPerson[p.sales_person] ?? 0) + n2(p.amount)
      }
    }
    const salesTotal = Object.values(byPerson).reduce((a, v) => a + v, 0)
    return { baeko, byPerson, salesTotal }
  }, [viewMode, monthData])

  const DIST = [
    { label: 'BAEKO (30%)',    pctVal: 30, value: totals.baeko,    color: '#FD4C1D' },
    { label: 'Sales (10%)',    pctVal: 10, value: totals.sales,    color: '#F59E0B' },
    { label: 'Overhead (60%)', pctVal: 60, value: totals.overhead, color: '#10B981' },
  ]

  const spin = (v: string | number | undefined) =>
    activeLoading ? '…' : fmt(n2(v))

  // ── Excel export ──────────────────────────────────────────────
  const handleExportExcel = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const data = filteredHistory.map(row => {
      const baekoPays   = row.payments.filter(p => p.recipient_type === 'baeko')
      const baekoPaid   = payTotal(baekoPays)
      const baekoAmt    = n2(row.baeko_amount)
      const baekoStatus = baekoPaid <= 0 ? 'Unpaid'
        : (baekoAmt === 0 || baekoPaid >= baekoAmt * 0.99) ? 'Paid' : 'Partial'

      const base: Record<string, string | number> = {
        'Month':          row.month,
        'Shipments':      n2(row.shipments),
        'Revenue':        n2(row.revenue),
        'UPS Cost':       n2(row.ups_cost),
        'Net Profit':     n2(row.net_profit),
        'BAEKO (30%)':    n2(row.baeko_amount),
        'Sales (10%)':    n2(row.sales_amount),
        'Overhead (60%)': n2(row.overhead_amount),
        'BAEKO Payment':  baekoStatus,
      }

      // Dynamic SP columns
      activeSalesPersons.forEach(name => {
        const spc = (row.salesPersonCommissions ?? []).find(s => s.name === name)
        base[`${name} Commission`] = spc ? spc.commission : 0
        base[`${name} Paid`]       = spc ? (spc.paid ? 'Paid' : 'Unpaid') : 'N/A'
      })

      return base
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Settlement')
    XLSX.writeFile(wb, `EZHEYO_Settlement_${today}.xlsx`)
  }, [filteredHistory, activeSalesPersons])

  // colSpan for history table = fixed cols + (2 per SP)
  const histColSpan = 9 + activeSalesPersons.length

  return (
    <div className={styles.page}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Settlement</div>
          <div className={styles.subtitle}>Monthly profit &amp; commission breakdown</div>
        </div>
        <button className={styles.btnPay} onClick={() => setShowPayModal(true)}
          disabled={histLoading || filteredHistory.length === 0}>
          + Pay
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        {/* View mode toggle */}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'monthly' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('monthly')}>
            Monthly
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'custom' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('custom')}>
            Custom Range
          </button>
        </div>

        {/* Monthly: month selector */}
        {viewMode === 'monthly' && (
          <select className={styles.monthSelect} value={selectedMonth}
            disabled={histLoading}
            onChange={e => setSelectedMonth(e.target.value)}>
            {histLoading
              ? <option>Loading…</option>
              : filteredHistory.map(r => (
                  <option key={r.month} value={r.month}>{mLabel(r.month)}</option>
                ))
            }
          </select>
        )}

        {/* Custom Range: from / to / query button */}
        {viewMode === 'custom' && (
          <div className={styles.rangeControls}>
            <label className={styles.rangeLabel}>From</label>
            <input type="date" className={styles.rangeInput}
              value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
            <label className={styles.rangeLabel}>To</label>
            <input type="date" className={styles.rangeInput}
              value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
            <button className={styles.queryBtn}
              disabled={!rangeFrom || !rangeTo || rangeLoading}
              onClick={() => loadRangeData(rangeFrom, rangeTo)}>
              {rangeLoading ? 'Loading…' : '조회'}
            </button>
            {rangeData && !rangeLoading && (
              <span className={styles.rangeNote}>
                {rangeData.from} ~ {rangeData.to}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Row 1: Business summary ──────────────────────────────── */}
      <div className={styles.statsRow1}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Revenue</div>
          <div className={styles.cardValue}>{spin(activeData?.revenue)}</div>
          <div className={styles.cardSub}>
            {activeLoading ? '…' : `${displayShipments.toLocaleString()} shipments`}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>UPS Cost</div>
          <div className={`${styles.cardValue} ${styles.negative}`}>{spin(activeData?.ups_cost)}</div>
          <div className={styles.cardSub} style={{ color: '#EF4444' }}>
            {activeLoading ? '…' : pct(totals.cost, totals.revenue)} of revenue
          </div>
        </div>
        <div className={`${styles.card} ${styles.cardProfit}`}>
          <div className={styles.cardLabel}>Net Profit</div>
          <div className={`${styles.cardValue} ${styles.profit}`}>{spin(activeData?.net_profit)}</div>
          <div className={styles.cardSub} style={{ color: '#10B981' }}>
            {activeLoading ? '…' : pct(totals.profit, totals.revenue)} margin
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Shipments</div>
          <div className={styles.cardValue}>
            {activeLoading ? '…' : displayShipments.toLocaleString()}
          </div>
          <div className={styles.cardSub}>this period</div>
        </div>
      </div>

      {/* ── Row 2: Distribution + Payment status ─────────────────── */}
      <div className={styles.statsRow2}>
        {/* BAEKO (30%) */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>BAEKO (30%)</div>
          <div className={styles.cardValue} style={{ color: '#3B82F6' }}>
            {spin(activeData?.baeko_amount)}
          </div>
          {!activeLoading && currentPeriodPaid !== null && (
            <>
              <div className={styles.cardPayLine}>
                <span className={styles.cardPayLabel}>Paid</span>
                <span className={currentPeriodPaid.baeko > 0 ? styles.amountPaid : styles.amountUnpaid}>
                  {fmt(currentPeriodPaid.baeko)}
                </span>
              </div>
              <div className={styles.cardPayLine}>
                <span className={styles.cardPayLabel}>Unpaid</span>
                <span className={styles.amountUnpaid}>
                  {fmt(Math.max(0, totals.baeko - currentPeriodPaid.baeko))}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sales (10%) */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Sales (10%)</div>
          <div className={styles.cardValue} style={{ color: '#F59E0B' }}>
            {spin(activeData?.sales_amount)}
          </div>
          {!activeLoading && currentPeriodPaid !== null && (
            <>
              <div className={styles.cardPayLine}>
                <span className={styles.cardPayLabel}>Paid</span>
                <span className={currentPeriodPaid.salesTotal > 0 ? styles.amountPaid : styles.amountUnpaid}>
                  {fmt(currentPeriodPaid.salesTotal)}
                </span>
              </div>
              <div className={styles.cardPayLine}>
                <span className={styles.cardPayLabel}>Unpaid</span>
                <span className={styles.amountUnpaid}>
                  {fmt(Math.max(0, totals.sales - currentPeriodPaid.salesTotal))}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sales Person breakdown */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Sales Persons</div>
          {activeLoading ? (
            <div className={styles.muted} style={{ fontSize: 13, marginTop: 8 }}>Loading…</div>
          ) : displaySalesPersons.length === 0 ? (
            <div className={styles.muted} style={{ fontSize: 12, marginTop: 8 }}>No commissions this period</div>
          ) : (
            <div className={styles.salesPersonGrid}>
              {displaySalesPersons.map(sp => {
                const paid = currentPeriodPaid?.byPerson[sp.sales_person] ?? 0
                const comm = n2(sp.commission)
                const isPaid = comm > 0 && paid >= comm * 0.99
                return (
                  <div key={sp.sales_person_id} className={styles.salesPersonItem}>
                    <div className={styles.salesPersonName}>{sp.sales_person}</div>
                    <div className={styles.salesPersonAmount}>{fmt(comm)}</div>
                    {currentPeriodPaid !== null && (
                      <div className={`${styles.salesPersonPaid} ${isPaid ? styles.salesPersonPaidYes : styles.salesPersonPaidNo}`}>
                        {isPaid ? '✓ Paid' : 'Unpaid'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Overhead (60%) */}
        <div className={styles.card}>
          <div className={styles.cardLabel}>Overhead (60%)</div>
          <div className={styles.cardValue} style={{ color: '#10B981' }}>
            {spin(activeData?.overhead_amount)}
          </div>
          <div className={styles.cardSub}>operating expenses</div>
        </div>
      </div>

      {/* ── Cumulative Payment Summary ──────────────────────────── */}
      {summaryData && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Cumulative Payment Summary
            <span className={styles.sectionHint}>Since Dec 2024</span>
          </div>
          <table className={styles.summaryTable}>
            <thead>
              <tr>
                <th></th>
                <th>Earned</th>
                <th>Paid</th>
                <th>Unpaid</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.rowBaeko}>
                <td>BAEKO</td>
                <td>{fmt(summaryData.baeko.totalEarned)}</td>
                <td className={summaryData.baeko.totalPaid > 0 ? styles.amountPaid : styles.amountUnpaid}>
                  {fmt(summaryData.baeko.totalPaid)}
                </td>
                <td className={summaryData.baeko.totalUnpaid > 0 ? styles.amountUnpaid : styles.amountPaid}>
                  {fmt(summaryData.baeko.totalUnpaid)}
                </td>
              </tr>
              {summaryData.salesPersons.map(sp => (
                <tr key={sp.name} className={styles.rowSales}>
                  <td>{sp.name}</td>
                  <td>{fmt(sp.totalEarned)}</td>
                  <td className={sp.totalPaid > 0 ? styles.amountPaid : styles.amountUnpaid}>
                    {fmt(sp.totalPaid)}
                  </td>
                  <td className={sp.totalUnpaid > 0 ? styles.amountUnpaid : styles.amountPaid}>
                    {fmt(sp.totalUnpaid)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(() => {
                const totalEarned = summaryData.baeko.totalEarned
                  + summaryData.salesPersons.reduce((a, s) => a + s.totalEarned, 0)
                return (
                  <tr className={styles.rowTotal}>
                    <td>TOTAL</td>
                    <td>{fmt(totalEarned)}</td>
                    <td className={summaryData.totalPaid > 0 ? styles.amountPaid : styles.amountUnpaid}>
                      {fmt(summaryData.totalPaid)}
                    </td>
                    <td className={summaryData.totalUnpaid > 0 ? styles.amountUnpaid : styles.amountPaid}>
                      {fmt(summaryData.totalUnpaid)}
                    </td>
                  </tr>
                )
              })()}
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Distribution + Commission table ───────────────────── */}
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
                  <span className={styles.distValue}>{activeLoading ? '…' : fmt(d.value)}</span>
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
              <span>{activeLoading ? '…' : fmt(totals.revenue)}</span>
            </div>
            <div className={styles.formulaRow}>
              <span className={styles.formulaLabel}>− UPS Cost</span>
              <span className={styles.negative}>{activeLoading ? '…' : fmt(totals.cost)}</span>
            </div>
            <div className={`${styles.formulaRow} ${styles.formulaTotal}`}>
              <span className={styles.formulaLabel}>= Net Profit</span>
              <span className={styles.profit}>{activeLoading ? '…' : fmt(totals.profit)}</span>
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
                {activeLoading ? (
                  <tr><td colSpan={6} className={styles.empty}>Loading…</td></tr>
                ) : displaySalesPersons.length === 0 ? (
                  <tr><td colSpan={6} className={styles.empty}>No commission data for this period.</td></tr>
                ) : displaySalesPersons.map(sp => (
                  <tr key={sp.sales_person_id}>
                    <td><div className={styles.personName}>{sp.sales_person}</div></td>
                    <td className={styles.tdRight}>{sp.shipments.toLocaleString()}</td>
                    <td className={styles.tdRight}>{fmt(n2(sp.revenue))}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(n2(sp.ups_cost))}</td>
                    <td className={styles.tdRight}>{fmt(n2(sp.profit))}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(n2(sp.commission))}</td>
                  </tr>
                ))}
              </tbody>
              {!activeLoading && displaySalesPersons.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel}>Total</td>
                    <td className={styles.tdRight}>{displayShipments.toLocaleString()}</td>
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

      {/* ── History: Unpaid / In Progress ──────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Settlement History
          <span className={styles.sectionHint}>Click a row to view &amp; edit payment records</span>
          <button className={styles.exportBtn} onClick={handleExportExcel}
            disabled={histLoading || filteredHistory.length === 0}>
            ↓ Export Excel
          </button>
        </div>

        {/* ── Unpaid section ─────────────────────────────────── */}
        <div className={styles.histSectionHead + ' ' + styles.histSectionUnpaid}>
          ⚠ Unpaid / In Progress
          <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11 }}>
            {histLoading ? '…' : `${unpaidRows.length} month${unpaidRows.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className={styles.tableWrap} style={{ marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={styles.thRight}>Shipments</th>
                <th className={styles.thRight}>Revenue</th>
                <th className={styles.thRight}>UPS Cost</th>
                <th className={styles.thRight}>Net Profit</th>
                <th className={styles.thRight}>BAEKO (30%)</th>
                <th className={styles.thRight}>Sales (10%)</th>
                <th className={styles.thRight}>Overhead (60%)</th>
                <th className={styles.thCenter}>BAEKO</th>
                {activeSalesPersons.map(name => (
                  <th key={name} className={styles.thCenter}>{name.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {histLoading ? (
                <tr><td colSpan={histColSpan} className={styles.empty}>Loading history…</td></tr>
              ) : unpaidRows.length === 0 ? (
                <tr><td colSpan={histColSpan} className={styles.empty}>All months are fully paid. 🎉</td></tr>
              ) : unpaidRows.map(row => (
                <tr key={row.month} className={styles.historyRow} onClick={() => setDetailRow(row)}>
                  <td className={styles.monthCell}>{mLabel(row.month)}</td>
                  <td className={styles.tdRight}>{n2(row.shipments).toLocaleString()}</td>
                  <td className={styles.tdRight}>{fmt(n2(row.revenue))}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(n2(row.ups_cost))}</td>
                  <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(n2(row.net_profit))}</td>
                  <td className={styles.tdRight} style={{ color: '#FD4C1D', fontWeight: 600 }}>
                    {fmt(n2(row.baeko_amount))}
                  </td>
                  <td className={styles.tdRight} style={{ color: '#F59E0B', fontWeight: 600 }}>
                    {fmt(n2(row.sales_amount))}
                  </td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(n2(row.overhead_amount))}</td>
                  <td className={styles.tdCenter}><BaekoCell row={row} /></td>
                  {activeSalesPersons.map(name => (
                    <td key={name} className={styles.tdCenter}><SpCell row={row} name={name} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
            {!histLoading && unpaidRows.length > 0 && (() => {
              const t = sumRows(unpaidRows)
              return (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel}>Total ({unpaidRows.length})</td>
                    <td className={styles.tdRight}>{t.shipments.toLocaleString()}</td>
                    <td className={styles.tdRight}>{fmt(t.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(t.ups_cost)}</td>
                    <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(t.net_profit)}</td>
                    <td className={styles.tdRight} style={{ color: '#FD4C1D', fontWeight: 600 }}>{fmt(t.baeko)}</td>
                    <td className={styles.tdRight} style={{ color: '#F59E0B', fontWeight: 600 }}>{fmt(t.sales)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(t.overhead)}</td>
                    <td />{activeSalesPersons.map(name => <td key={name} />)}
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>

        {/* ── Paid History section ────────────────────────────── */}
        <div className={styles.histSectionHead + ' ' + styles.histSectionPaid}>
          ✓ Paid History
          <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11 }}>
            {histLoading ? '…' : `${paidRows.length} month${paidRows.length !== 1 ? 's' : ''}`}
          </span>
          <button
            className={styles.showHideBtn}
            onClick={() => setShowPaidHistory(v => !v)}>
            {showPaidHistory ? 'Hide' : 'Show'}
          </button>
        </div>
        {showPaidHistory && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className={styles.thRight}>Shipments</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Net Profit</th>
                  <th className={styles.thRight}>BAEKO (30%)</th>
                  <th className={styles.thRight}>Sales (10%)</th>
                  <th className={styles.thRight}>Overhead (60%)</th>
                  <th className={styles.thCenter}>BAEKO</th>
                  {activeSalesPersons.map(name => (
                    <th key={name} className={styles.thCenter}>{name.split(' ')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paidRows.length === 0 ? (
                  <tr><td colSpan={histColSpan} className={styles.empty}>No fully paid months yet.</td></tr>
                ) : paidRows.map(row => (
                  <tr key={row.month} className={styles.historyRow} onClick={() => setDetailRow(row)}>
                    <td className={styles.monthCell}>{mLabel(row.month)}</td>
                    <td className={styles.tdRight}>{n2(row.shipments).toLocaleString()}</td>
                    <td className={styles.tdRight}>{fmt(n2(row.revenue))}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(n2(row.ups_cost))}</td>
                    <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(n2(row.net_profit))}</td>
                    <td className={styles.tdRight} style={{ color: '#FD4C1D', fontWeight: 600 }}>
                      {fmt(n2(row.baeko_amount))}
                    </td>
                    <td className={styles.tdRight} style={{ color: '#F59E0B', fontWeight: 600 }}>
                      {fmt(n2(row.sales_amount))}
                    </td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(n2(row.overhead_amount))}</td>
                    <td className={styles.tdCenter}><BaekoCell row={row} /></td>
                    {activeSalesPersons.map(name => (
                      <td key={name} className={styles.tdCenter}><SpCell row={row} name={name} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {paidRows.length > 0 && (() => {
                const t = sumRows(paidRows)
                return (
                  <tfoot>
                    <tr className={styles.footRow}>
                      <td className={styles.footLabel}>Total ({paidRows.length})</td>
                      <td className={styles.tdRight}>{t.shipments.toLocaleString()}</td>
                      <td className={styles.tdRight}>{fmt(t.revenue)}</td>
                      <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(t.ups_cost)}</td>
                      <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(t.net_profit)}</td>
                      <td className={styles.tdRight} style={{ color: '#FD4C1D', fontWeight: 600 }}>{fmt(t.baeko)}</td>
                      <td className={styles.tdRight} style={{ color: '#F59E0B', fontWeight: 600 }}>{fmt(t.sales)}</td>
                      <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(t.overhead)}</td>
                      <td />{activeSalesPersons.map(name => <td key={name} />)}
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showPayModal && filteredHistory.length > 0 && (
        <PayModal
          historyRows={filteredHistory}
          onFetchMonth={fetchMonth}
          onSave={handleSavePayment}
          onClose={() => setShowPayModal(false)}
        />
      )}
      {detailRow && (
        <DetailModal
          row={detailRow}
          onReload={handleDetailReload}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  )
}
