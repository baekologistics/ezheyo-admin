'use client'
import React, { useState, useEffect, useCallback } from 'react'
import styles from './logs.module.css'
import { authFetch } from '@/lib/auth'

// ── Types ─────────────────────────────────────────────────────────
type LogRow = {
  id:         string
  user_id:    string | null
  username:   string | null
  action:     string
  page:       string | null
  detail:     string | null
  ip_address: string | null
  created_at: string
}

type LogsResponse = {
  logs:  LogRow[]
  total: number
  page:  number
  limit: number
}

// ── Helpers ────────────────────────────────────────────────────────
function etDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  login:           { label: 'Login',        cls: 'actLogin' },
  logout:          { label: 'Logout',       cls: 'actLogout' },
  page_view:       { label: 'Page View',    cls: 'actPageView' },
  data_export:     { label: 'Export',       cls: 'actExport' },
  change_password: { label: 'Pwd Change',   cls: 'actPwdChange' },
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

const USERS    = ['paik', 'kong', 'kang']
const ACTIONS  = Object.keys(ACTION_LABELS)
const PER_PAGE = 50

// ── Page ──────────────────────────────────────────────────────────
export default function LogsPage() {
  const [logs,    setLogs]    = useState<LogRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)

  // filters
  const [filterUser,   setFilterUser]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom,     setDateFrom]     = useState(etDaysAgo(7))
  const [dateTo,       setDateTo]       = useState(etDaysAgo(0))

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(PER_PAGE) })
      if (filterUser)   qs.set('username',  filterUser)
      if (filterAction) qs.set('action',    filterAction)
      if (dateFrom)     qs.set('date_from', dateFrom)
      if (dateTo)       qs.set('date_to',   dateTo)

      const res  = await authFetch(`/api/logs?${qs}`)
      const data = await res.json() as LogsResponse
      setLogs(data.logs  ?? [])
      setTotal(data.total ?? 0)
      setPage(p)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [filterUser, filterAction, dateFrom, dateTo])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className={styles.page}>

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>User</label>
          <select className={styles.select} value={filterUser}
            onChange={e => setFilterUser(e.target.value)}>
            <option value="">All</option>
            {USERS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Action</label>
          <select className={styles.select} value={filterAction}
            onChange={e => setFilterAction(e.target.value)}>
            <option value="">All</option>
            {ACTIONS.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input type="date" className={styles.input} value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input type="date" className={styles.input} value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
        </div>

        <button className={styles.queryBtn} onClick={() => fetchLogs(1)} disabled={loading}>
          {loading ? '…' : '조회'}
        </button>

        <div className={styles.totalCount}>
          {total.toLocaleString()} records
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date / Time (ET)</th>
                <th>User</th>
                <th>Action</th>
                <th>Page</th>
                <th>Detail</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className={styles.empty}>Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>No activity logs found.</td></tr>
              ) : logs.map(row => {
                const act = ACTION_LABELS[row.action] ?? { label: row.action, cls: 'actDefault' }
                return (
                  <tr key={row.id}>
                    <td className={styles.dateCell}>{fmtDate(row.created_at)}</td>
                    <td>
                      {row.username
                        ? <span className={styles.userBadge}>{row.username}</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td>
                      <span className={`${styles.actionBadge} ${styles[act.cls]}`}>
                        {act.label}
                      </span>
                    </td>
                    <td className={styles.pageCell}>{row.page ?? '—'}</td>
                    <td className={styles.detailCell}>{row.detail ?? '—'}</td>
                    <td className={styles.ipCell}>{row.ip_address ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={page <= 1 || loading}
              onClick={() => fetchLogs(page - 1)}
            >
              ← Prev
            </button>
            <span className={styles.pageInfo}>
              {page} / {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              disabled={page >= totalPages || loading}
              onClick={() => fetchLogs(page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
