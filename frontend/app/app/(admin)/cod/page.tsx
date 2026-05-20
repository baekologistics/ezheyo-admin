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
  returned_reason: string | null; returned_date: string | null
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
type StmtRecord = {
  id: string; tracking_no: string
  cod_amount: string | number; check_amount: string | number
  cod_status: string
  check_no: string | null; pickup_date: string | null; delivery_date: string | null
  premium_fee: string | number | null; service_fee: string | number | null
  statement_no: string | null; statement_date: string | null
  returned_reason: string | null; returned_date: string | null
  customer_id: string | null; customer_name: string | null
  customer_email: string | null; cod_payment_method: string | null
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

  // ═══ Summary Cards ═══════════════════════════════════════════════
  type CodSummary = {
    pending_count: number; pending_amount: number
    latest_statement_no: string | null; latest_statement_date: string | null
  }
  const [summary, setSummary] = useState<CodSummary | null>(null)

  const loadSummary = useCallback(async () => {
    try {
      const res = await authFetch('/api/cod/summary')
      if (!res.ok) return
      setSummary(await res.json() as CodSummary)
    } catch { /* non-critical */ }
  }, [])

  // ═══ TAB 1: Statements ═══════════════════════════════════════════
  const [statements,    setStatements]  = useState<CodStatement[]>([])
  const [loadingStmts,  setLoadingStmts] = useState(true)
  const [uploading,     setUploading]   = useState(false)
  const [showAllStmts,  setShowAllStmts] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting,      setDeleting]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadStatements = useCallback(async () => {
    setLoadingStmts(true)
    try {
      const res = await authFetch('/api/cod/statements')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as ApiStatement[]
      const mapped = data.map(mapStatement)
      setStatements(mapped)
      // Auto-select all statements on load
      setSelectedStmtIds(new Set(mapped.map(s => s.id)))
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

  const handleDeleteStatements = async () => {
    if (selectedStmtIds.size === 0) return
    setDeleting(true)
    let totalDeleted = 0, totalRestored = 0, failed = 0
    try {
      for (const id of Array.from(selectedStmtIds)) {
        const res = await authFetch(`/api/cod/statements/${id}`, { method: 'DELETE' })
        if (res.ok) {
          const data = await res.json() as { deletedRecords: number; restoredToPending: number }
          totalDeleted  += data.deletedRecords
          totalRestored += data.restoredToPending
        } else {
          failed++
        }
      }
      const msg = failed > 0
        ? `일부 삭제 실패 (${failed}건). ${totalDeleted} records 삭제 완료.`
        : `✓ ${selectedStmtIds.size}개 Statement 삭제 · ${totalDeleted} records · ${totalRestored}건 Pending 복원`
      showToast(msg)
      setSelectedStmtIds(new Set())
      setStmtRecords([])
      setDeleteConfirm(false)
      await loadStatements()
    } catch {
      showToast('삭제 중 오류가 발생했습니다')
    } finally {
      setDeleting(false)
    }
  }

  const displayedStmts = showAllStmts
    ? statements
    : statements.filter(s => s.parsedStatus !== 'Parsed' || s.recordCount > 0)

  // ── Statement checkbox selection + record preview ──────────────
  const [selectedStmtIds, setSelectedStmtIds]     = useState<Set<string>>(new Set())
  const [stmtRecords,     setStmtRecords]          = useState<StmtRecord[]>([])
  const [loadingStmtRecs, setLoadingStmtRecs]      = useState(false)

  const toggleStmtSelect = useCallback((id: string) => {
    setSelectedStmtIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedStmtIds(prev =>
      prev.size === displayedStmts.length && displayedStmts.length > 0
        ? new Set()
        : new Set(displayedStmts.map(s => s.id))
    )
  }, [displayedStmts])

  // Fetch records whenever selection changes
  useEffect(() => {
    if (selectedStmtIds.size === 0) { setStmtRecords([]); return }
    let cancelled = false
    const fetchAll = async () => {
      setLoadingStmtRecs(true)
      try {
        const results = await Promise.all(
          Array.from(selectedStmtIds).map(id =>
            authFetch(`/api/cod/records?statement_id=${id}`).then(r => r.json() as Promise<StmtRecord[]>)
          )
        )
        if (!cancelled) setStmtRecords(results.flat())
      } catch {
        if (!cancelled) showToast('Failed to load records')
      } finally {
        if (!cancelled) setLoadingStmtRecs(false)
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [selectedStmtIds, showToast])

  // Search within COD Records section
  const [recSearch, setRecSearch] = useState('')

  // Group matched records by customer (unmatched customer_id IS NULL are excluded)
  const recordsByCustomer = useMemo(() => {
    type Group = {
      customer_id: string; customer_name: string; customer_email: string
      cod_payment_method: string; records: StmtRecord[]
    }
    const map = new Map<string, Group>()
    for (const r of stmtRecords) {
      if (!r.customer_id) continue  // hide unmatched
      if (!map.has(r.customer_id)) {
        map.set(r.customer_id, {
          customer_id:        r.customer_id,
          customer_name:      r.customer_name     ?? '(unknown)',
          customer_email:     r.customer_email    ?? '',
          cod_payment_method: r.cod_payment_method ?? 'qb_bill',
          records: [],
        })
      }
      map.get(r.customer_id)!.records.push(r)
    }
    return Array.from(map.values())
  }, [stmtRecords])

  // Stats over matched records only
  const recStats = useMemo(() => {
    const matched = stmtRecords.filter(r => r.customer_id)
    return {
      customers:   recordsByCustomer.length,
      totalAmount: matched.reduce((a, r) => a + Number(r.check_amount), 0),
      collected:   matched.filter(r => r.cod_status === 'collected').length,
      returned:    matched.filter(r => r.cod_status === 'returned').length,
    }
  }, [stmtRecords, recordsByCustomer])

  // Apply search filter: tracking_no, statement_no, check_amount (partial match)
  const filteredRecordsByCustomer = useMemo(() => {
    const q = recSearch.trim().toLowerCase()
    if (!q) return recordsByCustomer
    return recordsByCustomer
      .map(g => ({
        ...g,
        records: g.records.filter(r =>
          r.tracking_no?.toLowerCase().includes(q) ||
          r.statement_no?.toLowerCase().includes(q) ||
          String(Number(r.check_amount).toFixed(2)).includes(q)
        ),
      }))
      .filter(g => g.records.length > 0)
  }, [recordsByCustomer, recSearch])

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
  useEffect(() => { loadSummary() }, [loadSummary])
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

      {/* ── Summary Cards ────────────────────────────────────────── */}
      {summary && (
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryCardLabel}>COD Pending</span>
            <span className={styles.summaryCardVal}>{summary.pending_count.toLocaleString()}</span>
            <span className={styles.summaryCardSub}>shipments awaiting collection</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryCardLabel}>Pending Amount</span>
            <span className={styles.summaryCardVal}>{fmt(summary.pending_amount)}</span>
            <span className={styles.summaryCardSub}>total COD not yet collected</span>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardAccent}`}>
            <span className={styles.summaryCardLabel}>Latest Statement</span>
            <span className={styles.summaryCardVal}>
              {summary.latest_statement_date ? fmtDate(summary.latest_statement_date) : '—'}
            </span>
            <span className={styles.summaryCardSub}>
              {summary.latest_statement_no ?? '—'}
            </span>
          </div>
        </div>
      )}

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
              {selectedStmtIds.size > 0 && (
                <button className={styles.stmtDeleteBtn} onClick={() => setDeleteConfirm(true)}>
                  🗑 Delete ({selectedStmtIds.size})
                </button>
              )}
              <button className={styles.btnUpload} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Uploading…' : '+ Upload PDF'}
              </button>
            </div>
          </div>

          <div className={styles.stmtTableWrap}>
            <table className={styles.stmtTable}>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedStmtIds.size > 0 && selectedStmtIds.size === displayedStmts.length}
                      ref={el => { if (el) el.indeterminate = selectedStmtIds.size > 0 && selectedStmtIds.size < displayedStmts.length }}
                      onChange={toggleSelectAll}
                      disabled={loadingStmts}
                    />
                  </th>
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
                  <tr><td colSpan={7} className={styles.empty}>Loading…</td></tr>
                ) : displayedStmts.length === 0 ? (
                  <tr><td colSpan={7} className={styles.empty}>No statements found.</td></tr>
                ) : displayedStmts.map(s => (
                  <tr
                    key={s.id}
                    className={selectedStmtIds.has(s.id) ? styles.stmtRowSelected : undefined}
                    onClick={() => toggleStmtSelect(s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedStmtIds.has(s.id)}
                        onChange={() => toggleStmtSelect(s.id)}
                      />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── COD Records preview for selected statements ───────── */}
          {selectedStmtIds.size > 0 && (
            <div className={styles.stmtRecordsSection}>
              <div className={styles.stmtRecordsSectionHeader}>
                <span className={styles.stmtRecordsSectionTitle}>COD Records</span>
                <span className={styles.recordsCount}>
                  {selectedStmtIds.size} statement{selectedStmtIds.size > 1 ? 's' : ''} · {stmtRecords.filter(r => r.customer_id).length} records
                </span>
              </div>

              {/* Stats cards */}
              {!loadingStmtRecs && stmtRecords.length > 0 && (
                <div className={styles.recStatsRow}>
                  <div className={styles.recStatCard}>
                    <span className={styles.recStatLabel}>CUSTOMERS</span>
                    <span className={styles.recStatVal}>{recStats.customers}</span>
                  </div>
                  <div className={styles.recStatCard}>
                    <span className={styles.recStatLabel}>TOTAL AMOUNT</span>
                    <span className={styles.recStatVal}>{fmt(recStats.totalAmount)}</span>
                  </div>
                  <div className={`${styles.recStatCard} ${recStats.collected > 0 ? styles.recStatCollected : ''}`}>
                    <span className={styles.recStatLabel}>COLLECTED</span>
                    <span className={styles.recStatVal}>{recStats.collected}</span>
                  </div>
                  <div className={`${styles.recStatCard} ${recStats.returned > 0 ? styles.recStatReturned : ''}`}>
                    <span className={styles.recStatLabel}>RETURNED</span>
                    <span className={styles.recStatVal}>{recStats.returned}</span>
                  </div>
                </div>
              )}

              {/* Search bar */}
              {!loadingStmtRecs && stmtRecords.length > 0 && (
                <div className={styles.recSearchBar}>
                  <input
                    className={styles.recSearchInput}
                    placeholder="Search tracking no, statement no, amount…"
                    value={recSearch}
                    onChange={e => setRecSearch(e.target.value)}
                  />
                  {recSearch && (
                    <button className={styles.recSearchClear} onClick={() => setRecSearch('')}>✕</button>
                  )}
                </div>
              )}

              {loadingStmtRecs ? (
                <div className={styles.empty}>Loading records…</div>
              ) : filteredRecordsByCustomer.length === 0 ? (
                <div className={styles.empty}>{recSearch ? 'No records match your search.' : 'No records found.'}</div>
              ) : filteredRecordsByCustomer.map(group => {
                const groupTotal = group.records.reduce((a, r) => a + Number(r.check_amount), 0)
                return (
                  <div key={group.customer_id} className={styles.customerGroup}>
                    <div className={styles.customerGroupHeader}>
                      <div className={styles.customerGroupInfo}>
                        <span className={styles.cgName}>{group.customer_name}</span>
                        {group.customer_email && (
                          <span className={styles.cgEmail}>{group.customer_email}</span>
                        )}
                        <span className={`${styles.payMethodBadge} ${group.cod_payment_method === 'zelle' ? styles.payMethodZelle : styles.payMethodQb}`}>
                          {group.cod_payment_method === 'zelle' ? 'Zelle' : 'QB Bill'}
                        </span>
                      </div>
                      <div className={styles.cgRight}>
                        <span className={styles.cgTotal}>{fmt(groupTotal)}</span>
                      </div>
                    </div>
                    <div className={styles.customerGroupRows}>
                      <table className={styles.cgTable}>
                        <thead>
                          <tr>
                            <th>Tracking No</th>
                            <th>Statement No</th>
                            <th>Check No</th>
                            <th>Pickup</th>
                            <th>Delivery</th>
                            <th className={styles.thRight}>COD Amt</th>
                            <th className={styles.thRight}>Premium</th>
                            <th className={styles.thRight}>Service</th>
                            <th className={styles.thRight}>Check Amt</th>
                            <th className={styles.thRight}>Diff</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map(r => {
                            const diff = Number(r.cod_amount) - Number(r.check_amount)
                            return (
                              <tr key={r.id} className={r.cod_status === 'returned' ? styles.rowReturned : undefined}>
                                <td className={styles.tracking}>{r.tracking_no}</td>
                                <td className={styles.mono}>{r.statement_no ?? '—'}</td>
                                <td className={styles.mono}>{r.check_no ?? '—'}</td>
                                <td className={styles.muted}>{fmtDate(r.pickup_date)}</td>
                                <td className={styles.muted}>{fmtDate(r.delivery_date)}</td>
                                <td className={styles.thRight}>{fmt(r.cod_amount)}</td>
                                <td className={styles.thRight}>{r.premium_fee != null && Number(r.premium_fee) !== 0 ? fmt(r.premium_fee) : '—'}</td>
                                <td className={styles.thRight}>{r.service_fee != null && Number(r.service_fee) !== 0 ? fmt(r.service_fee) : '—'}</td>
                                <td className={`${styles.thRight} ${styles.bold}`}>{fmt(r.check_amount)}</td>
                                <td className={`${styles.thRight} ${Math.abs(diff) > 0.005 ? styles.diffMismatch : styles.muted}`}>
                                  {Math.abs(diff) > 0.005 ? fmt(diff) : '—'}
                                </td>
                                <td>
                                  <span
                                    className={`${styles.recStatusBadge} ${
                                      r.cod_status === 'collected' ? styles.recStatusCollected :
                                      r.cod_status === 'paid'      ? styles.recStatusPaid      :
                                      r.cod_status === 'returned'  ? styles.recStatusReturned  :
                                                                     styles.recStatusPending
                                    }`}
                                    title={r.cod_status === 'returned' && r.returned_reason ? r.returned_reason : undefined}
                                  >
                                    {r.cod_status === 'collected' ? 'Collected' :
                                     r.cod_status === 'paid'      ? 'Paid'      :
                                     r.cod_status === 'returned'  ? (r.returned_reason ? `Returned (${r.returned_reason})` : 'Returned') :
                                                                    'Pending'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
                const unpaid    = customer.records.filter(r => r.cod_status === 'collected').length
                const returnedN = customer.records.filter(r => r.cod_status === 'returned').length
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
                        {returnedN > 0 && (
                          <span className={styles.returnedWarningBadge}>⚠ {returnedN} Returned</span>
                        )}
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
                          {unpaid === 0 && returnedN === 0 && (
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
                                  <span
                                    className={styles.recordStatusReturned}
                                    title={r.returned_reason ?? undefined}
                                  >
                                    ↩ Returned{r.returned_reason ? ` (${r.returned_reason})` : ''}
                                  </span>
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
      {/* ── Delete Statement Confirm Modal ───────────────────────── */}
      {deleteConfirm && (
        <div className={styles.overlay} onClick={() => !deleting && setDeleteConfirm(false)}>
          <div className={styles.modal} style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>
                  Statement {selectedStmtIds.size > 1 ? `${selectedStmtIds.size}개` : ''} 삭제
                </div>
                <div className={styles.modalSub}>이 작업은 되돌릴 수 없습니다</div>
              </div>
              <button className={styles.closeBtn} disabled={deleting} onClick={() => setDeleteConfirm(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.confirmBox}>
                <div className={styles.confirmName}>
                  {selectedStmtIds.size}개 Statement 삭제
                </div>
                <div className={styles.confirmDetail}>
                  {Array.from(selectedStmtIds)
                    .map(id => statements.find(s => s.id === id)?.statementNo)
                    .filter(Boolean)
                    .join(', ')}
                </div>
              </div>
              <ul className={styles.deleteWarningList}>
                <li>선택한 Statement와 파싱된 COD Records가 삭제됩니다.</li>
                <li>해당 Tracking의 COD Status는 Pending으로 복원됩니다.</li>
                <li>Shipment 기록(날짜, 금액, 고객 등)은 영향받지 않습니다.</li>
              </ul>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} disabled={deleting} onClick={() => setDeleteConfirm(false)}>
                취소
              </button>
              <button className={styles.dangerBtn} disabled={deleting} onClick={handleDeleteStatements}>
                {deleting ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
