'use client'
import { useEffect, useState } from 'react'
import styles from './customers.module.css'
import EditModal from './EditModal'
import type { Customer, SalesPerson } from './types'

// DB row → frontend Customer
function fromRow(r: Record<string, unknown>): Customer {
  const raw = r.assignments
  const assignments = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>).map(a => ({
        id:    String(a.id    ?? ''),
        name:  String(a.name  ?? ''),
        ratio: Number(a.ratio ?? 0),
      }))
    : []

  return {
    id:          String(r.id          ?? ''),
    name:        String(r.name        ?? ''),
    email:       String(r.email       ?? ''),
    phone:       String(r.phone       ?? ''),
    marginRate:  r.margin_rate != null ? `${parseFloat(String(r.margin_rate)).toFixed(0)}%` : '—',
    paymentType: (r.payment_type === 'Monthly' ? 'Monthly' : 'Prepay') as 'Prepay' | 'Monthly',
    createdDate: r.created_date ? String(r.created_date).slice(0, 10) : '—',
    status:      (r.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
    salesPerson: String(r.sales_person ?? ''),
    assignments,
    memo:        String(r.memo        ?? ''),
    lastSynced:  r.last_synced_at ? String(r.last_synced_at).slice(0, 10) : '—',
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// ── Filter type ──────────────────────────────────────────────
// 'all' | 'active' | 'unassigned' | '<sales person name>'
type Filter = string

// ── Sorting ──────────────────────────────────────────────────
type SortKey = 'name' | 'email' | 'marginRate' | 'paymentType' | 'createdDate' | 'status'
type SortDir = 'asc' | 'desc' | 'none'

function nextDir(cur: SortDir): SortDir {
  if (cur === 'none') return 'asc'
  if (cur === 'asc')  return 'desc'
  return 'none'
}

function sortIndicator(dir: SortDir) {
  if (dir === 'asc')  return ' ↑'
  if (dir === 'desc') return ' ↓'
  return ''
}

function compareCustomers(a: Customer, b: Customer, key: SortKey, dir: SortDir): number {
  if (dir === 'none') return 0
  let va: string | number = ''
  let vb: string | number = ''

  switch (key) {
    case 'name':        va = a.name;        vb = b.name;        break
    case 'email':       va = a.email;       vb = b.email;       break
    case 'paymentType': va = a.paymentType; vb = b.paymentType; break
    case 'status':      va = a.status;      vb = b.status;      break
    case 'createdDate': va = a.createdDate; vb = b.createdDate; break
    case 'marginRate':
      va = parseFloat(a.marginRate) || 0
      vb = parseFloat(b.marginRate) || 0
      return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
  }

  const cmp = String(va).localeCompare(String(vb))
  return dir === 'asc' ? cmp : -cmp
}

export default function CustomersPage() {
  const [customers,    setCustomers]    = useState<Customer[]>([])
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [filter,       setFilter]       = useState<Filter>('all')
  const [search,       setSearch]       = useState('')
  const [editing,      setEditing]      = useState<Customer | null>(null)
  const [sortKey,      setSortKey]      = useState<SortKey>('name')
  const [sortDir,      setSortDir]      = useState<SortDir>('none')

  // ── Fetch ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`${API}/api/customers`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Record<string, unknown>[]>
      }),
      fetch(`${API}/api/settings/sales-persons`).then(r => r.json()) as Promise<SalesPerson[]>,
    ])
      .then(([rows, sps]) => {
        setCustomers(rows.map(fromRow))
        setSalesPersons(sps.filter((s: SalesPerson) => s.is_active))
        setLoading(false)
      })
      .catch(err => {
        setError((err as Error).message)
        setLoading(false)
      })
  }, [])

  // ── Save assignments (PUT) + memo (PATCH) ────────────────────
  const handleSaveAssignments = async (
    id: string,
    assignments: Array<{ sales_person_id: string; ratio: number }>,
    memo: string
  ) => {
    try {
      await fetch(`${API}/api/customers/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memo }),
      })

      const res = await fetch(`${API}/api/customers/${id}/sales-persons`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(assignments),
      })
      const updated = await res.json() as Array<{ id: string; name: string; ratio: number }>

      const newAssignments = updated.map(a => ({
        id:    a.id,
        name:  a.name,
        ratio: a.ratio,
      }))
      const salesPersonDisplay = newAssignments.map(a => a.name).join(', ')

      setCustomers(prev => prev.map(c =>
        c.id === id
          ? { ...c, memo, salesPerson: salesPersonDisplay, assignments: newAssignments }
          : c
      ))
    } catch (err) {
      console.error('Failed to update assignments:', err)
    }
    setEditing(null)
  }

  // ── Column sort toggle ───────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(nextDir(sortDir))
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Derived counts for stat cards ───────────────────────────
  const activeCount      = customers.filter(c => c.status === 'Active').length
  const unassignedCount  = customers.filter(c => c.assignments.length === 0).length

  // Per sales-person count from actual assignments in loaded customer data
  const spCounts: Array<{ name: string; count: number }> = salesPersons
    .map(sp => ({
      name:  sp.name,
      count: customers.filter(c => c.assignments.some(a => a.name === sp.name)).length,
    }))
    .filter(s => s.count > 0)

  // ── Filter + search ──────────────────────────────────────────
  const filtered = customers
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch =
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      const matchFilter =
        filter === 'all'        ? true :
        filter === 'active'     ? c.status === 'Active' :
        filter === 'unassigned' ? c.assignments.length === 0 :
                                  c.assignments.some(a => a.name === filter)
      return matchSearch && matchFilter
    })
    .sort((a, b) => compareCustomers(a, b, sortKey, sortDir))

  // ── Stat card helper ─────────────────────────────────────────
  const StatCard = ({
    filterKey, val, label, warn = false,
  }: {
    filterKey: Filter
    val: React.ReactNode
    label: string
    warn?: boolean
  }) => {
    const active = filter === filterKey
    return (
      <div
        className={[
          styles.stat,
          styles.statClickable,
          warn  ? styles.statWarn   : '',
          active ? styles.statActive : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setFilter(active ? 'all' : filterKey)}
      >
        <span className={styles.statVal}>{val}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    )
  }

  const th = (key: SortKey, label: string) => (
    <th className={styles.sortable} onClick={() => handleSort(key)}>
      {label}{sortKey === key ? sortIndicator(sortDir) : ''}
    </th>
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* Stats */}
      <div className={styles.stats}>
        <StatCard filterKey="all"    val={loading ? '…' : customers.length} label="Total Customers" />
        <StatCard filterKey="active" val={loading ? '…' : activeCount}      label="Active" />

        {/* Per sales-person cards */}
        {!loading && spCounts.map(sp => (
          <StatCard
            key={sp.name}
            filterKey={sp.name}
            val={sp.count}
            label={sp.name}
          />
        ))}

        <StatCard
          filterKey="unassigned"
          val={loading ? '…' : unassignedCount}
          label="No Sales Person"
          warn={unassignedCount > 0}
        />

        {/* Last Sync — not clickable, just display */}
        <div className={styles.stat}>
          <span className={styles.statVal}>{new Date().toLocaleDateString('en-CA')}</span>
          <span className={styles.statLabel}>Last Sync</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className={styles.syncBtn}>↻ Sync from SHIPHEYO</button>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBox}>
          ⚠ Failed to load customers: {error}
        </div>
      )}

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingRow}>Loading customers…</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {th('name',        'Name')}
                {th('email',       'Email')}
                <th>Phone</th>
                {th('marginRate',  'Margin')}
                {th('paymentType', 'Payment')}
                {th('createdDate', 'Created')}
                {th('status',      'Status')}
                <th>Sales Person</th>
                <th>Memo</th>
                <th>Last Synced</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} className={styles.empty}>No customers found.</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td className={styles.muted}>{c.email}</td>
                  <td className={styles.muted}>{c.phone || '—'}</td>
                  <td className={styles.center}>{c.marginRate}</td>
                  <td>
                    <span className={`${styles.pill} ${c.paymentType === 'Monthly' ? styles.monthly : styles.prepay}`}>
                      {c.paymentType}
                    </span>
                  </td>
                  <td className={styles.muted}>{c.createdDate}</td>
                  <td>
                    <span className={`${styles.pill} ${c.status === 'Active' ? styles.active : styles.inactive}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.assignments.length > 0
                      ? c.assignments.map(a => (
                          <span key={a.id} className={styles.spName}>
                            {a.name}{c.assignments.length > 1 ? ` (${a.ratio}%)` : ''}
                          </span>
                        ))
                      : <span className={styles.unassigned}>Unassigned</span>}
                  </td>
                  <td className={styles.memoCell}>
                    {c.memo
                      ? <span className={styles.memoText} title={c.memo}>{c.memo}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.muted}>{c.lastSynced}</td>
                  <td>
                    <button className={styles.editBtn} onClick={() => setEditing(c)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditModal
          customer={editing}
          salesPersons={salesPersons}
          onSave={handleSaveAssignments}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
