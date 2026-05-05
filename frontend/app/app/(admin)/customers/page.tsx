'use client'
import { useState } from 'react'
import styles from './customers.module.css'
import EditModal from './EditModal'

export type Customer = {
  id: string
  name: string
  email: string
  phone: string
  marginRate: string
  paymentType: 'Prepay' | 'Monthly'
  createdDate: string
  status: 'Active' | 'Inactive'
  salesPerson: string
  memo: string
  lastSynced: string
}

export const SALES_PERSONS = ['Alice Yoon', 'David Park', 'Jenny Oh']
const FILTER_OPTIONS = ['All', 'Unassigned', ...SALES_PERSONS]

const MOCK: Customer[] = [
  { id: 'C001', name: 'Jung Kim',   email: 'jkim@email.com',  phone: '703-555-0101', marginRate: '22%', paymentType: 'Monthly', createdDate: '2024-03-12', status: 'Active',   salesPerson: 'Alice Yoon', memo: 'Key account. Handle with priority.', lastSynced: '2026-05-04' },
  { id: 'C002', name: 'Sarah Park', email: 'spark@email.com', phone: '571-555-0182', marginRate: '18%', paymentType: 'Prepay',  createdDate: '2024-05-01', status: 'Active',   salesPerson: 'David Park', memo: '',                                  lastSynced: '2026-05-04' },
  { id: 'C003', name: 'Mike Lee',   email: 'mlee@email.com',  phone: '240-555-0143', marginRate: '15%', paymentType: 'Monthly', createdDate: '2024-07-19', status: 'Active',   salesPerson: '',           memo: 'Prefers email contact only.',       lastSynced: '2026-05-03' },
  { id: 'C004', name: 'Helen Cho',  email: 'hcho@email.com',  phone: '301-555-0167', marginRate: '20%', paymentType: 'Prepay',  createdDate: '2024-08-30', status: 'Active',   salesPerson: 'Jenny Oh',   memo: '',                                  lastSynced: '2026-05-04' },
  { id: 'C005', name: 'Brian Nam',  email: 'bnam@email.com',  phone: '703-555-0198', marginRate: '12%', paymentType: 'Monthly', createdDate: '2024-09-14', status: 'Active',   salesPerson: '',           memo: 'COD outstanding — follow up.',      lastSynced: '2026-05-03' },
  { id: 'C006', name: 'Yuna Shin',  email: 'yshin@email.com', phone: '571-555-0121', marginRate: '16%', paymentType: 'Prepay',  createdDate: '2023-11-05', status: 'Inactive', salesPerson: 'Alice Yoon', memo: '',                                  lastSynced: '2026-04-28' },
  { id: 'C007', name: 'Kevin Lim',  email: 'klim@email.com',  phone: '240-555-0155', marginRate: '19%', paymentType: 'Prepay',  createdDate: '2025-01-22', status: 'Active',   salesPerson: '',           memo: '',                                  lastSynced: '2026-05-04' },
  { id: 'C008', name: 'Grace Han',  email: 'ghan@email.com',  phone: '301-555-0133', marginRate: '17%', paymentType: 'Monthly', createdDate: '2025-02-10', status: 'Active',   salesPerson: 'David Park', memo: 'Referred by Jung Kim.',             lastSynced: '2026-05-02' },
]

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(MOCK)
  const [filter, setFilter]       = useState('All')
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState<Customer | null>(null)

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    const matchFilter =
      filter === 'All'        ? true :
      filter === 'Unassigned' ? c.salesPerson === '' :
                                c.salesPerson === filter
    return matchSearch && matchFilter
  })

  const handleSave = (id: string, salesPerson: string, memo: string) => {
    setCustomers(prev =>
      prev.map(c => c.id === id ? { ...c, salesPerson, memo } : c)
    )
    setEditing(null)
  }

  const unassigned = customers.filter(c => c.salesPerson === '').length

  return (
    <div className={styles.page}>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statVal}>{customers.length}</span>
          <span className={styles.statLabel}>Total Customers</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>{customers.filter(c => c.status === 'Active').length}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={`${styles.stat} ${unassigned > 0 ? styles.statWarn : ''}`}>
          <span className={styles.statVal}>{unassigned}</span>
          <span className={styles.statLabel}>No Sales Person</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>{new Date().toLocaleDateString('en-CA')}</span>
          <span className={styles.statLabel}>Last Sync</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search by name, email, or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.select} value={filter} onChange={e => setFilter(e.target.value)}>
          {FILTER_OPTIONS.map(f => <option key={f}>{f}</option>)}
        </select>
        <button className={styles.syncBtn}>↻ Sync from SHIPHEYO</button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Margin</th>
              <th>Payment</th>
              <th>Created</th>
              <th>Status</th>
              <th>Sales Person</th>
              <th>Memo</th>
              <th>Last Synced</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} className={styles.empty}>No customers found.</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id}>
                <td className={styles.mono}>{c.id}</td>
                <td><strong>{c.name}</strong></td>
                <td className={styles.muted}>{c.email}</td>
                <td className={styles.muted}>{c.phone}</td>
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
                  {c.salesPerson
                    ? <span className={styles.spName}>{c.salesPerson}</span>
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
      </div>

      {editing && (
        <EditModal
          customer={editing}
          salesPersons={SALES_PERSONS}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
