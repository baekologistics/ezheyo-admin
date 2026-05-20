'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { authFetch } from '@/lib/auth'
import styles from './cod.module.css'

// ── Tabs ──────────────────────────────────────────────────────────
type Tab = 'statements' | 'weekly' | 'history'

// ── API / Domain Types ────────────────────────────────────────────
type ApiStatement = {
  id: string; statement_no: string; statement_date: string
  source: string; uploaded_at: string; parsed_status: string
  record_count: string | number
}
type CodStatement = {
  id: string; statementNo: string; statementDate: string
  source: 'Auto' | 'Manual'; uploadedDate: string
  parsedStatus: 'Parsed' | 'Pending' | 'Failed'
  recordCount: number
}
type WeeklyRecord = {
  id: string; tracking_no: string
  cod_amount: number; check_amount: number; check_no: string
  pickup_date: string; delivery_date: string
  cod_status: 'collected' | 'paid' | 'returned'
  payment_method: string
  statement_no: string; statement_date: string
}
type WeeklyCustomer = {
  customer_id: string; customer_name: string; customer_email: string
  cod_payment_method: 'qb_bill' | 'zelle'
  record_count: number
  unpaid_amount: string | number
  total_check_amount: string | number
  records: WeeklyRecord[]
}
type PaidRecord = {
  id: string; tracking_no: string
  check_amount: string | number; payment_method: string
  paid_date: string; customer_name: string
  statement_no: string
}

// ── Helpers ───────────────────────────────────────────────────────
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
  }
}

// Last week Mon → Sat (default date range)
function getLastWeekRange(): { start: string; end: string } {
  const today      = new Date()
  const dayOfWeek  = today.getDay()           // 0=Sun … 6=Sat
  const lastMonday = new Date(today)
  lastMonday.setDate(today.getDate() - dayOfWeek - 6)
  const lastSaturday = new Date(lastMonday)
  lastSaturday.setDate(lastMonday.getDate() + 5)
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end:   lastSaturday.toISOString().slice(0, 10),
  }
}

