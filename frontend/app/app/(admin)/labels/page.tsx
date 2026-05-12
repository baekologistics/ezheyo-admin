'use client'
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import styles from './labels.module.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const PAGE_LIMIT = 50

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
  orderId:         string   // shipheyo_order_id
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
  const ups  = Number(o.ups_cost)       || 0
  const chg  = Number(o.customer_charge)|| 0
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
const SERVICE_TYPES  = ['All', 'Ground', 'Next Day Air', '2nd Day Air']
const COD_STATUSES   = ['All', 'Pending', 'Collected', 'Returned']
const CLAIM_STATUSES = ['All', 'Claimed', 'Approved', 'Paid']

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
function PackageRows({ packages }: { packages: Package[] }) {
  return (
    <tr className={styles.accordionRow}>
      <td colSpan={12} className={styles.accordionCell}>
        <table className={styles.pkgTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Tracking No</th>
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
  const [orders,      setOrders]      = useState<Order[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [allCustomers, setAllCustomers] = useState<string[]>([])

  // Filters
  const [tracking,    setTracking]    = useState('')
  const [customer,    setCustomer]    = useState('')
  const [service,     setService]     = useState('All')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [codStatus,   setCodStatus]   = useState('All')
  const [claimStatus, setClaimStatus] = useState('All')

  // ── Fetch customer list for autocomplete ──────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/customers`)
      .then(r => r.json())
      .then((data: Array<{ name: string }>) => {
        setAllCustomers(Array.from(new Set(data.map(c => c.name).filter(Boolean))).sort())
      })
      .catch(() => {})
  }, [])

  // ── Fetch orders ──────────────────────────────────────────
  const loadOrders = useCallback(async (pg: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page',  String(pg))
      params.set('limit', String(PAGE_LIMIT))
      if (tracking)           params.set('search',       tracking)
      if (customer)           params.set('customer_name', customer)
      if (service !== 'All')  params.set('service_type',  service)
      if (dateFrom)           params.set('date_from',     dateFrom)
      if (dateTo)             params.set('date_to',       dateTo)
      if (codStatus   !== 'All') params.set('cod_status',   codStatus.toLowerCase())
      if (claimStatus !== 'All') params.set('claim_status', claimStatus.toLowerCase())

      const res = await fetch(`${API_URL}/api/orders?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      if (!Array.isArray(data.orders)) {
        throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}`)
      }
      setOrders(data.orders.map(mapOrder))
      setTotal(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setPage(pg)
      setExpanded(new Set())   // collapse all on page change
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tracking, customer, service, dateFrom, dateTo, codStatus, claimStatus])

  // Initial load
  useEffect(() => { loadOrders(1) }, [loadOrders])

  // Reset to page 1 when filters change (loadOrders dep changes trigger this)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    loadOrders(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, customer, service, dateFrom, dateTo, codStatus, claimStatus])

  // ── Stats ─────────────────────────────────────────────────
  const totals = useMemo(() => ({
    packages: orders.reduce((a, o) => a + o.totalPackages, 0),
    revenue:  orders.reduce((a, o) => a + o.customerCharge, 0),
    upsCost:  orders.reduce((a, o) => a + o.upsCost, 0),
    profit:   orders.reduce((a, o) => a + o.profit, 0),
    cod:      orders.reduce((a, o) => a + o.codAmount, 0),
  }), [orders])

  // ── Accordion toggle ──────────────────────────────────────
  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const reset = () => {
    setTracking(''); setCustomer(''); setService('All')
    setDateFrom(''); setDateTo(''); setCodStatus('All'); setClaimStatus('All')
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

  return (
    <div className={styles.page}>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Orders</span>
          <span className={styles.statVal}>{loading ? '…' : total.toLocaleString()}</span>
          {!loading && totalPages > 1 && (
            <span className={styles.statSub}>showing {orders.length} on page {page}</span>
          )}
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Packages</span>
          <span className={styles.statVal}>{loading ? '…' : totals.packages}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Revenue</span>
          <span className={styles.statVal}>{loading ? '…' : fmt(totals.revenue)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>UPS Cost</span>
          <span className={styles.statVal}>{loading ? '…' : fmt(totals.upsCost)}</span>
        </div>
        <div className={`${styles.stat} ${styles.statProfit}`}>
          <span className={styles.statLabel}>Net Profit</span>
          <span className={styles.statVal}>{loading ? '…' : fmt(totals.profit)}</span>
        </div>
        <div className={`${styles.stat} ${totals.cod > 0 ? styles.statCod : ''}`}>
          <span className={styles.statLabel}>COD Total</span>
          <span className={styles.statVal}>{loading ? '…' : fmt(totals.cod)}</span>
        </div>
      </div>

      {/* ── Filters row 1 ──────────────────────────────────── */}
      <div className={styles.filters}>
        <input className={styles.input} placeholder="Search tracking number (partial ok)…"
          value={tracking} onChange={e => setTracking(e.target.value)} />
        <CustomerSearch value={customer} onChange={setCustomer} customers={allCustomers} />
        <select className={styles.select} value={service} onChange={e => setService(e.target.value)}>
          {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Filters row 2 ──────────────────────────────────── */}
      <div className={styles.filters}>
        <label className={styles.dateLabel}>From</label>
        <input className={styles.input} style={{ maxWidth: 160 }} type="date"
          value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <label className={styles.dateLabel}>To</label>
        <input className={styles.input} style={{ maxWidth: 160 }} type="date"
          value={dateTo} onChange={e => setDateTo(e.target.value)} />
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
              <th>Order ID</th>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className={styles.empty}>Loading shipments…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={12} className={styles.empty}>No shipments found.</td></tr>
            ) : (
              orders.map((o, idx) => {
                const rowNum  = (page - 1) * PAGE_LIMIT + idx + 1
                const isOpen  = expanded.has(o.id)
                const isMulti = o.totalPackages > 1
                const isCod   = o.codAmount > 0
                return (
                  <React.Fragment key={o.id}>
                    <tr
                      className={[
                        isCod ? styles.rowCod : '',
                        isOpen ? styles.rowExpanded : '',
                        styles.dataRow,
                      ].filter(Boolean).join(' ')}
                      onClick={() => o.packages.length > 0 && toggleExpand(o.id)}
                      style={{ cursor: o.packages.length > 0 ? 'pointer' : 'default' }}
                    >
                      <td className={styles.thNum}>{rowNum}</td>
                      <td>
                        <div className={styles.orderIdCell}>
                          {o.packages.length > 0 && (
                            <span className={styles.expandIcon}>{isOpen ? '▾' : '▸'}</span>
                          )}
                          <span className={styles.orderId}>{o.orderId || '—'}</span>
                        </div>
                      </td>
                      <td className={styles.muted}>{o.date}</td>
                      <td>
                        <div className={styles.customerCell}>
                          <span>{o.customer || <span className={styles.unassigned}>—</span>}</span>
                          {o.trackingNo && <span className={styles.trackingSub}>{o.trackingNo}</span>}
                        </div>
                      </td>
                      <td>
                        {o.serviceType ? (
                          <span className={`${styles.svcBadge} ${styles['svc_' + o.serviceType.replace(/ /g, '_')]}`}>
                            {o.serviceType}
                          </span>
                        ) : <span className={styles.muted}>—</span>}
                      </td>
                      <td className={styles.thCenter}>
                        {isMulti
                          ? <span className={styles.pkgBadge}>×{o.totalPackages}</span>
                          : <span className={styles.muted}>1</span>}
                      </td>
                      <td className={styles.thRight}>{fmt(o.customerCharge)}</td>
                      <td className={`${styles.thRight} ${styles.muted}`}>{fmt(o.upsCost)}</td>
                      <td className={`${styles.thRight} ${styles.profit}`}>{fmt(o.profit)}</td>
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
                    </tr>
                    {isOpen && <PackageRows packages={o.packages} />}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
          {!loading && orders.length > 0 && (
            <tfoot>
              <tr className={styles.footerRow}>
                <td colSpan={5} className={styles.footerLabel}>
                  Page {page} of {totalPages} — {total.toLocaleString()} orders
                </td>
                <td className={styles.thCenter}>{totals.packages}</td>
                <td className={styles.thRight}>{fmt(totals.revenue)}</td>
                <td className={`${styles.thRight} ${styles.muted}`}>{fmt(totals.upsCost)}</td>
                <td className={`${styles.thRight} ${styles.profit}`}>{fmt(totals.profit)}</td>
                <td></td>
                <td>{totals.cod > 0 ? <span className={styles.codBadge}>{fmt(totals.cod)}</span> : '—'}</td>
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
            onClick={() => loadOrders(page - 1)}>← Prev</button>
          <div className={styles.pageNumbers}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // Show pages around current
              let p: number
              if (totalPages <= 7) {
                p = i + 1
              } else if (page <= 4) {
                p = i + 1
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i
              } else {
                p = page - 3 + i
              }
              return (
                <button key={p}
                  className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ''}`}
                  onClick={() => loadOrders(p)}>{p}</button>
              )
            })}
          </div>
          <button className={styles.pageBtn} disabled={page >= totalPages}
            onClick={() => loadOrders(page + 1)}>Next →</button>
          <span className={styles.pageInfo}>{total.toLocaleString()} total orders</span>
        </div>
      )}
    </div>
  )
}
