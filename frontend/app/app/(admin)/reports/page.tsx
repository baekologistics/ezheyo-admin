'use client'
import { useState, useMemo } from 'react'
import styles from './reports.module.css'

// ── Types ──────────────────────────────────────────────────────
type TabId = 'customer' | 'salesperson' | 'cod' | 'settlement'

type Shipment = {
  id: string; date: string; customer: string; salesPerson: string
  customerCharge: number; upsCost: number; codAmount: number
}

type CodRecord = {
  id: string; month: string; codAmount: number
  collected: boolean; returned: boolean; paidOut: boolean
}

// ── Mock Data ──────────────────────────────────────────────────
const SALES_PERSONS = ['Alice Yoon', 'Brian Cho', 'Carol Lim', 'David Park']

const MOCK_SHIPMENTS: Shipment[] = [
  // 2025-11
  { id:'S101', date:'2025-11-04', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:310.40, upsCost:198.20, codAmount:0 },
  { id:'S102', date:'2025-11-07', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:540.10, upsCost:386.60, codAmount:320.00 },
  { id:'S103', date:'2025-11-10', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:198.00, upsCost:124.00, codAmount:0 },
  { id:'S104', date:'2025-11-13', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:420.00, upsCost:295.00, codAmount:0 },
  { id:'S105', date:'2025-11-16', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:336.00, upsCost:218.00, codAmount:560.00 },
  { id:'S106', date:'2025-11-19', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:612.00, upsCost:443.00, codAmount:0 },
  { id:'S107', date:'2025-11-21', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:255.00, upsCost:167.00, codAmount:180.00 },
  { id:'S108', date:'2025-11-24', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:479.00, upsCost:331.00, codAmount:0 },
  { id:'S109', date:'2025-11-26', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:380.00, upsCost:256.00, codAmount:0 },
  { id:'S110', date:'2025-11-28', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:724.00, upsCost:512.00, codAmount:450.00 },
  // 2025-12
  { id:'S111', date:'2025-12-03', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:290.00, upsCost:184.00, codAmount:0 },
  { id:'S112', date:'2025-12-06', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:620.00, upsCost:445.00, codAmount:220.00 },
  { id:'S113', date:'2025-12-09', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:458.00, upsCost:316.00, codAmount:0 },
  { id:'S114', date:'2025-12-12', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:224.00, upsCost:148.00, codAmount:0 },
  { id:'S115', date:'2025-12-15', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:671.00, upsCost:482.00, codAmount:0 },
  { id:'S116', date:'2025-12-18', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:395.00, upsCost:269.00, codAmount:340.00 },
  { id:'S117', date:'2025-12-20', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:830.00, upsCost:601.00, codAmount:0 },
  { id:'S118', date:'2025-12-22', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:298.00, upsCost:192.00, codAmount:0 },
  { id:'S119', date:'2025-12-24', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:546.00, upsCost:384.00, codAmount:180.00 },
  { id:'S120', date:'2025-12-27', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:362.00, upsCost:245.00, codAmount:0 },
  { id:'S121', date:'2025-12-29', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:447.00, upsCost:308.00, codAmount:0 },
  // 2026-01
  { id:'S001', date:'2026-01-03', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:28.40,  upsCost:18.20,  codAmount:0 },
  { id:'S002', date:'2026-01-05', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:54.10,  upsCost:38.60,  codAmount:0 },
  { id:'S003', date:'2026-01-08', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:19.80,  upsCost:12.40,  codAmount:0 },
  { id:'S004', date:'2026-01-12', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:42.00,  upsCost:29.50,  codAmount:0 },
  { id:'S005', date:'2026-01-15', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:33.60,  upsCost:21.80,  codAmount:0 },
  { id:'S006', date:'2026-01-18', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:61.20,  upsCost:44.30,  codAmount:0 },
  { id:'S007', date:'2026-01-20', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:25.50,  upsCost:16.70,  codAmount:0 },
  { id:'S008', date:'2026-01-22', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:47.90,  upsCost:33.10,  codAmount:0 },
  { id:'S009', date:'2026-01-25', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:38.00,  upsCost:25.60,  codAmount:0 },
  { id:'S010', date:'2026-01-28', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:72.40,  upsCost:51.20,  codAmount:0 },
  // 2026-02
  { id:'S011', date:'2026-02-02', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:31.60,  upsCost:20.40,  codAmount:0 },
  { id:'S012', date:'2026-02-05', customer:'Sarah Park', salesPerson:'Alice Yoon', customerCharge:58.20,  upsCost:41.30,  codAmount:0 },
  { id:'S013', date:'2026-02-07', customer:'Tom Shin',   salesPerson:'Carol Lim',  customerCharge:45.80,  upsCost:31.60,  codAmount:0 },
  { id:'S014', date:'2026-02-10', customer:'Mike Lee',   salesPerson:'Brian Cho',  customerCharge:22.40,  upsCost:14.80,  codAmount:0 },
  { id:'S015', date:'2026-02-12', customer:'Grace Han',  salesPerson:'Brian Cho',  customerCharge:67.10,  upsCost:48.20,  codAmount:0 },
  { id:'S016', date:'2026-02-14', customer:'David Kang', salesPerson:'Alice Yoon', customerCharge:39.50,  upsCost:26.90,  codAmount:0 },
  { id:'S017', date:'2026-02-17', customer:'Kevin Park', salesPerson:'Carol Lim',  customerCharge:83.00,  upsCost:60.10,  codAmount:0 },
  { id:'S018', date:'2026-02-19', customer:'Helen Cho',  salesPerson:'Alice Yoon', customerCharge:29.80,  upsCost:19.20,  codAmount:0 },
  { id:'S019', date:'2026-02-21', customer:'Lucy Yim',   salesPerson:'Brian Cho',  customerCharge:54.60,  upsCost:38.40,  codAmount:0 },
  { id:'S020', date:'2026-02-24', customer:'Jane Oh',    salesPerson:'Carol Lim',  customerCharge:36.20,  upsCost:24.50,  codAmount:0 },
  { id:'S021', date:'2026-02-26', customer:'Jung Kim',   salesPerson:'Alice Yoon', customerCharge:44.70,  upsCost:30.80,  codAmount:0 },
]