// ── Main Page ─────────────────────────────────────────────────────
export default function CodPage() {
  const [activeTab, setActiveTab] = useState<Tab>('statements')
  const [toast,     setToast]     = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }, [])

  // ═══ TAB 1: Statements ═══════════════════════════════════════════
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

  // ═══ TAB 2: Weekly Payments ══════════════════════════════════════
  const defaultRange = useMemo(() => getLastWeekRange(), [])
  const [weekStart,      setWeekStart]      = useState(defaultRange.start)
  const [weekEnd,        setWeekEnd]        = useState(defaultRange.end)
  const [weeklyData,     setWeeklyData]     = useState<WeeklyCustomer[]>([])
  const [loadingWeekly,  setLoadingWeekly]  = useState(false)
  const [weeklyLoaded,   setWeeklyLoaded]   = useState(false)
  const [weekProcIds,    setWeekProcIds]    = useState<Set<string>>(new Set())

  const loadWeeklyPayments = useCallback(async (start: string, end: string) => {
    if (!start || !end) return
    setLoadingWeekly(true)
    try {
      const res = await authFetch(`/api/cod/weekly-payments?start=${start}&end=${end}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setWeeklyData(await res.json() as WeeklyCustomer[])
      setWeeklyLoaded(true)
    } catch (err) {
      showToast(`Failed to load: ${(err as Error).message}`)
    } finally {
      setLoadingWeekly(false)
    }
  }, [showToast])

  const setWeekRecordStatus = useCallback((recordId: string, status: WeeklyRecord['cod_status']) => {
    setWeeklyData(prev =>
      prev.map(c => ({
        ...c,
        records: c.records.map(r => r.id === recordId ? { ...r, cod_status: status } : r),
      }))
    )
  }, [])

  const markWeekRecordPaid = useCallback(async (record: WeeklyRecord) => {
    if (record.cod_status !== 'collected') return
    setWeekProcIds(prev => new Set(prev).add(record.id))
    try {
      const res = await authFetch(`/api/cod/records/${record.id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ cod_status: 'paid' }),
      })
      if (!res.ok) { showToast('Failed to mark paid'); return }
      setWeekRecordStatus(record.id, 'paid')
      showToast(`✓ ${record.tracking_no} marked as paid`)
    } catch {
      showToast('Network error')
    } finally {
      setWeekProcIds(prev => { const n = new Set(prev); n.delete(record.id); return n })
    }
  }, [showToast, setWeekRecordStatus])

  const markCustomerPaid = useCallback(async (customer: WeeklyCustomer) => {
    const pending = customer.records.filter(r => r.cod_status === 'collected')
    for (const r of pending) await markWeekRecordPaid(r)
  }, [markWeekRecordPaid])

  const markAllWeeklyPaid = useCallback(async () => {
    for (const c of weeklyData) await markCustomerPaid(c)
  }, [weeklyData, markCustomerPaid])

  const togglePaymentMethod = useCallback(async (customer: WeeklyCustomer) => {
    const next = customer.cod_payment_method === 'zelle' ? 'qb_bill' : 'zelle'
    // Optimistic update
    setWeeklyData(prev =>
      prev.map(c => c.customer_id === customer.customer_id ? { ...c, cod_payment_method: next } : c)
    )
    try {
      await authFetch(`/api/customers/${customer.customer_id}`, {
        method: 'PATCH',
        body:   JSON.stringify({ cod_payment_method: next }),
      })
    } catch {
      showToast('Failed to update payment method')
    }
  }, [showToast])

  const weeklyStats = useMemo(() => ({
    customers:   weeklyData.length,
    totalAmount: weeklyData.reduce((a, c) => a + Number(c.total_check_amount), 0),
    unpaidCount: weeklyData.reduce(
      (a, c) => a + c.records.filter(r => r.cod_status === 'collected').length, 0
    ),
  }), [weeklyData])

  // ═══ TAB 3: Paid History ═════════════════════════════════════════
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

  // ═══ Lifecycle ═══════════════════════════════════════════════════
  useEffect(() => { loadStatements() }, [loadStatements])
  useEffect(() => {
    if (activeTab === 'weekly' && !weeklyLoaded) loadWeeklyPayments(weekStart, weekEnd)
  }, [activeTab])                                            // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, loadHistory])

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* ── Tab Nav ──────────────────────────────────────────────── */}
      <div className={styles.tabNav}>
        {([
          ['statements', 'Statements'],
          ['weekly',     'Weekly Payments'],
          ['history',    'Paid History'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.tabBtn} ${activeTab === id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(id as Tab)}
          >
            {label}
            {id === 'weekly' && weeklyStats.unpaidCount > 0 && weeklyLoaded && !loadingWeekly && (
              <span className={styles.tabCount}>{weeklyStats.unpaidCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB 1: STATEMENTS
      ════════════════════════════════════════════════════════════ */}
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
                </tr>
              </thead>
              <tbody>
                {loadingStmts ? (
                  <tr><td colSpan={6} className={styles.empty}>Loading…</td></tr>
                ) : displayedStmts.length === 0 ? (
                  <tr><td colSpan={6} className={styles.empty}>No statements found.</td></tr>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 2: WEEKLY PAYMENTS
      ════════════════════════════════════════════════════════════ */}
      {activeTab === 'weekly' && (
        <>
          {/* Date Range Picker */}
          <div className={styles.weekNav}>
            <div className={styles.weekNavFields}>
              <div className={styles.weekNavField}>
                <label className={styles.weekNavLabel}>Week Start</label>
                <input
                  type="date"
                  className={styles.weekDateInput}
                  value={weekStart}
                  onChange={e => setWeekStart(e.target.value)}
                />
              </div>
              <span className={styles.weekNavSep}>—</span>
              <div className={styles.weekNavField}>
                <label className={styles.weekNavLabel}>Week End</label>
                <input
                  type="date"
                  className={styles.weekDateInput}
                  value={weekEnd}
                  onChange={e => setWeekEnd(e.target.value)}
                />
              </div>
              <button
                className={styles.weekLoadBtn}
                disabled={loadingWeekly}
                onClick={() => loadWeeklyPayments(weekStart, weekEnd)}
              >
                {loadingWeekly ? 'Loading…' : 'Load'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.stats} style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total Customers</span>
              <span className={styles.statVal}>{weeklyStats.customers}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total Amount</span>
              <span className={styles.statVal}>{fmt(weeklyStats.totalAmount)}</span>
            </div>
            <div className={`${styles.stat} ${weeklyStats.unpaidCount > 0 ? styles.statWarn : ''}`}>
              <span className={styles.statLabel}>Unpaid Records</span>
              <span className={styles.statVal}>{weeklyStats.unpaidCount}</span>
            </div>
          </div>

          {/* Bulk Actions */}
          {weeklyData.length > 0 && (
            <div className={styles.bulkActions}>
              <button className={styles.bulkEmailBtn}
                onClick={() => showToast('Email feature coming soon')}>
                ✉ Send All Emails
              </button>
              <button className={styles.bulkQbBtn}
                onClick={() => showToast('QB sync coming soon')}>
                ⚡ Sync All QB Bills
              </button>
              <button className={styles.markAllPaidBtn} onClick={markAllWeeklyPaid}>
                ✓ Mark All Paid
              </button>
            </div>
          )}

          {/* Customer Cards */}
          {loadingWeekly ? (
            <div className={styles.recordsEmpty}>Loading…</div>
          ) : !weeklyLoaded ? (
            <div className={styles.recordsEmpty}>Select a date range and click Load.</div>
          ) : weeklyData.length === 0 ? (
            <div className={styles.recordsEmpty}>No COD records found for this week.</div>
          ) : (
            <div className={styles.weeklyCards}>
              {weeklyData.map(customer => {
                const unpaid = customer.records.filter(r => r.cod_status === 'collected').length
                return (
                  <div key={customer.customer_id} className={styles.weekCard}>
                    {/* Card Header */}
                    <div className={styles.weekCardHeader}>
                      <div className={styles.weekCardInfo}>
                        <span className={styles.weekCardName}>{customer.customer_name}</span>
                        {customer.customer_email && (
                          <span className={styles.weekCardEmail}>{customer.customer_email}</span>
                        )}
                        <button
                          className={`${styles.payMethodBadge} ${customer.cod_payment_method === 'zelle' ? styles.payMethodZelle : styles.payMethodQb}`}
                          onClick={() => togglePaymentMethod(customer)}
                          title="Click to toggle payment method"
                        >
                          {customer.cod_payment_method === 'zelle' ? 'Zelle' : 'QB Bill'}
                          <span className={styles.methodToggleHint}> ↕</span>
                        </button>
                      </div>
                      <div className={styles.weekCardRight}>
                        <span className={styles.weekCardAmount}>{fmt(customer.total_check_amount)}</span>
                        <div className={styles.weekCardActions}>
                          <button className={styles.cardEmailBtn}
                            onClick={() => showToast('Email feature coming soon')}>
                            ✉ Email
                          </button>
                          <button className={styles.cardQbBtn}
                            onClick={() => showToast('QB sync coming soon')}>
                            QB
                          </button>
                          {unpaid > 0 && (
                            <button className={styles.cardMarkPaidBtn}
                              onClick={() => markCustomerPaid(customer)}>
                              Mark Paid ({unpaid})
                            </button>
                          )}
                          {unpaid === 0 && (
                            <span className={styles.allPaidBadge}>✓ All Paid</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Records Table */}
                    <div className={styles.customerGroupRows}>
                      <table className={styles.cgTable}>
                        <thead>
                          <tr>
                            <th>Tracking No</th>
                            <th>Statement</th>
                            <th>Pickup</th>
                            <th className={styles.thRight}>COD Amt</th>
                            <th className={styles.thRight}>Check Amt</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customer.records.map(r => (
                            <tr key={r.id} className={
                              r.cod_status === 'paid'     ? styles.rowPaid :
                              r.cod_status === 'returned' ? styles.rowReturned : undefined
                            }>
                              <td className={styles.tracking}>{r.tracking_no}</td>
                              <td className={styles.mono}>{r.statement_no}</td>
                              <td className={styles.muted}>{fmtDate(r.pickup_date)}</td>
                              <td className={`${styles.bold} ${styles.thRight}`}>{fmt(r.cod_amount)}</td>
                              <td className={`${styles.bold} ${styles.thRight}`}>{fmt(r.check_amount)}</td>
                              <td>
                                {r.cod_status === 'collected' ? (
                                  <button
                                    className={styles.recMarkPaidBtn}
                                    disabled={weekProcIds.has(r.id)}
                                    onClick={() => markWeekRecordPaid(r)}
                                  >
                                    {weekProcIds.has(r.id) ? '…' : 'Mark Paid'}
                                  </button>
                                ) : r.cod_status === 'paid' ? (
                                  <span className={styles.recordStatusPaid}>✓ Paid</span>
                                ) : (
                                  <span className={styles.recordStatusReturned}>↩ Returned</span>
                                )}
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 3: PAID HISTORY
      ════════════════════════════════════════════════════════════ */}
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
    </div>
  )
}
