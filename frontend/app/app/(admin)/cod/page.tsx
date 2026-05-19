'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { authFetch } from '@/lib/auth'
import styles from './cod.module.css'

// ── Tab ───────────────────────────────────────────────────────
type Tab = 'statements' | 'payable' | 'batch' | 'history'

// ── API / Domain Types ────────────────────────────────────────
type ApiStatement = {
  id: string; statement_no: string; statement_date: string
  source: string; uploaded_at: string; parsed_status: string
  record_count: string | number
}
type CodStatement = {
  id: string; statementNo: string; statementDate: string
  source: 'Auto' | 'Manual'; uploadedDate: string
  parsedStatus: 'Parsed' | 'Pending' | 'Failed'
  recordCount: number; usedInBatch: boolean
}
type PayableRecord = {
  id: string; tracking_no: string
  cod_amount: number; check_amount: number; check_no: string
  pickup_date: string; delivery_date: string
  statement_no: string; statement_date: string
  localStatus?: 'collected' | 'paid' | 'returned'   // UI-only undo state
}
type PayableCustomer = {
  customer_id: string; customer_name: string; customer_email: string
  cod_payment_method: 'qb_bill' | 'zelle'
  record_count: number; total_check_amount: string | number
  records: PayableRecord[]
}
type Batch = {
  id: string; batch_date: string
  customer_id: string; customer_name: string; customer_email: string
  total_amount: string | number; method: string
  status: 'pending' | 'paid'; paid_date: string | null
  memo: string | null; record_count: string | number
}
type PaidRecord = {
  id: string; tracking_no: string
  check_amount: string | number; payment_method: string
  paid_date: string; customer_name: string
  statement_no: string
}

// ── Helpers ───────────────────────────────────────────────────
const fmt     = (n: number | string) => `$${Number(n).toFixed(2)}`
const fmtDate = (s: string | null)   => s ? s.slice(0, 10) : '—'

function mapStatement(s: ApiStatement): CodStatement {
  return {
    id:            s.id,
    statementNo:   s.statement_no,
    statementDate: s.statement_date?.slice(0, 10) ?? '',
    source:        s.source === 'auto' ? 'Auto' : 'Manual',
    uploadedDate:  s.uploaded_at?.slice(0, 10) ?? '',
    parsedStatus:  s.parsed_status === 'parsed' ? 'Parsed'
                 : s.parsed_status === 'failed'  ? 'Failed' : 'Pending',
    recordCount:   Number(s.record_count) || 0,
    usedInBatch:   false,
  }
}