const MOCK_COD: CodRecord[] = [
  { id:'C001', month:'2025-11', codAmount:320.00,  collected:true,  returned:false, paidOut:true  },
  { id:'C002', month:'2025-11', codAmount:560.00,  collected:true,  returned:false, paidOut:true  },
  { id:'C003', month:'2025-11', codAmount:180.00,  collected:false, returned:true,  paidOut:false },
  { id:'C004', month:'2025-11', codAmount:450.00,  collected:true,  returned:false, paidOut:false },
  { id:'C005', month:'2025-12', codAmount:220.00,  collected:true,  returned:false, paidOut:true  },
  { id:'C006', month:'2025-12', codAmount:340.00,  collected:true,  returned:false, paidOut:true  },
  { id:'C007', month:'2025-12', codAmount:180.00,  collected:false, returned:false, paidOut:false },
  { id:'C008', month:'2026-01', codAmount:320.00,  collected:true,  returned:false, paidOut:false },
  { id:'C009', month:'2026-01', codAmount:150.00,  collected:false, returned:true,  paidOut:false },
  { id:'C010', month:'2026-02', codAmount:280.00,  collected:false, returned:false, paidOut:false },
  { id:'C011', month:'2026-02', codAmount:195.00,  collected:true,  returned:false, paidOut:false },
]

