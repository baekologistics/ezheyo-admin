'use client'
import { useState, useMemo } from 'react'
import styles from './labels.module.css'

type Shipment = {
  id: string
  trackingNo: string
  date: string
  customer: string
  serviceType: string
  upsCost: number
  customerCharge: number
  salesPerson: string
  codAmount: number
}

const MOCK: Shipment[] = [
  { id: 'S001', trackingNo: '1Z999AA10123456784', date: '2026-05-04', customer: 'Jung Kim',   serviceType: 'Ground',       upsCost: 12.40, customerCharge: 18.40, salesPerson: 'Alice Yoon', codAmount: 0       },
  { id: 'S002', trackingNo: '1Z888BB20234567895', date: '2026-05-04', customer: 'Sarah Park', serviceType: 'Next Day Air', upsCost: 32.10, customerCharge: 42.10, salesPerson: 'David Park', codAmount: 320.00  },
  { id: 'S003', trackingNo: '1Z777CC30345678906', date: '2026-05-04', customer: 'Helen Cho',  serviceType: 'Ground',       upsCost: 10.20, customerCharge: 15.80, salesPerson: 'Jenny Oh',   codAmount: 0       },
  { id: 'S004', trackingNo: '1Z666DD40456789017', date: '2026-05-03', customer: 'Jung Kim',   serviceType: '2nd Day Air',  upsCost: 22.50, customerCharge: 31.00, salesPerson: 'Alice Yoon', codAmount: 0       },
  { id: 'S005', trackingNo: '1Z555EE50567890128', date: '2026-05-03', customer: 'Mike Lee',   serviceType: 'Ground',       upsCost: 9.80,  customerCharge: 14.50, salesPerson: '',           codAmount: 180.00  },
  { id: 'S006', trackingNo: '1Z444FF60678901239', date: '2026-05-03', customer: 'Brian Nam',  serviceType: 'Ground',       upsCost: 11.30, customerCharge: 16.20, salesPerson: '',           codAmount: 0       },
  { id: 'S007', trackingNo: '1Z333GG70789012340', date: '2026-05-02', customer: 'Grace Han',  serviceType: 'Next Day Air', upsCost: 35.00, customerCharge: 46.50, salesPerson: 'David Park', codAmount: 560.00  },
  { id: 'S008', trackingNo: '1Z222HH80890123451', date: '2026-05-02', customer: 'Helen Cho',  serviceType: 'Ground',       upsCost: 8.90,  customerCharge: 13.40, salesPerson: 'Jenny Oh',   codAmount: 0       },
  { id: 'S009', trackingNo: '1Z111II90901234562', date: '2026-05-01', customer: 'Kevin Lim',  serviceType: 'Ground',       upsCost: 10.60, customerCharge: 15.30, salesPerson: '',           codAmount: 0       },
  { id: 'S010', trackingNo: '1Z000JJ01012345673', date: '2026-05-01', customer: 'Sarah Park', serviceType: '2nd Day Air',  upsCost: 24.20, customerCharge: 33.80, salesPerson: 'David Park', codAmount: 220.00  },
  { id: 'S011', trackingNo: '1Z999KK11123456784', date: '2026-04-30', customer: 'Jung Kim',   serviceType: 'Ground',       upsCost: 13.10, customerCharge: 19.20, salesPerson: 'Alice Yoon', codAmount: 0       },
  { id: 'S012', trackingNo: '1Z888LL21234567895', date: '2026-04-30', customer: 'Yuna Shin',  serviceType: 'Ground',       upsCost: 9.40,  customerCharge: 14.10, salesPerson: 'Alice Yoon', codAmount: 0       },
]

const CUSTOMERS    = ['All', ...Array.from(new Set(MOCK.map(s => s.customer))).sort()]
const SERVICE_TYPES = ['All', 'Ground', 'Next Day Air', '2nd Day Air']

const fmt = (n: number) => `$${n.toFixed(2)}`

