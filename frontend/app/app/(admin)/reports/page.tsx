'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import styles from './reports.module.css'
import { usePageLog, authFetch } from '@/lib/usePageLog'

// ── Types ──────────────────────────────────────────────────────────
type TabId = 'customer' | 'salesperson' | 'cod' | 'settlement'

type SummaryData = {
  from: string
  to: string
  totalRevenue: number
  totalUpsCost: number
  totalProfit: number
  totalOrders: number
  totalPackages: number
  totalCodAmount: number
  marginPct: number | null
  totalCodCollected: number
}

type CustomerRow = {
  id: string
  name: string
  email: string
  sales_persons: string | null
  shipments: number
  revenue: number
  ups_cost: number
  profit: number
  margin_pct: number | null
  cod_amount: number
}

type SalesPersonRow = {
  id: string
  name: string
  shipments: number
  customers: number
  revenue: number
  ups_cost: number
  profit: number
  commission: number
}

type SalesPerson = { id: string; name: string }
type Customer    = { id: string; name: string; email: string }

// ── ET date helpers ────────────────────────────────────────────────
function etToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function etMonthStart() {
  const today = etToday()
  return today.slice(0, 8) + '01'
}
function etYesterday() {
  const today = etToday()
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt  = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n)

const TABS: { id: TabId; label: string }[] = [
  { id: 'customer',    label: 'Customer Report' },
  { id: 'salesperson', label: 'Sales Person Report' },
  { id: 'cod',         label: 'COD Report' },
  { id: 'settlement',  label: 'Settlement Report' },
]

