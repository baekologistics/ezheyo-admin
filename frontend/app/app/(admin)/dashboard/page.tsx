'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { usePageLog, authFetch } from '@/lib/usePageLog'
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import styles from './dashboard.module.css'


// ── Types ────────────────────────────────────────────────────────
type Stats = {
  totalRevenue:        number
  totalRevenueChange:  number | null
  totalProfit:         number
  totalProfitChange:   number | null
  totalOrders:         number
  totalPackages:       number
  codOutstanding:      number
  codOutstandingCount: number
  activeCustomers:     number
  totalCustomers:      number
  periodLabel:         string
}

type MonthRow = {
  month:    string
  revenue:  number
  profit:   number
  ups_cost: number
  orders:   number
}

type TopCustomerRow = {
  customer_name: string
  email:         string
  orders:        number
  packages:      number
  revenue:       number
  ups_cost:      number
  profit:        number
  margin_pct:    number | null
}

type SummaryData = {
  baeko: { totalUnpaid: number }
  salesPersons: Array<{ name: string; totalUnpaid: number }>
}

// ── Helpers ──────────────────────────────────────────────────────
const fmt  = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n)

const shortMonth = (yyyymm: string) => {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short' })
}

const RANK_EMOJI = ['🥇', '🥈', '🥉', '4', '5']