export default function LabelsPage() {
  const [search,      setSearch]      = useState('')
  const [customer,    setCustomer]    = useState('All')
  const [service,     setService]     = useState('All')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [codOnly,     setCodOnly]     = useState(false)

  const filtered = useMemo(() => MOCK.filter(s => {
    if (search    && !s.trackingNo.toLowerCase().includes(search.toLowerCase())) return false
    if (customer !== 'All' && s.customer !== customer)   return false
    if (service  !== 'All' && s.serviceType !== service) return false
    if (codOnly  && s.codAmount === 0)                   return false
    if (dateFrom && s.date < dateFrom)                   return false
    if (dateTo   && s.date > dateTo)                     return false
    return true
  }), [search, customer, service, codOnly, dateFrom, dateTo])

  const totals = useMemo(() => ({
    upsCost:        filtered.reduce((a, s) => a + s.upsCost, 0),
    customerCharge: filtered.reduce((a, s) => a + s.customerCharge, 0),
    profit:         filtered.reduce((a, s) => a + (s.customerCharge - s.upsCost), 0),
    cod:            filtered.reduce((a, s) => a + s.codAmount, 0),
  }), [filtered])

  return (
    <div className={styles.page}>

      {/* Summary cards */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Shipments</span>
          <span className={styles.statVal}>{filtered.length}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Revenue</span>
          <span className={styles.statVal}>{fmt(totals.customerCharge)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>UPS Cost</span>
          <span className={styles.statVal}>{fmt(totals.upsCost)}</span>
        </div>
        <div className={`${styles.stat} ${styles.statProfit}`}>
          <span className={styles.statLabel}>Total Profit</span>
          <span className={styles.statVal}>{fmt(totals.profit)}</span>
        </div>
        <div className={`${styles.stat} ${totals.cod > 0 ? styles.statCod : ''}`}>
          <span className={styles.statLabel}>COD Total</span>
          <span className={styles.statVal}>{fmt(totals.cod)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.input}
          placeholder="Search tracking number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.select} value={customer} onChange={e => setCustomer(e.target.value)}>
          {CUSTOMERS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className={styles.select} value={service} onChange={e => setService(e.target.value)}>
          {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
        </select>
        <input
          className={styles.input}
          style={{ width: 140 }}
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <span className={styles.dateSep}>—</span>
        <input
          className={styles.input}
          style={{ width: 140 }}
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
        <label className={styles.codToggle}>
          <input type="checkbox" checked={codOnly} onChange={e => setCodOnly(e.target.checked)} />
          COD only
        </label>
        <button
          className={styles.resetBtn}
          onClick={() => { setSearch(''); setCustomer('All'); setService('All'); setDateFrom(''); setDateTo(''); setCodOnly(false) }}
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tracking Number</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Service</th>
              <th>UPS Cost</th>
              <th>Charge</th>
              <th>Profit</th>
              <th>Sales Person</th>
              <th>COD</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className={styles.empty}>No shipments found.</td></tr>
            )}
            {filtered.map(s => {
              const profit = s.customerCharge - s.upsCost
              const isCod  = s.codAmount > 0
              return (
                <tr key={s.id} className={isCod ? styles.rowCod : ''}>
                  <td className={styles.tracking}>{s.trackingNo}</td>
                  <td className={styles.muted}>{s.date}</td>
                  <td>{s.customer}</td>
                  <td>
                    <span className={`${styles.svcBadge} ${styles['svc_' + s.serviceType.replace(/ /g,'_')]}`}>
                      {s.serviceType}
                    </span>
                  </td>
                  <td className={styles.muted}>{fmt(s.upsCost)}</td>
                  <td>{fmt(s.customerCharge)}</td>
                  <td className={styles.profit}>{fmt(profit)}</td>
                  <td className={styles.muted}>
                    {s.salesPerson || <span className={styles.unassigned}>—</span>}
                  </td>
                  <td>
                    {isCod
                      ? <span className={styles.codBadge}>{fmt(s.codAmount)}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className={styles.footerRow}>
                <td colSpan={4} className={styles.footerLabel}>Total ({filtered.length} shipments)</td>
                <td className={styles.muted}>{fmt(totals.upsCost)}</td>
                <td>{fmt(totals.customerCharge)}</td>
                <td className={styles.profit}>{fmt(totals.profit)}</td>
                <td></td>
                <td className={styles.codBadge} style={{ background: 'none', padding: 0 }}>
                  {totals.cod > 0 ? fmt(totals.cod) : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
