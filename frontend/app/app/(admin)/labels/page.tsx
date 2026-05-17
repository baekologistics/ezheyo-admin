'use client'
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import styles from './labels.module.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const PAGE_LIMIT = 50

// ── Date helpers ──────────────────────────────────────────────
function toYMD(d: Date) {
  return d.toISOString().slice(0, 10)
}
function today()    { return toYMD(new Date()) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return toYMD(d)
}
function startOfWeek(d: Date) {           // Monday
  const c = new Date(d); const day = c.getDay()
  c.setDate(c.getDate() - ((day + 6) % 7)); return c
}
function monthsAgo(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n); return toYMD(d)
}

type DatePreset = 'Custom' | 'RecentWeek' | 'RecentMonth' | 'LastWeek' | 'LastMonth' | 'LastQuarter' | 'LastYear' | 'All'

function calcPreset(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case 'RecentWeek':   return { from: daysAgo(7),  to: today() }
    case 'RecentMonth':  return { from: daysAgo(30), to: today() }
    case 'LastWeek': {
      const mon = startOfWeek(now); mon.setDate(mon.getDate() - 7)
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
      return { from: toYMD(mon), to: toYMD(sun) }
    }
    case 'LastMonth': {
      const y = now.getFullYear(), m = now.getMonth()
      const from = toYMD(new Date(y, m - 1, 1))
      const to   = toYMD(new Date(y, m, 0))
      return { from, to }
    }
    case 'LastQuarter': {
      const q = Math.floor(now.getMonth() / 3)
      const y = now.getFullYear()
      const qStart = q === 0 ? new Date(y - 1, 9, 1) : new Date(y, (q - 1) * 3, 1)
      const qEnd   = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0)
      return { from: toYMD(qStart), to: toYMD(qEnd) }
    }
    case 'LastYear': {
      const y = now.getFullYear() - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
    case 'All':    return { from: '', to: '' }
    default:       return { from: monthsAgo(2), to: today() }  // Custom default
  }
}

// ── Types ─────────────────────────────────────────────────────
type CodStatus   = 'Pending' | 'Collected' | 'Returned'
type ClaimStatus = 'Claimed' | 'Approved' | 'Paid'

type Package = {
  tracking_no:   string
  weight:        number
  width:         number
  length:        number
  height:        number
  ref_no:        string
  cod_amount:    number
  shipper_name:  string
  shipper_addr:  string
  receiver_name: string
  receiver_addr: string
}

type Order = {
  id:              string
  orderId:         string
  trackingNo:      string
  refNo:           string
  date:            string
  customer:        string
  customerEmail:   string
  serviceType:     string
  upsCost:         number
  customerCharge:  number
  profit:          number
  salesPerson:     string
  codAmount:       number
  codStatus:       CodStatus | null
  claimStatus:     ClaimStatus | null
  totalPackages:   number
  packages:        Package[]
}

type GlobalStats = {
  total_orders:   number
  total_packages: number
  total_revenue:  number
  total_ups_cost: number
  total_profit:   number
  total_cod:      number
}

type SalesPerson = { id: string; name: string; is_active: boolean }

// ── API shapes ────────────────────────────────────────────────
type ApiOrder = {
  id: string; shipheyo_order_id: string | null; tracking_no: string; ref_no: string | null
  date: string; customer_name: string | null; customer_email: string | null
  service_type: string | null; ups_cost: string | number; customer_charge: string | number
  profit: string | number | null; sales_person: string | null
  cod_amount: string | number; cod_status: string | null; claim_status: string | null
  total_packages: number; packages: Package[] | null
}
type ApiResponse = { orders: ApiOrder[]; total: number; page: number; totalPages: number }

