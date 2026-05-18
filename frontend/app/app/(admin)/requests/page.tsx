'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import styles from './requests.module.css'
import RequestDetailModal, { RequestItem } from './RequestDetailModal'
import { authFetch } from '@/lib/auth'
const PAGE_LIMIT = 50

// ── Types ─────────────────────────────────────────────────────
type RequestType = {
  id:          string
  code:        string
  label:       string
  icon:        string
  description: string
  sort_order:  number
}

type Stats = {
  total:     number
  pending:   number
  approved:  number
  rejected:  number
  completed: number
}

type ApiResponse = {
  requests:   RequestItem[]
  total:      number
  page:       number
  totalPages: number
}

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number | string | null | undefined) =>
  n != null && n !== '' && Number(n) !== 0 ? `$${Number(n).toFixed(2)}` : null

function statusBadgeClass(s: string) {
  switch (s) {
    case 'pending':   return styles.badgePending
    case 'approved':  return styles.badgeApproved
    case 'rejected':  return styles.badgeRejected
    case 'completed': return styles.badgeCompleted
    default:          return styles.badgePending
  }
}

function summarize(r: RequestItem): string {
  if (r.type_code === 'payment') {
    const t = r.payment_type ? r.payment_type.charAt(0).toUpperCase() + r.payment_type.slice(1) : ''
    const a = fmt(r.amount)
    return [t, a].filter(Boolean).join(' · ')
  }
  if (r.type_code === 'void') {
    return r.tracking_no ?? 'No tracking'
  }
  if (r.type_code === 'supply_order' && r.extra_data) {
    const d = r.extra_data as Record<string, unknown>
    if (d.item && d.quantity) return `${d.item} × ${d.quantity}`
  }
  return r.title ?? r.description ?? '—'
}