// ── Main Page ─────────────────────────────────────────────────
export default function CodPage() {
  const [activeTab, setActiveTab] = useState<Tab>('statements')
  const [toast,     setToast]     = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }, [])

  // ═══ TAB 1: Statements state ═════════════════════════════════
  const [statements,   setStatements]  = useState<CodStatement[]>([])
  const [loadingStmts, setLoadingStmts] = useState(true)
  const [uploading,    setUploading]   = useState(false)
  const [showAllStmts, setShowAllStmts] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadStatements = useCallback(async () => {
    setLoadingStmts(true)
    try {
      const res = await authFetch('/api/cod/statements')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as ApiStatement[]
      setStatements(data.map(mapStatement))
    } catch (err) {
      showToast(`Failed to load statements: ${(err as Error).message}`)
    } finally {
      setLoadingStmts(false)
    }
  }, [showToast])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    showToast('Parsing PDF…')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res  = await authFetch('/api/cod/statements/upload', { method: 'POST', body: formData })
      const data = await res.json() as {
        error?: string; totalRecords?: number; matched?: number; unmatched?: number; returned?: number
      }
      if (!res.ok || data.error) { showToast(`Upload failed: ${data.error ?? `HTTP ${res.status}`}`); return }
      const { totalRecords = 0, matched = 0, unmatched = 0, returned = 0 } = data
      showToast(`Parsed ${totalRecords} records · ${matched} matched · ${unmatched} unmatched · ${returned} returned`)
      await loadStatements()
    } catch (err) {
      showToast(`Upload error: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  const displayedStmts = showAllStmts
    ? statements
    : statements.filter(s => s.parsedStatus !== 'Parsed' || s.recordCount > 0)

  const batchableStatements = useMemo(
    () => statements.filter(s => s.parsedStatus === 'Parsed' && s.recordCount > 0),
    [statements]
  )

  // ═══ TAB 2: Payable state ════════════════════════════════════
  const [payable,        setPayable]       = useState<PayableCustomer[]>([])
  const [loadingPayable, setLoadingPayable] = useState(false)
  const [processingIds,  setProcessingIds] = useState<Set<string>>(new Set())
  const [returning,      setReturning]     = useState<PayableRecord | null>(null)
  const [returnReason,   setReturnReason]  = useState('')
  const [confirmAllPaid, setConfirmAllPaid] = useState<PayableCustomer | null>(null)

  const loadPayable = useCallback(async () => {
    setLoadingPayable(true)
    try {
      const res = await authFetch('/api/cod/payable')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPayable(await res.json() as PayableCustomer[])
    } catch (err) {
      showToast(`Failed to load payable: ${(err as Error).message}`)
    } finally {
      setLoadingPayable(false)
    }
  }, [showToast])

  // Update a single record's local UI status (collected / paid / returned) without refetching
  const updateLocalStatus = useCallback(
    (recordId: string, status: PayableRecord['localStatus']) => {
      setPayable(prev =>
        prev.map(c => ({
          ...c,
          records: c.records.map(r => r.id === recordId ? { ...r, localStatus: status } : r),
        }))
      )
    }, []
  )

  const markRecordPaid = useCallback(async (record: PayableRecord) => {
    setProcessingIds(prev => new Set(prev).add(record.id))
    try {
      const res = await authFetch(`/api/cod/records/${record.id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ cod_status: 'paid' }),
      })
      if (!res.ok) { showToast('Failed to mark paid'); return }
      updateLocalStatus(record.id, 'paid')
      showToast(`✓ ${record.tracking_no} marked as paid`)
    } catch {
      showToast('Network error')
    } finally {
      setProcessingIds(prev => { const n = new Set(prev); n.delete(record.id); return n })
    }
  }, [showToast, updateLocalStatus])

  const handleReturn = async () => {
    if (!returning) return
    setProcessingIds(prev => new Set(prev).add(returning.id))
    try {
      const res = await authFetch(`/api/cod/records/${returning.id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ cod_status: 'returned', returned_reason: returnReason }),
      })
      if (!res.ok) { showToast('Failed to mark returned'); return }
      updateLocalStatus(returning.id, 'returned')
      showToast(`↩ ${returning.tracking_no} marked as returned`)
      setReturning(null); setReturnReason('')
    } catch {
      showToast('Network error')
    } finally {
      setProcessingIds(prev => { const n = new Set(prev); n.delete(returning.id); return n })
    }
  }

  const markAllPaid = async (customer: PayableCustomer) => {
    setConfirmAllPaid(null)
    // Only process records that are still in collected state
    const pending = customer.records.filter(r => !r.localStatus || r.localStatus === 'collected')
    for (const r of pending) {
      await markRecordPaid(r)
    }
  }

  const undoRecordStatus = useCallback(async (record: PayableRecord) => {
    setProcessingIds(prev => new Set(prev).add(record.id))
    try {
      const res = await authFetch(`/api/cod/records/${record.id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ cod_status: 'collected' }),
      })
      if (!res.ok) { showToast('Failed to undo'); return }
      updateLocalStatus(record.id, 'collected')
      showToast(`↺ ${record.tracking_no} restored to collected`)
    } catch {
      showToast('Network error')
    } finally {
      setProcessingIds(prev => { const n = new Set(prev); n.delete(record.id); return n })
    }
  }, [showToast, updateLocalStatus])

  const isCollected = (r: PayableRecord) => !r.localStatus || r.localStatus === 'collected'

  const payableStats = useMemo(() => ({
    count:     payable.reduce((a, c) => a + c.records.filter(isCollected).length, 0),
    amount:    payable.reduce((a, c) =>
                 a + c.records.filter(isCollected).reduce((s, r) => s + Number(r.check_amount), 0), 0),
    customers: payable.filter(c => c.records.some(isCollected)).length,
  }), [payable])  // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ TAB 3: Batch state ══════════════════════════════════════
  const [batches,        setBatches]       = useState<Batch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [showNewBatch,   setShowNewBatch]  = useState(false)
  const [batchName,      setBatchName]     = useState('')
  const [batchStart,     setBatchStart]    = useState('')
  const [batchEnd,       setBatchEnd]      = useState('')
  const [selStmtIds,     setSelStmtIds]    = useState<Set<string>>(new Set())
  const [creatingBatch,  setCreatingBatch] = useState(false)
  const [markingId,      setMarkingId]     = useState<string | null>(null)

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    try {
      const res = await authFetch('/api/cod/batches')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setBatches(await res.json() as Batch[])
    } catch (err) {
      showToast(`Failed to load batches: ${(err as Error).message}`)
    } finally {
      setLoadingBatches(false)
    }
  }, [showToast])

  const toggleStmt = (id: string) =>
    setSelStmtIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const createBatch = async () => {
    if (selStmtIds.size === 0) { showToast('Select at least one statement'); return }
    setCreatingBatch(true)
    try {
      const res = await authFetch('/api/cod/batches', {
        method: 'POST',
        body:   JSON.stringify({
          name:          batchName || `Week ${batchStart} ~ ${batchEnd}`,
          week_start:    batchStart,
          week_end:      batchEnd,
          statement_ids: Array.from(selStmtIds),
        }),
      })
      const data = await res.json() as { batches?: Batch[]; total?: number; error?: string }
      if (!res.ok || data.error) { showToast(data.error ?? 'Failed to create batch'); return }
      showToast(`✓ Created ${data.total} batch(es)`)
      setShowNewBatch(false); setBatchName(''); setBatchStart(''); setBatchEnd(''); setSelStmtIds(new Set())
      await loadBatches()
    } catch {
      showToast('Network error')
    } finally {
      setCreatingBatch(false)
    }
  }

  const markBatchPaid = async (batch: Batch) => {
    setMarkingId(batch.id)
    try {
      const res = await authFetch(`/api/cod/batches/${batch.id}/mark-paid`, { method: 'PATCH' })
      if (!res.ok) { showToast('Failed'); return }
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, status: 'paid' } : b))
      showToast(`✓ Batch marked as paid`)
    } catch {
      showToast('Network error')
    } finally {
      setMarkingId(null)
    }
  }

  const undoBatchPaid = async (batch: Batch) => {
    setMarkingId(batch.id)
    try {
      const res = await authFetch(`/api/cod/batches/${batch.id}/undo-paid`, { method: 'PATCH' })
      if (!res.ok) { showToast('Failed to undo batch'); return }
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, status: 'pending', paid_date: null } : b))
      showToast(`↺ Batch payment undone`)
    } catch {
      showToast('Network error')
    } finally {
      setMarkingId(null)
    }
  }

  // ═══ TAB 4: History state ════════════════════════════════════
  const [paidHistory,    setPaidHistory]   = useState<PaidRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historySearch,  setHistorySearch] = useState('')

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await authFetch('/api/cod/paid-history')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPaidHistory(await res.json() as PaidRecord[])
    } catch (err) {
      showToast(`Failed to load history: ${(err as Error).message}`)
    } finally {
      setLoadingHistory(false)
    }
  }, [showToast])

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim()
    if (!q) return paidHistory
    return paidHistory.filter(r =>
      r.tracking_no?.toLowerCase().includes(q) ||
      r.customer_name?.toLowerCase().includes(q) ||
      r.statement_no?.toLowerCase().includes(q)
    )
  }, [paidHistory, historySearch])

  // ═══ Initial loads ═══════════════════════════════════════════
  useEffect(() => { loadStatements() },                      [loadStatements])
  useEffect(() => { loadPayable() },                         [loadPayable])
  useEffect(() => { if (activeTab === 'batch')   loadBatches() },  [activeTab, loadBatches])
  useEffect(() => { if (activeTab === 'history') loadHistory() },  [activeTab, loadHistory])

  // ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* ── Tab Nav ────────────────────────────────────────────── */}
      <div className={styles.tabNav}>
        {([
          ['statements', 'Statements'],
          ['payable',    'COD Payable'],
          ['batch',      'Weekly Batch'],
          ['history',    'Paid History'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.tabBtn} ${activeTab === id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
            {id === 'payable' && payableStats.count > 0 && !loadingPayable && (
              <span className={styles.tabCount}>{payableStats.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB 1: STATEMENTS
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'statements' && (
        <div className={styles.stmtSection}>
          <div className={styles.stmtHeader}>
            <div>
              <div className={styles.stmtTitle}>COD Statements</div>
              <div className={styles.stmtSub}>Upload UPS COD PDFs to parse and track records</div>
            </div>
            <div className={styles.stmtActions}>
              <button className={styles.showAllToggle} onClick={() => setShowAllStmts(p => !p)}>
                {showAllStmts ? 'Active Only' : 'Show All'}
              </button>
              <button className={styles.btnUpload} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Uploading…' : '+ Upload PDF'}
              </button>
            </div>
          </div>

          <div className={styles.stmtTableWrap}>
            <table className={styles.stmtTable}>
              <thead>
                <tr>
                  <th>Statement No</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th className={styles.thCenter}>Records</th>
                  <th className={styles.thCenter}>Used in Batch</th>
                </tr>
              </thead>
              <tbody>
                {loadingStmts ? (
                  <tr><td colSpan={7} className={styles.empty}>Loading…</td></tr>
                ) : displayedStmts.length === 0 ? (
                  <tr><td colSpan={7} className={styles.empty}>No statements found.</td></tr>
                ) : displayedStmts.map(s => (
                  <tr key={s.id}>
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
                      <span className={s.usedInBatch ? styles.usedYes : styles.usedNo}>
                        {s.usedInBatch ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2: COD PAYABLE
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'payable' && (
        <>
          {/* Stats */}
          <div className={styles.stats} style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Collected Records</span>
              <span className={styles.statVal}>{loadingPayable ? '…' : payableStats.count}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total Amount</span>
              <span className={styles.statVal}>{loadingPayable ? '…' : fmt(payableStats.amount)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Customers</span>
              <span className={styles.statVal}>{loadingPayable ? '…' : payableStats.customers}</span>
            </div>
          </div>

          {/* Customer cards */}
          {loadingPayable ? (
            <div className={styles.recordsEmpty}>Loading payable records…</div>
          ) : payable.length === 0 ? (
            <div className={styles.recordsEmpty}>✅ No collected COD records to pay out.</div>
          ) : (
            <div className={styles.customerGroups} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {payable.map(customer => (
                <div key={customer.customer_id} className={styles.customerGroup}>
                  {/* Card header */}
                  <div className={styles.customerGroupHeader}>
                    <div className={styles.customerGroupInfo}>
                      <span className={styles.cgName}>{customer.customer_name}</span>
                      {customer.customer_email && (
                        <span className={styles.cgEmail}>{customer.customer_email}</span>
                      )}
                      <span className={`${styles.payMethodBadge} ${customer.cod_payment_method === 'zelle' ? styles.payMethodZelle : styles.payMethodQb}`}>
                        {customer.cod_payment_method === 'zelle' ? 'Zelle' : 'QB Bill'}
                      </span>
                    </div>
                    <div className={styles.cgRight}>
                      <span className={styles.cgTotal}>{fmt(customer.total_check_amount)}</span>
                      <button
                        className={styles.markAllPaidBtn}
                        onClick={() => setConfirmAllPaid(customer)}
                      >
                        Mark All Paid
                      </button>
                    </div>
                  </div>

                  {/* Records table */}
                  <div className={styles.customerGroupRows}>
                    <table className={styles.cgTable}>
                      <thead>
                        <tr>
                          <th>Tracking No</th>
                          <th>Statement</th>
                          <th>Pickup</th>
                          <th>Delivery</th>
                          <th className={styles.thRight}>COD Amt</th>
                          <th className={styles.thRight}>Check Amt</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {customer.records.map(r => (
                          <tr key={r.id} className={r.localStatus === 'paid' ? styles.rowPaid : r.localStatus === 'returned' ? styles.rowReturned : undefined}>
                            <td className={styles.tracking}>{r.tracking_no}</td>
                            <td className={styles.mono}>{r.statement_no}</td>
                            <td className={styles.muted}>{fmtDate(r.pickup_date)}</td>
                            <td className={styles.muted}>{fmtDate(r.delivery_date)}</td>
                            <td className={`${styles.bold} ${styles.thRight}`}>{fmt(r.cod_amount)}</td>
                            <td className={`${styles.bold} ${styles.thRight}`}>{fmt(r.check_amount)}</td>
                            <td className={styles.payableActions}>
                              {isCollected(r) ? (
                                <>
                                  <button
                                    className={styles.payPaidBtn}
                                    disabled={processingIds.has(r.id)}
                                    onClick={() => markRecordPaid(r)}
                                  >
                                    {processingIds.has(r.id) ? '…' : 'Mark Paid'}
                                  </button>
                                  <button
                                    className={styles.payReturnBtn}
                                    disabled={processingIds.has(r.id)}
                                    onClick={() => { setReturning(r); setReturnReason('') }}
                                  >
                                    Return
                                  </button>
                                </>
                              ) : r.localStatus === 'paid' ? (
                                <>
                                  <span className={styles.recordStatusPaid}>✓ Paid</span>
                                  <button
                                    className={styles.undoBtn}
                                    disabled={processingIds.has(r.id)}
                                    onClick={() => undoRecordStatus(r)}
                                  >
                                    {processingIds.has(r.id) ? '…' : 'Undo'}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className={styles.recordStatusReturned}>↩ Returned</span>
                                  <button
                                    className={styles.undoBtn}
                                    disabled={processingIds.has(r.id)}
                                    onClick={() => undoRecordStatus(r)}
                                  >
                                    {processingIds.has(r.id) ? '…' : 'Undo'}
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 3: WEEKLY BATCH
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'batch' && (
        <div className={styles.stmtSection}>
          <div className={styles.stmtHeader}>
            <div>
              <div className={styles.stmtTitle}>Weekly Batch</div>
              <div className={styles.stmtSub}>Group collected COD records by week and pay in bulk</div>
            </div>
            <button className={styles.btnUpload} onClick={() => setShowNewBatch(true)}>
              + New Batch
            </button>
          </div>

          {loadingBatches ? (
            <div className={styles.empty}>Loading batches…</div>
          ) : batches.length === 0 ? (
            <div className={styles.empty}>No batches yet. Create your first weekly batch.</div>
          ) : (
            <div className={styles.batchList}>
              {batches.map(b => (
                <div key={b.id} className={styles.batchCardRow}>
                  <div className={styles.batchCardMain}>
                    <div className={styles.batchCardName}>{b.memo || `Batch — ${fmtDate(b.batch_date)}`}</div>
                    <div className={styles.batchCardMeta}>
                      <span>{b.customer_name}</span>
                      <span className={styles.batchDot}>·</span>
                      <span>{Number(b.record_count)} records</span>
                      <span className={styles.batchDot}>·</span>
                      <span>{b.method}</span>
                      {b.paid_date && <>
                        <span className={styles.batchDot}>·</span>
                        <span>Paid {fmtDate(b.paid_date)}</span>
                      </>}
                    </div>
                  </div>
                  <div className={styles.batchCardRight}>
                    <span className={`${styles.batchStatusBadge} ${b.status === 'paid' ? styles.batchStatusPaid : styles.batchStatusPending}`}>
                      {b.status === 'paid' ? '✓ Paid' : 'Pending'}
                    </span>
                    <span className={styles.batchAmt}>{fmt(b.total_amount)}</span>
                    {b.status === 'paid' ? (
                      <button
                        className={styles.undoBatchBtn}
                        disabled={markingId === b.id}
                        onClick={() => undoBatchPaid(b)}
                      >
                        {markingId === b.id ? '…' : 'Undo Paid'}
                      </button>
                    ) : (
                      <button
                        className={styles.markBatchPaidBtn}
                        disabled={markingId === b.id}
                        onClick={() => markBatchPaid(b)}
                      >
                        {markingId === b.id ? '…' : 'Mark Paid'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 4: PAID HISTORY
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <div className={styles.stmtTitle}>
              Paid History
              {!loadingHistory && (
                <span className={styles.recordsCount}>{filteredHistory.length} records</span>
              )}
            </div>
            <input
              className={styles.recordsSearch}
              placeholder="Search tracking, customer, statement…"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
            />
          </div>
          <div className={styles.histTableWrap}>
            <table className={styles.histTable}>
              <thead>
                <tr>
                  <th>Paid Date</th>
                  <th>Customer</th>
                  <th>Tracking No</th>
                  <th>Statement No</th>
                  <th className={styles.thRight}>Amount</th>
                  <th>Payment Method</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr><td colSpan={6} className={styles.empty}>Loading…</td></tr>
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={6} className={styles.empty}>No paid records found.</td></tr>
                ) : filteredHistory.map(r => (
                  <tr key={r.id}>
                    <td className={styles.muted}>{fmtDate(r.paid_date)}</td>
                    <td className={styles.bold}>{r.customer_name || '—'}</td>
                    <td className={styles.tracking}>{r.tracking_no}</td>
                    <td className={styles.mono}>{r.statement_no}</td>
                    <td className={`${styles.bold} ${styles.thRight}`}>{fmt(r.check_amount)}</td>
                    <td>
                      <span className={`${styles.payMethodBadge} ${r.payment_method === 'zelle' ? styles.payMethodZelle : styles.payMethodQb}`}>
                        {r.payment_method === 'zelle' ? 'Zelle' : 'QB Bill'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Return Reason */}
      {returning && (
        <div className={styles.overlay} onClick={() => { setReturning(null); setReturnReason('') }}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>Mark as Returned</div>
                <div className={styles.modalSub}>{returning.tracking_no}</div>
              </div>
              <button className={styles.closeBtn} onClick={() => { setReturning(null); setReturnReason('') }}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Reason (optional)</label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Why is this being returned?"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => { setReturning(null); setReturnReason('') }}>Cancel</button>
              <button className={styles.dangerBtn} onClick={handleReturn}>Confirm Return</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Mark All Paid */}
      {confirmAllPaid && (
        <div className={styles.overlay} onClick={() => setConfirmAllPaid(null)}>
          <div className={styles.modal} style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Mark All Paid</div>
              <button className={styles.closeBtn} onClick={() => setConfirmAllPaid(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.confirmBox}>
                <div className={styles.confirmName}>{confirmAllPaid.customer_name}</div>
                <div className={styles.confirmDetail}>
                  {confirmAllPaid.records.length} records · {fmt(confirmAllPaid.total_check_amount)}
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                All collected records for this customer will be marked as paid.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setConfirmAllPaid(null)}>Cancel</button>
              <button className={styles.sendBtn} onClick={() => markAllPaid(confirmAllPaid)}>
                Confirm Mark All Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Batch */}
      {showNewBatch && (
        <div className={styles.overlay} onClick={() => setShowNewBatch(false)}>
          <div className={styles.modal} style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>New Weekly Batch</div>
                <div className={styles.modalSub}>Group collected records from selected statements</div>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowNewBatch(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Batch Name</label>
                <input
                  className={styles.modalInput}
                  placeholder="e.g. Week 2026-05-13 ~ 05-18"
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Week Start</label>
                  <input type="date" className={styles.modalInput} value={batchStart} onChange={e => setBatchStart(e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Week End</label>
                  <input type="date" className={styles.modalInput} value={batchEnd} onChange={e => setBatchEnd(e.target.value)} />
                </div>
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Statements to Include</label>
                {batchableStatements.length === 0 ? (
                  <div className={styles.muted} style={{ fontSize: 13, padding: '10px 0' }}>
                    No parsed statements with records available.
                  </div>
                ) : (
                  <div className={styles.stmtCheckList}>
                    {batchableStatements.map(s => (
                      <label key={s.id} className={styles.stmtCheckRow}>
                        <input type="checkbox" checked={selStmtIds.has(s.id)} onChange={() => toggleStmt(s.id)} />
                        <span className={styles.stmtNo}>{s.statementNo}</span>
                        <span className={styles.muted}>{s.statementDate}</span>
                        <span className={styles.muted}>· {s.recordCount} records</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {selStmtIds.size > 0 && (
                <div className={styles.batchPreview}>
                  <span>Selected: <strong>{selStmtIds.size}</strong> statement(s)</span>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowNewBatch(false)}>Cancel</button>
              <button
                className={styles.sendBtn}
                disabled={creatingBatch || selStmtIds.size === 0}
                onClick={createBatch}
              >
                {creatingBatch ? 'Creating…' : 'Create Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