function mapCod(s: string | null): CodStatus | null {
  return ({ pending: 'Pending', collected: 'Collected', returned: 'Returned' } as Record<string, CodStatus>)[s?.toLowerCase() ?? ''] ?? null
}
function mapClaim(s: string | null): ClaimStatus | null {
  return ({ claimed: 'Claimed', approved: 'Approved', paid: 'Paid' } as Record<string, ClaimStatus>)[s?.toLowerCase() ?? ''] ?? null
}
function mapOrder(o: ApiOrder): Order {
  const ups  = Number(o.ups_cost)        || 0
  const chg  = Number(o.customer_charge) || 0
  return {
    id:             o.id,
    orderId:        o.shipheyo_order_id ?? '',
    trackingNo:     o.tracking_no,
    refNo:          o.ref_no ?? '',
    date:           o.date?.slice(0, 10) ?? '',
    customer:       o.customer_name  ?? o.customer_email ?? '',
    customerEmail:  o.customer_email ?? '',
    serviceType:    o.service_type   ?? '',
    upsCost:        ups,
    customerCharge: chg,
    profit:         o.profit != null ? Number(o.profit) : chg - ups,
    salesPerson:    o.sales_person   ?? '',
    codAmount:      Number(o.cod_amount) || 0,
    codStatus:      mapCod(o.cod_status),
    claimStatus:    mapClaim(o.claim_status),
    totalPackages:  o.total_packages  ?? 1,
    packages:       Array.isArray(o.packages) ? o.packages : [],
  }
}

const fmt = (n: number) => `$${n.toFixed(2)}`
const SERVICE_TYPES   = ['All', 'Ground', 'Next Day Air', '2nd Day Air']
const COD_STATUSES    = ['All', 'Pending', 'Collected', 'Returned']
const CLAIM_STATUSES  = ['All', 'Claimed', 'Approved', 'Paid']
const CANCEL_FILTERS  = ['All', 'Active', 'Cancelled'] as const
type CancelFilter = typeof CANCEL_FILTERS[number]
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'Custom',      label: 'Custom' },
  { value: 'RecentWeek',  label: 'Recent Week (7 days)' },
  { value: 'RecentMonth', label: 'Recent Month (30 days)' },
  { value: 'LastWeek',    label: 'Last Week (Mon–Sun)' },
  { value: 'LastMonth',   label: 'Last Month' },
  { value: 'LastQuarter', label: 'Last Quarter' },
  { value: 'LastYear',    label: 'Last Year' },
  { value: 'All',         label: 'All (no date filter)' },
]