// ── Main page ─────────────────────────────────────────────────
export default function RequestsPage() {
  const [requests,    setRequests]    = useState<RequestItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  const [types,       setTypes]       = useState<RequestType[]>([])
  const [stats,       setStats]       = useState<Stats | null>(null)

  const [activeType,  setActiveType]  = useState('all')   // 'all' | type code
  const [status,      setStatus]      = useState('all')
  const [customer,    setCustomer]    = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')

  const [selected,    setSelected]    = useState<RequestItem | null>(null)

  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [customerInput, setCustomerInput] = useState('')

  // ── Load types on mount ──────────────────────────────────
  useEffect(() => {
    authFetch('/api/requests/types')
      .then(r => r.json())
      .then((data: RequestType[]) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // ── Load stats ───────────────────────────────────────────
  const loadStats = useCallback(() => {
    authFetch('/api/requests/stats')
      .then(r => r.json())
      .then((data: Stats) => setStats(data))
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  // ── Build query params ───────────────────────────────────
  const buildParams = useCallback((pg: number) => {
    const p = new URLSearchParams()
    if (activeType !== 'all') p.set('type_code', activeType)
    if (status     !== 'all') p.set('status',    status)
    if (customer)              p.set('customer_name', customer)
    if (dateFrom)              p.set('date_from', dateFrom)
    if (dateTo)                p.set('date_to',   dateTo)
    p.set('page',  String(pg))
    p.set('limit', String(PAGE_LIMIT))
    return p
  }, [activeType, status, customer, dateFrom, dateTo])

  // ── Load requests ────────────────────────────────────────
  const loadRequests = useCallback(async (pg: number) => {
    setLoading(true)
    setError('')
    try {
      const res  = await authFetch(`/api/requests?${buildParams(pg)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      setRequests(Array.isArray(data.requests) ? data.requests : [])
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setPage(pg)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // Reload on filter change
  useEffect(() => {
    loadRequests(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, status, customer, dateFrom, dateTo])

  // Debounce customer input
  const handleCustomerInput = (v: string) => {
    setCustomerInput(v)
    if (customerTimer.current) clearTimeout(customerTimer.current)
    customerTimer.current = setTimeout(() => setCustomer(v), 400)
  }

  const reset = () => {
    setActiveType('all'); setStatus('all')
    setCustomer(''); setCustomerInput('')
    setDateFrom(''); setDateTo('')
  }

  const handleUpdate = (updated: RequestItem) => {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    loadStats()
  }

  // ── Type tab counts ──────────────────────────────────────
  // (optional: pre-compute from local data; real counts from API)

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Requests</span>
          <span className={styles.statVal}>{stats?.total ?? '…'}</span>
        </div>
        <div className={`${styles.stat} ${styles.statPending}`}>
          <span className={styles.statLabel}>Pending</span>
          <span className={styles.statVal}>{stats?.pending ?? '…'}</span>
        </div>
        <div className={`${styles.stat} ${styles.statApproved}`}>
          <span className={styles.statLabel}>Approved</span>
          <span className={styles.statVal}>{stats?.approved ?? '…'}</span>
        </div>
        <div className={`${styles.stat} ${styles.statCompleted}`}>
          <span className={styles.statLabel}>Completed</span>
          <span className={styles.statVal}>{stats?.completed ?? '…'}</span>
        </div>
      </div>

      {/* ── Type tabs ──────────────────────────────────────── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeType === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveType('all')}
        >
          All
          <span className={styles.tabCount}>{stats?.total ?? 0}</span>
        </button>
        {types.map(t => (
          <button
            key={t.code}
            className={`${styles.tab} ${activeType === t.code ? styles.tabActive : ''}`}
            onClick={() => setActiveType(t.code)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className={styles.filters}>
        <select
          className={styles.select}
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="all">Status: All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
        </select>
        <input
          className={styles.input}
          placeholder="Customer name…"
          value={customerInput}
          onChange={e => handleCustomerInput(e.target.value)}
        />
        <label className={styles.dateLabel}>From</label>
        <input
          className={styles.input}
          style={{ maxWidth: 150 }}
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <label className={styles.dateLabel}>To</label>
        <input
          className={styles.input}
          style={{ maxWidth: 150 }}
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
        <button className={styles.resetBtn} onClick={reset}>Reset</button>
      </div>

      {/* ── Error ──────────────────────────────────────────── */}
      {error && (
        <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>
          Failed to load: {error} &nbsp;
          <button onClick={() => loadRequests(page)} style={{ color: 'inherit', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Retry</button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Req #</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Summary</th>
              <th className={styles.thRight}>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.empty}>Loading requests…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>No requests found.</td></tr>
            ) : (
              requests.map(r => (
                <tr key={r.id}>
                  <td className={styles.reqNo}>
                    #{String(r.request_no).padStart(4, '0')}
                  </td>
                  <td>
                    <div className={styles.typeCell}>
                      <span className={styles.typeIcon}>{r.type_icon}</span>
                      <span className={styles.typeLabel}>{r.type_label}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.customerCell}>
                      <span className={styles.customerName}>{r.customer_name ?? '—'}</span>
                      {r.customer_email && r.customer_email !== r.customer_name && (
                        <span className={styles.customerEmail}>{r.customer_email}</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.summaryCell}>
                    <div className={styles.summaryTitle}>{r.title ?? summarize(r)}</div>
                    {r.title && (
                      <div className={styles.summaryMemo}>{summarize(r)}</div>
                    )}
                  </td>
                  <td className={styles.thRight}>
                    <span className={r.amount != null ? styles.amount : styles.muted}>
                      {fmt(r.amount) ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusBadgeClass(r.status)}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>
                  <td className={styles.dateCell}>
                    {new Date(r.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </td>
                  <td>
                    <button
                      className={styles.btnView}
                      onClick={() => setSelected(r)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1}
            onClick={() => loadRequests(1)}>«</button>
          <button className={styles.pageBtn} disabled={page <= 1}
            onClick={() => loadRequests(page - 1)}>‹</button>
          <div className={styles.pageNumbers}>
            {(() => {
              const WING  = 4
              const start = Math.max(1, Math.min(page - WING, totalPages - WING * 2))
              const end   = Math.min(totalPages, start + WING * 2)
              return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                <button
                  key={p}
                  className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ''}`}
                  onClick={() => loadRequests(p)}
                >{p}</button>
              ))
            })()}
          </div>
          <button className={styles.pageBtn} disabled={page >= totalPages}
            onClick={() => loadRequests(page + 1)}>›</button>
          <button className={styles.pageBtn} disabled={page >= totalPages}
            onClick={() => loadRequests(totalPages)}>»</button>
          <span className={styles.pageInfo}>
            총 {total.toLocaleString()}건 &nbsp;|&nbsp; {page} / {totalPages} 페이지
          </span>
        </div>
      )}

      {/* ── Detail Modal ────────────────────────────────────── */}
      {selected && (
        <RequestDetailModal
          request={selected}
          onClose={() => setSelected(null)}
          onUpdate={updated => {
            handleUpdate(updated)
            setSelected(updated)
          }}
        />
      )}
    </div>
  )
}