const MOCK_SETTLEMENT = [
  { month:'2025-11', revenue:3840.50, upsCost:2620.30, baekoPaid:true,  salesPaid:true  },
  { month:'2025-12', revenue:4510.80, upsCost:3120.60, baekoPaid:true,  salesPaid:false },
  { month:'2026-01', revenue:422.90,  upsCost:291.40,  baekoPaid:false, salesPaid:false },
  { month:'2026-02', revenue:512.90,  upsCost:356.20,  baekoPaid:false, salesPaid:false },
]

// ── Helpers ────────────────────────────────────────────────────
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : fmt(n)
const pctFmt = (n: number, t: number) => t === 0 ? '0.0%' : `${((n / t) * 100).toFixed(1)}%`
const mLabel = (m: string) => { const [y, mo] = m.split('-'); return `${y} / ${mo}` }

const ALL_CUSTOMERS = Array.from(new Set(MOCK_SHIPMENTS.map(s => s.customer))).sort()

const TABS: { id: TabId; label: string }[] = [
  { id: 'customer',    label: 'Customer Report' },
  { id: 'salesperson', label: 'Sales Person Report' },
  { id: 'cod',         label: 'COD Report' },
  { id: 'settlement',  label: 'Settlement Report' },
]

// ── Page ──────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab]           = useState<TabId>('customer')
  const [dateFrom, setDateFrom] = useState('2025-11-01')
  const [dateTo, setDateTo]     = useState('2026-02-28')
  const [custSearch, setCustSearch] = useState('')
  const [spFilter, setSpFilter] = useState('All')

  // ── Filtered shipments ───────────────────────────────────────
  const filteredShipments = useMemo(() => MOCK_SHIPMENTS.filter(s => {
    if (s.date < dateFrom || s.date > dateTo) return false
    if (custSearch && !s.customer.toLowerCase().includes(custSearch.toLowerCase())) return false
    if (spFilter !== 'All' && s.salesPerson !== spFilter) return false
    return true
  }), [dateFrom, dateTo, custSearch, spFilter])

  // ── Overview totals ──────────────────────────────────────────
  const overview = useMemo(() => {
    const revenue = filteredShipments.reduce((a, s) => a + s.customerCharge, 0)
    const cost    = filteredShipments.reduce((a, s) => a + s.upsCost, 0)
    const profit  = revenue - cost
    const codTotal   = MOCK_COD.reduce((a, c) => a + c.codAmount, 0)
    const paidOut    = MOCK_COD.filter(c => c.paidOut).reduce((a, c) => a + c.codAmount, 0)
    return { revenue, profit, codTotal, paidOut }
  }, [filteredShipments])

  // ── Customer Report ──────────────────────────────────────────
  const customerRows = useMemo(() => {
    const map: Record<string, {
      revenue: number; cost: number; cod: number; count: number; salesPerson: string
    }> = {}
    filteredShipments.forEach(s => {
      if (!map[s.customer]) map[s.customer] = { revenue:0, cost:0, cod:0, count:0, salesPerson:s.salesPerson }
      map[s.customer].revenue += s.customerCharge
      map[s.customer].cost    += s.upsCost
      map[s.customer].cod     += s.codAmount
      map[s.customer].count   += 1
    })
    return Object.entries(map)
      .map(([customer, d]) => ({
        customer,
        revenue:    d.revenue,
        cost:       d.cost,
        profit:     d.revenue - d.cost,
        margin:     pctFmt(d.revenue - d.cost, d.revenue),
        cod:        d.cod,
        count:      d.count,
        salesPerson: d.salesPerson,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredShipments])

  // ── Sales Person Report ──────────────────────────────────────
  const spRows = useMemo(() => {
    const map: Record<string, {
      customers: Set<string>; count: number; revenue: number; cost: number
    }> = {}
    filteredShipments.forEach(s => {
      if (!map[s.salesPerson]) map[s.salesPerson] = { customers: new Set(), count:0, revenue:0, cost:0 }
      map[s.salesPerson].customers.add(s.customer)
      map[s.salesPerson].count   += 1
      map[s.salesPerson].revenue += s.customerCharge
      map[s.salesPerson].cost    += s.upsCost
    })
    return Object.entries(map)
      .map(([sp, d]) => ({
        salesPerson: sp,
        customers:   d.customers.size,
        count:       d.count,
        revenue:     d.revenue,
        profit:      d.revenue - d.cost,
        commission:  (d.revenue - d.cost) * 0.10,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredShipments])

  // ── COD Report ───────────────────────────────────────────────
  const codRows = useMemo(() => {
    const months = Array.from(new Set(MOCK_COD.map(c => c.month))).sort().reverse()
    return months.map(month => {
      const recs = MOCK_COD.filter(c => c.month === month)
      return {
        month,
        total:     recs.reduce((a, c) => a + c.codAmount, 0),
        collected: recs.filter(c => c.collected && !c.returned).reduce((a, c) => a + c.codAmount, 0),
        pending:   recs.filter(c => !c.collected && !c.returned).reduce((a, c) => a + c.codAmount, 0),
        returned:  recs.filter(c => c.returned).reduce((a, c) => a + c.codAmount, 0),
        paidOut:   recs.filter(c => c.paidOut).reduce((a, c) => a + c.codAmount, 0),
      }
    })
  }, [])

  // ── Settlement Report ────────────────────────────────────────
  const settlementRows = useMemo(() =>
    [...MOCK_SETTLEMENT].reverse().map(r => {
      const netProfit = r.revenue - r.upsCost
      return {
        month:       r.month,
        revenue:     r.revenue,
        upsCost:     r.upsCost,
        netProfit,
        baekoAmt:    netProfit * 0.30,
        salesAmt:    netProfit * 0.10,
        overheadAmt: netProfit * 0.60,
        baekoPaid:   r.baekoPaid,
        salesPaid:   r.salesPaid,
      }
    }), [])

  // ── Totals for current tab tables ────────────────────────────
  const custTotals = useMemo(() => ({
    revenue: customerRows.reduce((a, r) => a + r.revenue, 0),
    cost:    customerRows.reduce((a, r) => a + r.cost, 0),
    profit:  customerRows.reduce((a, r) => a + r.profit, 0),
    cod:     customerRows.reduce((a, r) => a + r.cod, 0),
    count:   customerRows.reduce((a, r) => a + r.count, 0),
  }), [customerRows])

  const spTotals = useMemo(() => ({
    count:      spRows.reduce((a, r) => a + r.count, 0),
    revenue:    spRows.reduce((a, r) => a + r.revenue, 0),
    profit:     spRows.reduce((a, r) => a + r.profit, 0),
    commission: spRows.reduce((a, r) => a + r.commission, 0),
  }), [spRows])

  return (
    <div className={styles.page}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Reports</div>
          <div className={styles.subtitle}>Business analytics & export</div>
        </div>
        <div className={styles.exportBtns}>
          <button className={styles.btnExcel}>⬇ Export Excel</button>
          <button className={styles.btnPdf}>⬇ Export PDF</button>
        </div>
      </div>

      {/* ── Overview cards ─────────────────────────────────── */}
      <div className={styles.overview}>
        {[
          { label:'Total Revenue',       value: fmtK(overview.revenue), sub:`${filteredShipments.length} shipments`,    color:'var(--text)' },
          { label:'Total Profit',        value: fmtK(overview.profit),  sub: pctFmt(overview.profit, overview.revenue) + ' margin', color:'#10B981' },
          { label:'Total COD Collected', value: fmtK(overview.codTotal), sub:`${MOCK_COD.filter(c=>c.collected).length} collected`, color:'#F59E0B' },
          { label:'Total Paid Out',      value: fmtK(overview.paidOut), sub:`${MOCK_COD.filter(c=>c.paidOut).length} records`, color:'#FD4C1D' },
        ].map(c => (
          <div key={c.label} className={styles.overviewCard}>
            <div className={styles.cardLabel}>{c.label}</div>
            <div className={styles.cardValue} style={{ color: c.color }}>{c.value}</div>
            <div className={styles.cardSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
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
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Customer</label>
          <input type="text" className={styles.input} placeholder="Search customer…"
            value={custSearch} onChange={e => setCustSearch(e.target.value)} />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Sales Person</label>
          <select className={styles.select} value={spFilter}
            onChange={e => setSpFilter(e.target.value)}>
            <option value="All">All</option>
            {SALES_PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className={styles.filterMeta}>
          {filteredShipments.length} shipment{filteredShipments.length !== 1 ? 's' : ''} in range
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}>
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
                  <th>Sales Person</th>
                  <th className={styles.thRight}>Shipments</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Profit</th>
                  <th className={styles.thRight}>Margin %</th>
                  <th className={styles.thRight}>COD Amount</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.length === 0 && (
                  <tr><td colSpan={8} className={styles.empty}>No data for selected filters.</td></tr>
                )}
                {customerRows.map(r => (
                  <tr key={r.customer}>
                    <td><span className={styles.customerName}>{r.customer}</span></td>
                    <td><span className={styles.spBadge}>{r.salesPerson}</span></td>
                    <td className={styles.tdRight}>{r.count}</td>
                    <td className={styles.tdRight}>{fmt(r.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(r.cost)}</td>
                    <td className={styles.tdRight}>{fmt(r.profit)}</td>
                    <td className={styles.tdRight}>
                      <span className={styles.marginBadge}>{r.margin}</span>
                    </td>
                    <td className={styles.tdRight}>{r.cod > 0 ? fmt(r.cod) : <span className={styles.muted}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
              {customerRows.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel} colSpan={2}>Total ({customerRows.length} customers)</td>
                    <td className={styles.tdRight}>{custTotals.count}</td>
                    <td className={styles.tdRight}>{fmt(custTotals.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(custTotals.cost)}</td>
                    <td className={styles.tdRight}>{fmt(custTotals.profit)}</td>
                    <td className={styles.tdRight}>
                      <span className={styles.marginBadge}>{pctFmt(custTotals.profit, custTotals.revenue)}</span>
                    </td>
                    <td className={styles.tdRight}>{fmt(custTotals.cod)}</td>
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
                  <th className={styles.thRight}>Profit</th>
                  <th className={styles.thRight}>Commission (10%)</th>
                </tr>
              </thead>
              <tbody>
                {spRows.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>No data for selected filters.</td></tr>
                )}
                {spRows.map(r => (
                  <tr key={r.salesPerson}>
                    <td><span className={styles.spName}>{r.salesPerson}</span></td>
                    <td className={styles.tdRight}>{r.customers}</td>
                    <td className={styles.tdRight}>{r.count}</td>
                    <td className={styles.tdRight}>{fmt(r.revenue)}</td>
                    <td className={styles.tdRight}>{fmt(r.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
              {spRows.length > 0 && (
                <tfoot>
                  <tr className={styles.footRow}>
                    <td className={styles.footLabel}>Total ({spRows.length} persons)</td>
                    <td className={styles.tdRight}>—</td>
                    <td className={styles.tdRight}>{spTotals.count}</td>
                    <td className={styles.tdRight}>{fmt(spTotals.revenue)}</td>
                    <td className={styles.tdRight}>{fmt(spTotals.profit)}</td>
                    <td className={`${styles.tdRight} ${styles.commissionCell}`}>{fmt(spTotals.commission)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── COD Report ── */}
        {tab === 'cod' && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className={styles.thRight}>Total COD</th>
                  <th className={styles.thRight}>Collected</th>
                  <th className={styles.thRight}>Pending</th>
                  <th className={styles.thRight}>Returned</th>
                  <th className={styles.thRight}>Paid Out</th>
                </tr>
              </thead>
              <tbody>
                {codRows.map(r => (
                  <tr key={r.month}>
                    <td className={styles.monthCell}>{mLabel(r.month)}</td>
                    <td className={styles.tdRight}>{fmt(r.total)}</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(r.collected)}</td>
                    <td className={styles.tdRight}>
                      {r.pending > 0
                        ? <span className={styles.pendingAmt}>{fmt(r.pending)}</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.tdRight}>
                      {r.returned > 0
                        ? <span className={styles.returnedAmt}>{fmt(r.returned)}</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={`${styles.tdRight} ${styles.paidOutAmt}`}>{fmt(r.paidOut)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.footRow}>
                  <td className={styles.footLabel}>Total</td>
                  <td className={styles.tdRight}>{fmt(codRows.reduce((a,r)=>a+r.total,0))}</td>
                  <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(codRows.reduce((a,r)=>a+r.collected,0))}</td>
                  <td className={styles.tdRight}>{fmt(codRows.reduce((a,r)=>a+r.pending,0))}</td>
                  <td className={styles.tdRight}>{fmt(codRows.reduce((a,r)=>a+r.returned,0))}</td>
                  <td className={`${styles.tdRight} ${styles.paidOutAmt}`}>{fmt(codRows.reduce((a,r)=>a+r.paidOut,0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Settlement Report ── */}
        {tab === 'settlement' && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className={styles.thRight}>Revenue</th>
                  <th className={styles.thRight}>UPS Cost</th>
                  <th className={styles.thRight}>Net Profit</th>
                  <th className={styles.thRight}>BAEKO (30%)</th>
                  <th className={styles.thRight}>Sales (10%)</th>
                  <th className={styles.thRight}>Overhead (60%)</th>
                  <th className={styles.thCenter}>BAEKO Paid</th>
                  <th className={styles.thCenter}>Sales Paid</th>
                </tr>
              </thead>
              <tbody>
                {settlementRows.map(r => (
                  <tr key={r.month}>
                    <td className={styles.monthCell}>{mLabel(r.month)}</td>
                    <td className={styles.tdRight}>{fmt(r.revenue)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(r.upsCost)}</td>
                    <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(r.netProfit)}</td>
                    <td className={styles.tdRight} style={{ color:'#FD4C1D', fontWeight:600 }}>{fmt(r.baekoAmt)}</td>
                    <td className={styles.tdRight} style={{ color:'#F59E0B', fontWeight:600 }}>{fmt(r.salesAmt)}</td>
                    <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(r.overheadAmt)}</td>
                    <td className={styles.tdCenter}>
                      <span className={`${styles.badge} ${r.baekoPaid ? styles.badgePaid : styles.badgeUnpaid}`}>
                        {r.baekoPaid ? '✓ Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className={styles.tdCenter}>
                      <span className={`${styles.badge} ${r.salesPaid ? styles.badgePaid : styles.badgeUnpaid}`}>
                        {r.salesPaid ? '✓ Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.footRow}>
                  <td className={styles.footLabel}>Total</td>
                  <td className={styles.tdRight}>{fmt(settlementRows.reduce((a,r)=>a+r.revenue,0))}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(settlementRows.reduce((a,r)=>a+r.upsCost,0))}</td>
                  <td className={`${styles.tdRight} ${styles.positive}`}>{fmt(settlementRows.reduce((a,r)=>a+r.netProfit,0))}</td>
                  <td className={styles.tdRight} style={{ color:'#FD4C1D', fontWeight:600 }}>{fmt(settlementRows.reduce((a,r)=>a+r.baekoAmt,0))}</td>
                  <td className={styles.tdRight} style={{ color:'#F59E0B', fontWeight:600 }}>{fmt(settlementRows.reduce((a,r)=>a+r.salesAmt,0))}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(settlementRows.reduce((a,r)=>a+r.overheadAmt,0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