function ChangePill({ v }: { v: number | null }) {
  if (v === null) return null
  const cls  = v > 0 ? styles.changeUp : v < 0 ? styles.changeDown : styles.changeNone
  const sign = v > 0 ? '+' : ''
  return <span className={`${styles.change} ${cls}`}>{sign}{v}% vs last month</span>
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#111' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  usePageLog('dashboard')
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [chartData,   setChartData]   = useState<MonthRow[]>([])
  const [topCustomers,setTopCustomers]= useState<TopCustomerRow[]>([])
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, cRes, tcRes, smRes] = await Promise.all([
        authFetch('/api/dashboard/stats'),
        authFetch('/api/dashboard/monthly-chart'),
        authFetch('/api/dashboard/top-customers'),
        authFetch('/api/settlements/summary'),
      ])
      const [s, c, tc, sm] = await Promise.all([
        sRes.json()  as Promise<Stats>,
        cRes.json()  as Promise<MonthRow[]>,
        tcRes.json() as Promise<TopCustomerRow[]>,
        smRes.json() as Promise<SummaryData>,
      ])
      setStats(s)
      setChartData(c.map(r => ({ ...r, month: shortMonth(r.month) })))
      setTopCustomers(tc)
      setSummaryData(sm)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const baekoUnpaid = summaryData?.baeko.totalUnpaid ?? 0
  const salesUnpaid = summaryData
    ? summaryData.salesPersons.reduce((a, s) => a + s.totalUnpaid, 0)
    : 0

  // Totals row for top customers table
  const tcTotals = topCustomers.reduce(
    (acc, r) => ({
      orders:   acc.orders   + r.orders,
      packages: acc.packages + r.packages,
      revenue:  acc.revenue  + r.revenue,
      ups_cost: acc.ups_cost + r.ups_cost,
      profit:   acc.profit   + r.profit,
    }),
    { orders: 0, packages: 0, revenue: 0, ups_cost: 0, profit: 0 }
  )
  const tcMarginTotal = tcTotals.revenue > 0
    ? +((tcTotals.profit / tcTotals.revenue * 100).toFixed(1))
    : null

  const periodSub = stats?.periodLabel
    ? `(${stats.periodLabel})`
    : 'this month (thru yesterday)'

  return (
    <div className={styles.page}>

      {/* ── Row 1: This month ──────────────────────────────────── */}
      <div className={styles.statsRow}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Revenue</div>
          <div className={styles.cardValue}>
            {loading ? '…' : fmt(stats?.totalRevenue ?? 0)}
          </div>
          <ChangePill v={stats?.totalRevenueChange ?? null} />
          <div className={styles.cardSub}>this month (thru yesterday)</div>
        </div>

        <div className={`${styles.card} ${styles.cardProfit}`}>
          <div className={styles.cardLabel}>Net Profit</div>
          <div className={styles.cardValue} style={{ color: '#10B981' }}>
            {loading ? '…' : fmt(stats?.totalProfit ?? 0)}
          </div>
          <ChangePill v={stats?.totalProfitChange ?? null} />
          <div className={styles.cardSub}>this month (thru yesterday)</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Orders</div>
          <div className={styles.cardValue}>
            {loading ? '…' : (stats?.totalOrders ?? 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>this month (thru yesterday)</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Packages</div>
          <div className={styles.cardValue}>
            {loading ? '…' : (stats?.totalPackages ?? 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>this month (thru yesterday)</div>
        </div>
      </div>

      {/* ── Row 2: Status ──────────────────────────────────────── */}
      <div className={styles.statsRow}>
        <div className={`${styles.card} ${styles.cardWarning}`}>
          <div className={styles.cardLabel}>COD Outstanding</div>
          <div className={styles.cardValue} style={{ color: '#D97706' }}>
            {loading ? '…' : fmt(stats?.codOutstanding ?? 0)}
          </div>
          <div className={styles.cardSub}>
            {loading ? '…' : `${stats?.codOutstandingCount ?? 0} customers`}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Active Customers</div>
          <div className={styles.cardValue}>
            {loading ? '…' : (stats?.activeCustomers ?? 0).toLocaleString()}
          </div>
          <div className={styles.cardSub}>
            {loading ? '…' : `of ${stats?.totalCustomers ?? 0} total`}
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardBlue}`}>
          <div className={styles.cardLabel}>BAEKO Unpaid</div>
          <div className={styles.cardValue} style={{ color: '#2563EB' }}>
            {loading ? '…' : fmtK(baekoUnpaid)}
          </div>
          <div className={styles.cardSub}>since Dec 2024</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Sales Unpaid</div>
          <div className={styles.cardValue} style={{ color: '#F59E0B' }}>
            {loading ? '…' : fmtK(salesUnpaid)}
          </div>
          <div className={styles.cardSub}>since Dec 2024</div>
          {!loading && summaryData?.salesPersons.map(sp => (
            <div key={sp.name} className={styles.cardPayLine}>
              <span className={styles.cardPayLabel}>{sp.name.split(' ')[0]}</span>
              <span className={styles.amountRed}>{fmtK(sp.totalUnpaid)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Monthly Chart ──────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Monthly Revenue &amp; Profit
          <span className={styles.sectionHint}>Last 12 months</span>
        </div>
        <div className={styles.chartWrap}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={v => `$${(v as number / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false} tickLine={false} width={48}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="revenue"  name="Revenue"  fill="#3B82F6" radius={[3,3,0,0]} maxBarSize={32} />
              <Bar dataKey="ups_cost" name="UPS Cost" fill="#FCA5A5" radius={[3,3,0,0]} maxBarSize={32} />
              <Line
                dataKey="profit" name="Net Profit"
                stroke="#10B981" strokeWidth={2}
                dot={{ r: 3, fill: '#10B981' }} activeDot={{ r: 5 }} type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top 5 Customers ────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Top 5 Customers
          <span className={styles.sectionHint}>{periodSub}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Customer</th>
                <th className={styles.thRight}>Orders</th>
                <th className={styles.thRight}>Packages</th>
                <th className={styles.thRight}>Revenue</th>
                <th className={styles.thRight}>UPS Cost</th>
                <th className={styles.thRight}>Profit</th>
                <th className={styles.thRight}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className={styles.loading}>Loading…</td></tr>
              ) : topCustomers.length === 0 ? (
                <tr><td colSpan={8} className={styles.empty}>No data for this period.</td></tr>
              ) : topCustomers.map((row, i) => (
                <tr key={row.email}>
                  <td className={styles.rankCell}>
                    {i < 3
                      ? <span className={styles.rankEmoji}>{RANK_EMOJI[i]}</span>
                      : <span className={styles.rankNum}>{i + 1}</span>}
                  </td>
                  <td className={styles.customerName}>{row.customer_name}</td>
                  <td className={styles.tdRight}>{row.orders.toLocaleString()}</td>
                  <td className={styles.tdRight}>{row.packages.toLocaleString()}</td>
                  <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(row.revenue)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(row.ups_cost)}</td>
                  <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(row.profit)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>
                    {row.margin_pct !== null ? `${row.margin_pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && topCustomers.length > 0 && (
              <tfoot>
                <tr className={styles.footRow}>
                  <td colSpan={2} className={styles.footLabel}>Total (Top 5)</td>
                  <td className={styles.tdRight}>{tcTotals.orders.toLocaleString()}</td>
                  <td className={styles.tdRight}>{tcTotals.packages.toLocaleString()}</td>
                  <td className={`${styles.tdRight} ${styles.revCell}`}>{fmt(tcTotals.revenue)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>{fmt(tcTotals.ups_cost)}</td>
                  <td className={`${styles.tdRight} ${styles.profit}`}>{fmt(tcTotals.profit)}</td>
                  <td className={`${styles.tdRight} ${styles.muted}`}>
                    {tcMarginTotal !== null ? `${tcMarginTotal}%` : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  )
}