// ── Page ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  usePageLog('reports')
  const [tab, setTab] = useState<TabId>('customer')

  // filters
  const [dateFrom,    setDateFrom]    = useState(etMonthStart)
  const [dateTo,      setDateTo]      = useState(etYesterday)
  const [custInput,   setCustInput]   = useState('')
  const [custId,      setCustId]      = useState<string | undefined>(undefined)
  const [spId,        setSpId]        = useState<string | undefined>(undefined)

  // reference data
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([])
  const [customers,    setCustomers]    = useState<Customer[]>([])
  const [custSuggestions, setCustSuggestions] = useState<Customer[]>([])
  const [showSuggestions,  setShowSuggestions]  = useState(false)
  const custBoxRef = useRef<HTMLDivElement>(null)

  // report data
  const [summary,     setSummary]     = useState<SummaryData | null>(null)
  const [custRows,    setCustRows]    = useState<CustomerRow[]>([])
  const [spRows,      setSpRows]      = useState<SalesPersonRow[]>([])
  const [loading,     setLoading]     = useState(false)

  // ── Load reference data on mount ──────────────────────────────
  useEffect(() => {
    Promise.all([
      authFetch('/api/settings/sales-persons').then(r => r.json()),
      authFetch('/api/customers?limit=500').then(r => r.json()),
    ]).then(([sp, cust]) => {
      setSalesPersons(Array.isArray(sp) ? sp : [])
      const arr = Array.isArray(cust) ? cust : (cust?.customers ?? cust?.data ?? [])
      setCustomers(arr)
    }).catch(() => {})
  }, [])

  // ── Customer autocomplete ──────────────────────────────────────
  const handleCustInput = (val: string) => {
    setCustInput(val)
    setCustId(undefined)
    if (val.length >= 1) {
      const q = val.toLowerCase()
      setCustSuggestions(customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8))
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }

  const selectCustomer = (c: Customer) => {
    setCustInput(c.name)
    setCustId(c.id)
    setShowSuggestions(false)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custBoxRef.current && !custBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Fetch report data ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: dateFrom, to: dateTo })
      if (custId) qs.set('customer_id', custId)
      if (spId)   qs.set('sales_person_id', spId)

      const [sumRes, custRes, spRes] = await Promise.all([
        authFetch(`/api/reports/summary?from=${dateFrom}&to=${dateTo}`),
        authFetch(`/api/reports/customer?${qs}`),
        authFetch(`/api/reports/sales-person?from=${dateFrom}&to=${dateTo}`),
      ])
      const [sum, cust, sp] = await Promise.all([
        sumRes.json()  as Promise<SummaryData>,
        custRes.json() as Promise<CustomerRow[]>,
        spRes.json()   as Promise<SalesPersonRow[]>,
      ])
      setSummary(sum)
      setCustRows(Array.isArray(cust) ? cust : [])
      setSpRows(Array.isArray(sp) ? sp : [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [dateFrom, dateTo, custId, spId])

  // initial load
  useEffect(() => { fetchData() }, [fetchData])

  // ── Totals ─────────────────────────────────────────────────────
  const custTotals = custRows.reduce(
    (acc, r) => ({
      shipments: acc.shipments + r.shipments,
      revenue:   acc.revenue   + r.revenue,
      ups_cost:  acc.ups_cost  + r.ups_cost,
      profit:    acc.profit    + r.profit,
      cod:       acc.cod       + r.cod_amount,
    }),
    { shipments: 0, revenue: 0, ups_cost: 0, profit: 0, cod: 0 }
  )
  const custMarginTotal = custTotals.revenue > 0
    ? +((custTotals.profit / custTotals.revenue * 100).toFixed(1))
    : null

  const spTotals = spRows.reduce(
    (acc, r) => ({
      shipments:  acc.shipments  + r.shipments,
      customers:  acc.customers  + r.customers,
      revenue:    acc.revenue    + r.revenue,
      profit:     acc.profit     + r.profit,
      commission: acc.commission + r.commission,
    }),
    { shipments: 0, customers: 0, revenue: 0, profit: 0, commission: 0 }
  )

  // ── Excel export ───────────────────────────────────────────────
  const exportExcel = () => {
    let ws: XLSX.WorkSheet
    let filename = ''

    if (tab === 'customer') {
      const data = [
        ['Customer', 'Sales Person(s)', 'Shipments', 'Revenue', 'UPS Cost', 'Profit', 'Margin %', 'COD Amount'],
        ...custRows.map(r => [
          r.name, r.sales_persons ?? '', r.shipments,
          r.revenue, r.ups_cost, r.profit,
          r.margin_pct !== null ? `${r.margin_pct}%` : '—', r.cod_amount,
        ]),
        ['TOTAL', '', custTotals.shipments, custTotals.revenue, custTotals.ups_cost,
         custTotals.profit, custMarginTotal !== null ? `${custMarginTotal}%` : '—', custTotals.cod],
      ]
      ws = XLSX.utils.aoa_to_sheet(data)
      filename = `customer_report_${dateFrom}_${dateTo}.xlsx`
    } else if (tab === 'salesperson') {
      const data = [
        ['Sales Person', 'Customers', 'Shipments', 'Revenue', 'UPS Cost', 'Profit', 'Commission'],
        ...spRows.map(r => [r.name, r.customers, r.shipments, r.revenue, r.ups_cost, r.profit, r.commission]),
        ['TOTAL', spTotals.customers, spTotals.shipments, spTotals.revenue, 0, spTotals.profit, spTotals.commission],
      ]
      ws = XLSX.utils.aoa_to_sheet(data)
      filename = `salesperson_report_${dateFrom}_${dateTo}.xlsx`
    } else {
      return
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, filename)
  }

  const canExport = tab === 'customer' || tab === 'salesperson'

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Reports</div>
          <div className={styles.subtitle}>
            {dateFrom} ~ {dateTo}
          </div>
        </div>
        <div className={styles.exportBtns}>
          {canExport && (
            <button className={styles.btnExcel} onClick={exportExcel} disabled={loading}>
              ⬇ Export Excel
            </button>
          )}
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────── */}
      <div className={styles.overview}>
        {[
          {
            label: 'Total Revenue',
            value: loading ? '…' : fmtK(summary?.totalRevenue ?? 0),
            sub:   loading ? '' : `${(summary?.totalOrders ?? 0).toLocaleString()} orders · ${(summary?.totalPackages ?? 0).toLocaleString()} pkgs`,
            color: 'var(--text)',
          },
          {
            label: 'Net Profit',
            value: loading ? '…' : fmtK(summary?.totalProfit ?? 0),
            sub:   summary?.marginPct !== null && summary?.marginPct !== undefined
                     ? `${summary.marginPct}% margin`
                     : '—',
            color: '#10B981',
          },
          {
            label: 'UPS Cost',
            value: loading ? '…' : fmtK(summary?.totalUpsCost ?? 0),
            sub:   '',
            color: '#EF4444',
          },
          {
            label: 'COD Amount (on orders)',
            value: loading ? '…' : fmtK(summary?.totalCodAmount ?? 0),
            sub:   loading ? '' : `$${(summary?.totalCodCollected ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} collected`,
            color: '#F59E0B',
          },
        ].map(c => (
          <div key={c.label} className={styles.overviewCard}>
            <div className={styles.cardLabel}>{c.label}</div>
            <div className={styles.cardValue} style={{ color: c.color }}>{c.value}</div>
            {c.sub && <div className={styles.cardSub}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
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
        <div className={styles.filterGroup} ref={custBoxRef} style={{ position: 'relative' }}>
          <label className={styles.filterLabel}>Customer</label>
          <input
            type="text"
            className={styles.input}
            placeholder="Search customer…"
            value={custInput}
            onChange={e => handleCustInput(e.target.value)}
            onFocus={() => custInput.length >= 1 && setShowSuggestions(true)}
            autoComplete="off"
          />
          {showSuggestions && custSuggestions.length > 0 && (
            <div className={styles.suggestions}>
              {custSuggestions.map(c => (
                <div key={c.id} className={styles.suggestion}
                  onMouseDown={() => selectCustomer(c)}>
                  {c.name}
                  {c.email && <span className={styles.suggestionEmail}>{c.email}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Sales Person</label>
          <select className={styles.select} value={spId ?? ''}
            onChange={e => setSpId(e.target.value || undefined)}>
            <option value="">All</option>
            {salesPersons.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>
        <button className={styles.queryBtn} onClick={fetchData} disabled={loading}>
          {loading ? '…' : '조회'}
        </button>
      </div>

      {/* ── Tabs + Table ───────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Customer Report ── */}
        {tab === 'customer' && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Sales Person(s)</th>
                  <th className={styles.thRight}>Shipments</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Profit</th>
                  <th className={styles.thRight}>Margin</th>
                  <th className={styles.thRight}>COD Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className={styles.empty}>Loading…</td></tr>
                ) : custRows.length === 0 ? (
                  <tr><td colSpan={8} className={styles.empty}>No data for selected period.</td></tr>
                ) : custRows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className={styles.customerName}>{r.name}</div>
                      <div className={styles.custEmail}>{r.email}</div>
                    </td>
                    <td>
                      {r.sales_persons
                        ? r.sales_persons.split(', ').map(sp => (
                            <span key={sp} className={styles.spBadge}>{sp}</span>
                          ))
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.tdRight}>{r.shipments.toLocaleString()}</td>
                    <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(r.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(r.ups_cost)}</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(r.profit)}</td>
                    <td className={styles.tdRight}>
                      {r.margin_pct !== null
                        ? <span className={styles.marginBadge}>{r.margin_pct}%</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.tdRight}>
                      {r.cod_amount > 0
                        ? fmt(r.cod_amount)
                        : <span className={styles.muted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && custRows.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel} colSpan={2}>
                      Total ({custRows.length} customers)
                    </td>
                    <td className={styles.tdRight}>{custTotals.shipments.toLocaleString()}</td>
                    <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(custTotals.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(custTotals.ups_cost)}</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(custTotals.profit)}</td>
                    <td className={styles.tdRight}>
                      {custMarginTotal !== null
                        ? <span className={styles.marginBadge}>{custMarginTotal}%</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.tdRight}>{custTotals.cod > 0 ? fmt(custTotals.cod) : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Sales Person Report ── */}
        {tab === 'salesperson' && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sales Person</th>
                  <th className={styles.thRight}>Customers</th>
                  <th className={styles.thRight}>Shipments</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Profit</th>
                  <th className={styles.thRight}>Commission (10%)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className={styles.empty}>Loading…</td></tr>
                ) : spRows.length === 0 ? (
                  <tr><td colSpan={7} className={styles.empty}>No data for selected period.</td></tr>
                ) : spRows.map(r => (
                  <tr key={r.id}>
                    <td><span className={styles.spName}>{r.name}</span></td>
                    <td className={styles.tdRight}>{r.customers.toLocaleString()}</td>
                    <td className={styles.tdRight}>{r.shipments.toLocaleString()}</td>
                    <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(r.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(r.ups_cost)}</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(r.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
              {!loading && spRows.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel}>Total ({spRows.length} persons)</td>
                    <td className={styles.tdRight}>—</td>
                    <td className={styles.tdRight}>{spTotals.shipments.toLocaleString()}</td>
                    <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(spTotals.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>—</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(spTotals.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(spTotals.commission)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── COD Report (Coming Soon) ── */}
        {tab === 'cod' && (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>📦</div>
            <div className={styles.comingSoonTitle}>COD Report</div>
            <div className={styles.comingSoonSub}>Coming soon</div>
          </div>
        )}

        {/* ── Settlement Report (Coming Soon) ── */}
        {tab === 'settlement' && (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>📊</div>
            <div className={styles.comingSoonTitle}>Settlement Report</div>
            <div className={styles.comingSoonSub}>Coming soon</div>
          </div>
        )}
      </div>

    </div>
  )
}