// ── Customer autocomplete ─────────────────────────────────────
function CustomerSearch({ value, onChange, customers }: {
  value: string; onChange: (v: string) => void; customers: string[]
}) {
  const [input, setInput] = useState(value)
  const [open,  setOpen]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setInput(value) }, [value])

  const suggestions = useMemo(() =>
    input.trim() === '' ? customers
      : customers.filter(c => c.toLowerCase().includes(input.toLowerCase())),
    [input, customers])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (n: string) => { setInput(n); onChange(n); setOpen(false) }
  const clear  = ()           => { setInput(''); onChange(''); setOpen(false) }

  return (
    <div className={styles.acWrap} ref={wrapRef}>
      <div className={styles.acInputWrap}>
        <input className={styles.input} placeholder="Customer name…" value={input}
          onChange={e => { setInput(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} />
        {input && <button className={styles.acClear} onClick={clear} tabIndex={-1}>✕</button>}
      </div>
      {open && suggestions.length > 0 && (
        <ul className={styles.acList}>
          <li className={styles.acAll} onMouseDown={() => clear()}>All customers</li>
          {suggestions.map(c => (
            <li key={c} className={`${styles.acItem} ${input === c ? styles.acSelected : ''}`}
              onMouseDown={() => select(c)}>
              {hlite(c, input)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function hlite(text: string, q: string) {
  if (!q.trim()) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return <>{text}</>
  return <>{text.slice(0,i)}<strong>{text.slice(i, i+q.length)}</strong>{text.slice(i+q.length)}</>
}

// ── Package accordion row ─────────────────────────────────────
function PackageRows({ packages, orderId }: { packages: Package[]; orderId: string }) {
  return (
    <tr className={styles.accordionRow}>
      <td colSpan={12} className={styles.accordionCell}>
        {orderId && (
          <div className={styles.accordionOrderId}>Order ID: <span>{orderId}</span></div>
        )}
        <table className={styles.pkgTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Tracking No</th>
              <th>Ref#</th>
              <th>Weight</th>
              <th>Dimension (W×L×H)</th>
              <th>Shipper</th>
              <th>Receiver</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p, i) => (
              <tr key={p.tracking_no || i}>
                <td className={styles.pkgNo}>{i + 1}</td>
                <td className={styles.tracking}>{p.tracking_no || '—'}</td>
                <td className={styles.muted}>{p.ref_no || '—'}</td>
                <td className={styles.muted}>{p.weight > 0 ? `${p.weight} lbs` : '—'}</td>
                <td className={styles.muted}>
                  {p.width > 0 || p.length > 0 || p.height > 0
                    ? `${p.width}×${p.length}×${p.height}`
                    : '—'}
                </td>
                <td>
                  {p.shipper_name && <div className={styles.pkgName}>{p.shipper_name}</div>}
                  {p.shipper_addr && <div className={styles.pkgAddr}>{p.shipper_addr}</div>}
                  {!p.shipper_name && !p.shipper_addr && <span className={styles.muted}>—</span>}
                </td>
                <td>
                  {p.receiver_name && <div className={styles.pkgName}>{p.receiver_name}</div>}
                  {p.receiver_addr && <div className={styles.pkgAddr}>{p.receiver_addr}</div>}
                  {!p.receiver_name && !p.receiver_addr && <span className={styles.muted}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function LabelsPage() {
  const [orders,       setOrders]       = useState<Order[]>([])
  const [total,        setTotal]        = useState(0)
  const [totalPages,   setTotalPages]   = useState(1)
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [allCustomers, setAllCustomers] = useState<string[]>([])
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([])
  const [stats,        setStats]        = useState<GlobalStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [syncMsg,      setSyncMsg]      = useState('')

  // Filters — default: recent 30 days
  const defaultDates = calcPreset('RecentMonth')
  const [datePreset,   setDatePreset]   = useState<DatePreset>('RecentMonth')
  const [tracking,     setTracking]     = useState('')
  const [customer,     setCustomer]     = useState('')
  const [service,      setService]      = useState('All')
  const [dateFrom,     setDateFrom]     = useState(defaultDates.from)
  const [dateTo,       setDateTo]       = useState(defaultDates.to)
  const [codStatus,    setCodStatus]    = useState('All')
  const [claimStatus,  setClaimStatus]  = useState('All')
  const [salesPersonId, setSalesPersonId] = useState('')
  const [cancelFilter, setCancelFilter] = useState<CancelFilter>('All')

  // ── Date preset handler ───────────────────────────────────
  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    if (preset !== 'Custom') {
      const { from, to } = calcPreset(preset)
      setDateFrom(from)
      setDateTo(to)
    }
  }

  // ── Build filter params (shared by orders + stats) ───────
  const buildFilterParams = useCallback(() => {
    const p = new URLSearchParams()
    if (tracking)              p.set('search',          tracking)
    if (customer)              p.set('customer_name',   customer)
    if (service !== 'All')     p.set('service_type',    service)
    if (dateFrom)              p.set('date_from',       dateFrom)
    if (dateTo)                p.set('date_to',         dateTo)
    if (codStatus   !== 'All') p.set('cod_status',      codStatus.toLowerCase())
    if (claimStatus !== 'All') p.set('claim_status',    claimStatus.toLowerCase())
    if (salesPersonId)         p.set('sales_person_id', salesPersonId)
    if (cancelFilter === 'Cancelled') p.set('cancelled', 'true')
    if (cancelFilter === 'Active')    p.set('cancelled', 'false')
    return p
  }, [tracking, customer, service, dateFrom, dateTo, codStatus, claimStatus, salesPersonId, cancelFilter])

  // ── Fetch stats (filtered) ────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const p = buildFilterParams()
      const res = await fetch(`${API_URL}/api/orders/stats?${p}`)
      if (!res.ok) return
      setStats(await res.json())
    } catch { /* silently ignore */ }
    finally { setStatsLoading(false) }
  }, [buildFilterParams])

  // ── Fetch customer list ───────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/customers`)
      .then(r => r.json())
      .then((data: Array<{ name: string }>) => {
        setAllCustomers(Array.from(new Set(data.map(c => c.name).filter(Boolean))).sort())
      })
      .catch(() => {})
  }, [])

  // ── Fetch sales persons ───────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/settings/sales-persons`)
      .then(r => r.json())
      .then((data: SalesPerson[]) => setSalesPersons(Array.isArray(data) ? data.filter(s => s.is_active) : []))
      .catch(() => {})
  }, [])

  // ── Fetch orders ──────────────────────────────────────────
  const loadOrders = useCallback(async (pg: number) => {
    setLoading(true)
    setError('')
    try {
      const params = buildFilterParams()
      params.set('page',  String(pg))
      params.set('limit', String(PAGE_LIMIT))

      const res = await fetch(`${API_URL}/api/orders?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      if (!Array.isArray(data.orders)) {
        throw new Error(`Unexpected response: ${JSON.stringify(data).slice(0, 200)}`)
      }
      setOrders(data.orders.map(mapOrder))
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setPage(pg)
      setExpanded(new Set())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [buildFilterParams])

  // Initial load + filter-change reload (stats + orders in parallel)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false }
    loadStats()
    loadOrders(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, customer, service, dateFrom, dateTo, codStatus, claimStatus, salesPersonId, cancelFilter])

  // Page-level totals (footer row only)
  const pageTotals = useMemo(() => ({
    packages: orders.reduce((a, o) => a + o.totalPackages, 0),
    revenue:  orders.reduce((a, o) => a + o.customerCharge, 0),
    upsCost:  orders.reduce((a, o) => a + o.upsCost, 0),
    profit:   orders.reduce((a, o) => a + o.profit, 0),
    cod:      orders.reduce((a, o) => a + o.codAmount, 0),
  }), [orders])

  // ── Manual sync ──────────────────────────────────────────
  const syncToday = useCallback(async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const date = today()
      const res = await fetch(`${API_URL}/api/sync/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { inserted: number; updated: number; unmatched: number; void_updated: number; void_inserted: number }
      const parts: string[] = []
      if (data.inserted > 0 || data.void_inserted > 0)
        parts.push(`${data.inserted + (data.void_inserted ?? 0)} new orders`)
      if (data.void_updated > 0)
        parts.push(`${data.void_updated} void updates`)
      setSyncMsg(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Sync complete (no changes)')
      setTimeout(() => setSyncMsg(''), 5000)
      loadStats()
      loadOrders(1)
    } catch (err) {
      setSyncMsg(`Sync failed: ${(err as Error).message}`)
      setTimeout(() => setSyncMsg(''), 5000)
    } finally {
      setSyncing(false)
    }
  }, [loadStats, loadOrders])

  // ── Accordion toggle ──────────────────────────────────────
  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const reset = () => {
    setTracking(''); setCustomer(''); setService('All')
    const d = calcPreset('RecentMonth')
    setDateFrom(d.from); setDateTo(d.to); setDatePreset('RecentMonth')
    setCodStatus('All'); setClaimStatus('All'); setSalesPersonId(''); setCancelFilter('All')
  }

  // ── Render ────────────────────────────────────────────────
  if (error) return (
    <div className={styles.page}>
      <div className={styles.errorBanner}>
        Failed to load orders: {error}
        <button className={styles.retryBtn} onClick={() => loadOrders(page)}>Retry</button>
      </div>
    </div>
  )

  // Card values always come from /api/orders/stats (filtered or unfiltered)
  const statsSpinning = statsLoading

  return (
    <div className={styles.page}>

      {/* ── Top bar: Sync button ───────────────────────────── */}
      <div className={styles.topBar}>
        {syncMsg && <span className={`${styles.syncToast} ${syncMsg.startsWith('Sync failed') ? styles.syncToastErr : ''}`}>{syncMsg}</span>}
        <button className={styles.syncBtn} onClick={syncToday} disabled={syncing}>
          {syncing ? 'Syncing…' : '↻ Sync Today'}
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Orders</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : (stats?.total_orders ?? 0).toLocaleString()}</span>
          {!statsSpinning && totalPages > 1 && (
            <span className={styles.statSub}>pg {page}/{totalPages}</span>
          )}
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Packages</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : (stats?.total_packages ?? 0).toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Revenue</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : fmt(stats?.total_revenue ?? 0)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>UPS Cost</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : fmt(stats?.total_ups_cost ?? 0)}</span>
        </div>
        <div className={`${styles.stat} ${styles.statProfit}`}>
          <span className={styles.statLabel}>Net Profit</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : fmt(stats?.total_profit ?? 0)}</span>
        </div>
        <div className={`${styles.stat} ${(stats?.total_cod ?? 0) > 0 ? styles.statCod : ''}`}>
          <span className={styles.statLabel}>COD Total</span>
          <span className={styles.statVal}>{statsSpinning ? '…' : fmt(stats?.total_cod ?? 0)}</span>
        </div>
      </div>

      {/* ── Filters row 1: search + customer + service + sales person ── */}
      <div className={styles.filters}>
        <input className={styles.input} placeholder="Search tracking / order ID…"
          value={tracking} onChange={e => setTracking(e.target.value)} />
        <CustomerSearch value={customer} onChange={setCustomer} customers={allCustomers} />
        <select className={styles.select} value={service} onChange={e => setService(e.target.value)}>
          {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={styles.select} value={salesPersonId}
          onChange={e => setSalesPersonId(e.target.value)}>
          <option value=''>Sales Person: All</option>
          {salesPersons.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </select>
        <select className={styles.select} value={cancelFilter}
          onChange={e => setCancelFilter(e.target.value as CancelFilter)}>
          {CANCEL_FILTERS.map(s => <option key={s} value={s}>{s === 'All' ? 'Status: All' : s}</option>)}
        </select>
      </div>

      {/* ── Filters row 2: date preset + From/To + COD + Claim + Reset ── */}
      <div className={styles.filters}>
        <select className={styles.select} value={datePreset}
          onChange={e => applyPreset(e.target.value as DatePreset)}>
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <label className={styles.dateLabel}>From</label>
        <input className={styles.input} style={{ maxWidth: 150 }} type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setDatePreset('Custom') }} />
        <label className={styles.dateLabel}>To</label>
        <input className={styles.input} style={{ maxWidth: 150 }} type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setDatePreset('Custom') }} />
        <select className={styles.select} value={codStatus} onChange={e => setCodStatus(e.target.value)}>
          {COD_STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'COD Status: All' : s}</option>)}
        </select>
        <select className={styles.select} value={claimStatus} onChange={e => setClaimStatus(e.target.value)}>
          {CLAIM_STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'Claim Status: All' : s}</option>)}
        </select>
        <button className={styles.resetBtn} onClick={reset}>Reset</button>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thNum}>#</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Service</th>
              <th className={styles.thCenter}>Pkgs</th>
              <th className={styles.thRight}>Charge</th>
              <th className={styles.thRight}>UPS Cost</th>
              <th className={styles.thRight}>Profit</th>
              <th>Sales</th>
              <th>COD</th>
              <th>Claim</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className={styles.empty}>Loading shipments…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={12} className={styles.empty}>No shipments found.</td></tr>
            ) : (
              orders.map((o, idx) => {
                const rowNum     = (page - 1) * PAGE_LIMIT + idx + 1
                const isOpen     = expanded.has(o.id)
                const isMulti    = o.totalPackages > 1
                const isCod      = o.codAmount > 0
                const isCancelled = o.customerCharge === 0
                return (
                  <React.Fragment key={o.id}>
                    <tr
                      className={[
                        isCancelled ? styles.rowCancelled : (isCod ? styles.rowCod : ''),
                        isOpen ? styles.rowExpanded : '',
                        styles.dataRow,
                      ].filter(Boolean).join(' ')}
                      onClick={() => o.packages.length > 0 && toggleExpand(o.id)}
                      style={{ cursor: o.packages.length > 0 ? 'pointer' : 'default' }}
                    >
                      <td className={styles.thNum}>
                        {o.packages.length > 0 && <span className={styles.expandIcon}>{isOpen ? '▾' : '▸'}</span>}
                        <span>{rowNum}</span>
                      </td>
                      <td className={styles.muted}>{o.date}</td>
                      <td>
                        <div className={styles.customerCell}>
                          <span>{o.customer || <span className={styles.unassigned}>—</span>}</span>
                          {o.trackingNo && <span className={styles.trackingSub}>{o.trackingNo}</span>}
                        </div>
                      </td>
                      <td>
                        {o.serviceType
                          ? <span className={`${styles.svcBadge} ${styles['svc_' + o.serviceType.replace(/ /g, '_')]}`}>{o.serviceType}</span>
                          : <span className={styles.muted}>—</span>
                        }
                      </td>
                      <td className={styles.thCenter}>
                        {isMulti
                          ? <span className={styles.pkgBadge}>×{o.totalPackages}</span>
                          : <span className={styles.muted}>1</span>}
                      </td>
                      <td className={`${styles.thRight} ${isCancelled ? styles.muted : ''}`}>
                        {isCancelled ? '—' : fmt(o.customerCharge)}
                      </td>
                      <td className={`${styles.thRight} ${styles.muted}`}>
                        {isCancelled ? '—' : fmt(o.upsCost)}
                      </td>
                      <td className={`${styles.thRight} ${isCancelled ? styles.muted : styles.profit}`}>
                        {isCancelled ? '—' : fmt(o.profit)}
                      </td>
                      <td className={styles.muted}>
                        {o.salesPerson || <span className={styles.unassigned}>—</span>}
                      </td>
                      <td>
                        {isCod ? (
                          <div className={styles.codCell}>
                            <span className={`${styles.codStatusBadge} ${
                              o.codStatus === 'Collected' ? styles.codCollected :
                              o.codStatus === 'Returned'  ? styles.codReturned  : styles.codPending
                            }`}>{o.codStatus ?? 'Pending'}</span>
                            <span className={styles.codAmt}>{fmt(o.codAmount)}</span>
                          </div>
                        ) : <span className={styles.muted}>—</span>}
                      </td>
                      <td>
                        {o.claimStatus ? (
                          <span className={`${styles.claimBadge} ${
                            o.claimStatus === 'Paid'     ? styles.claimPaid     :
                            o.claimStatus === 'Approved' ? styles.claimApproved : styles.claimClaimed
                          }`}>{o.claimStatus}</span>
                        ) : <span className={styles.muted}>—</span>}
                      </td>
                      <td>
                        {isCancelled
                          ? <span className={styles.cancelBadge}>Cancelled</span>
                          : <span className={styles.muted}>—</span>
                        }
                      </td>
                    </tr>
                    {isOpen && <PackageRows packages={o.packages} orderId={o.orderId} />}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
          {!loading && orders.length > 0 && (
            <tfoot>
              <tr className={styles.footerRow}>
                <td colSpan={4} className={styles.footerLabel}>
                  Page {page} of {totalPages} — {total.toLocaleString()} orders
                </td>
                <td className={styles.thCenter}>{pageTotals.packages}</td>
                <td className={styles.thRight}>{fmt(pageTotals.revenue)}</td>
                <td className={`${styles.thRight} ${styles.muted}`}>{fmt(pageTotals.upsCost)}</td>
                <td className={`${styles.thRight} ${styles.profit}`}>{fmt(pageTotals.profit)}</td>
                <td></td>
                <td>{pageTotals.cod > 0 ? <span className={styles.codBadge}>{fmt(pageTotals.cod)}</span> : '—'}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1}
            onClick={() => loadOrders(1)} title="First page">«</button>
          <button className={styles.pageBtn} disabled={page <= 1}
            onClick={() => loadOrders(page - 1)} title="Previous page">‹</button>

          <div className={styles.pageNumbers}>
            {(() => {
              const WING  = 4                                       // pages each side
              const start = Math.max(1, Math.min(page - WING, totalPages - WING * 2))
              const end   = Math.min(totalPages, start + WING * 2)
              return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                <button key={p}
                  className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ''}`}
                  onClick={() => loadOrders(p)}>{p}</button>
              ))
            })()}
          </div>

          <button className={styles.pageBtn} disabled={page >= totalPages}
            onClick={() => loadOrders(page + 1)} title="Next page">›</button>
          <button className={styles.pageBtn} disabled={page >= totalPages}
            onClick={() => loadOrders(totalPages)} title="Last page">»</button>

          <span className={styles.pageInfo}>
            총 {total.toLocaleString()}건 &nbsp;|&nbsp; {page} / {totalPages} 페이지
          </span>
        </div>
      )}
    </div>
  )
}
