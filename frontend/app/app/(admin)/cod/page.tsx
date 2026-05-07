'use client'
import { useState, useMemo } from 'react'
import styles from './cod.module.css'
import CodDetailModal from './CodDetailModal'
import EmailPreviewModal from './EmailPreviewModal'
import PaymentHistoryModal from './PaymentHistoryModal'

export type CodRecord = {
  id: string
  statementDate: string
  statementNo: string
  referenceNo: string
  trackingNo: string
  pickupDate: string
  deliveryDate: string
  codAmount: number
  checkNo: string
  serviceFee: number
  premiumFee: number
  checkAmount: number
  customerEmail: string
  customer: string
  returned: boolean
  claimedPayment: boolean
  emailSent: boolean
  quickbookStatus: 'none' | 'bill_created' | 'paid'
  paid: boolean
}

export type PaymentBatch = {
  id: string
  batchDate: string
  customer: string
  totalAmount: number
  trackingNos: string[]
  status: 'pending' | 'paid'
  paidDate: string
  memo: string
}

export type Flag = 'returned' | 'claimedPayment' | 'emailSent' | 'paid'

const MOCK_RECORDS: CodRecord[] = [
  { id:'COD001', statementDate:'2026-01-27', statementNo:'022D1-00488', referenceNo:'REF-001', trackingNo:'1Z888BB20234567895', pickupDate:'2026-01-20', deliveryDate:'2026-01-22', codAmount:320.00, checkNo:'CHK-10041', serviceFee:5.50, premiumFee:2.00, checkAmount:312.50, customerEmail:'spark@email.com', customer:'Sarah Park',  returned:false, claimedPayment:false, emailSent:true,  quickbookStatus:'bill_created', paid:false },
  { id:'COD002', statementDate:'2026-01-27', statementNo:'022D1-00488', referenceNo:'REF-002', trackingNo:'1Z333GG70789012340', pickupDate:'2026-01-21', deliveryDate:'2026-01-23', codAmount:560.00, checkNo:'CHK-10042', serviceFee:5.50, premiumFee:2.00, checkAmount:552.50, customerEmail:'ghan@email.com',  customer:'Grace Han',   returned:false, claimedPayment:false, emailSent:false, quickbookStatus:'none',         paid:false },
  { id:'COD003', statementDate:'2026-02-10', statementNo:'022D1-00512', referenceNo:'REF-003', trackingNo:'1Z555EE50567890128', pickupDate:'2026-02-03', deliveryDate:'2026-02-05', codAmount:180.00, checkNo:'CHK-10088', serviceFee:5.50, premiumFee:0.00, checkAmount:174.50, customerEmail:'mlee@email.com',   customer:'Mike Lee',    returned:false, claimedPayment:true,  emailSent:true,  quickbookStatus:'paid',         paid:true  },
  { id:'COD004', statementDate:'2026-02-10', statementNo:'022D1-00512', referenceNo:'REF-004', trackingNo:'1Z000JJ01012345673', pickupDate:'2026-02-04', deliveryDate:'2026-02-06', codAmount:220.00, checkNo:'CHK-10089', serviceFee:5.50, premiumFee:2.00, checkAmount:212.50, customerEmail:'spark@email.com', customer:'Sarah Park',  returned:false, claimedPayment:false, emailSent:true,  quickbookStatus:'none',         paid:false },
  { id:'COD005', statementDate:'2026-03-05', statementNo:'022D1-00534', referenceNo:'REF-005', trackingNo:'1Z999BB30111222333', pickupDate:'2026-02-26', deliveryDate:'2026-02-28', codAmount:450.00, checkNo:'CHK-10120', serviceFee:5.50, premiumFee:2.00, checkAmount:442.50, customerEmail:'',               customer:'',            returned:true,  claimedPayment:false, emailSent:false, quickbookStatus:'none',         paid:false },
]

const MOCK_BATCHES: PaymentBatch[] = [
  { id:'BATCH001', batchDate:'2026-02-12', customer:'Mike Lee', totalAmount:174.50, trackingNos:['1Z555EE50567890128'], status:'paid', paidDate:'2026-02-12', memo:'Zelle transfer' },
]

const STATEMENTS    = ['All', ...Array.from(new Set(MOCK_RECORDS.map(r => r.statementNo)))]
const CUSTOMERS_OPT = ['All', 'Unmatched', ...Array.from(new Set(MOCK_RECORDS.filter(r=>r.customer).map(r=>r.customer))).sort()]
const fmt = (n: number) => `$${n.toFixed(2)}`

type BulkAction = 'email' | 'paid' | 'quickbook' | 'claimed' | 'returned'

export default function CodPage() {
  const [records,  setRecords]  = useState<CodRecord[]>(MOCK_RECORDS)
  const [batches,  setBatches]  = useState<PaymentBatch[]>(MOCK_BATCHES)
  const [stmtFilter, setStmt]   = useState('All')
  const [custFilter, setCust]   = useState('All')
  const [search,     setSearch] = useState('')
  const [selected,   setSelected] = useState<Set<string>>(new Set())

  // modals
  const [detail,      setDetail]      = useState<CodRecord | null>(null)
  const [emailTarget, setEmailTarget] = useState<CodRecord[] | null>(null)
  const [showPayHist, setShowPayHist] = useState(false)

  const filtered = useMemo(() => records.filter(r => {
    if (stmtFilter !== 'All' && r.statementNo !== stmtFilter) return false
    if (custFilter === 'Unmatched' && r.customer !== '') return false
    if (custFilter !== 'All' && custFilter !== 'Unmatched' && r.customer !== custFilter) return false
    if (search && !r.trackingNo.toLowerCase().includes(search.toLowerCase()) &&
                  !r.customer.toLowerCase().includes(search.toLowerCase()) &&
                  !r.checkNo.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [records, stmtFilter, custFilter, search])

  const totals = useMemo(() => ({
    cod:    filtered.reduce((a,r)=>a+r.codAmount, 0),
    check:  filtered.reduce((a,r)=>a+r.checkAmount, 0),
    unpaid: filtered.filter(r=>!r.paid&&!r.returned).length,
  }), [filtered])

  // ── Selection ───────────────────────────────────────────────
  const allChecked   = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const someChecked  = filtered.some(r => selected.has(r.id))
  const selectedRows = records.filter(r => selected.has(r.id))

  const toggleAll = () => {
    if (allChecked) {
      setSelected(prev => { const n=new Set(prev); filtered.forEach(r=>n.delete(r.id)); return n })
    } else {
      setSelected(prev => { const n=new Set(prev); filtered.forEach(r=>n.add(r.id)); return n })
    }
  }
  const toggleOne = (id: string) => {
    setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  }

  // ── Record updater ───────────────────────────────────────────
  const updateRecords = (ids: string[], patch: Partial<CodRecord>) => {
    setRecords(prev => prev.map(r => ids.includes(r.id) ? {...r, ...patch} : r))
  }

  const toggleFlag = (id: string, flag: Flag) => {
    setRecords(prev => prev.map(r => r.id === id ? {...r, [flag]: !r[flag]} : r))
  }

  // ── Bulk actions ─────────────────────────────────────────────
  const handleBulk = (action: BulkAction) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return

    if (action === 'email') {
      const targets = records.filter(r => ids.includes(r.id) && r.customer)
      if (targets.length) setEmailTarget(targets)
      return
    }
    if (action === 'paid') {
      // group by customer → create payment batches
      const map: Record<string, CodRecord[]> = {}
      records.filter(r => ids.includes(r.id) && !r.paid && r.customer).forEach(r => {
        if (!map[r.customer]) map[r.customer] = []
        map[r.customer].push(r)
      })
      const today = new Date().toISOString().slice(0,10)
      const newBatches: PaymentBatch[] = Object.entries(map).map(([cust, rows], i) => ({
        id: `BATCH${Date.now()}${i}`,
        batchDate: today,
        customer: cust,
        totalAmount: rows.reduce((a,r)=>a+r.checkAmount, 0),
        trackingNos: rows.map(r=>r.trackingNo),
        status: 'paid',
        paidDate: today,
        memo: '',
      }))
      setBatches(prev => [...prev, ...newBatches])
      updateRecords(ids, { paid: true })
      setSelected(new Set())
      return
    }
    if (action === 'quickbook') {
      setRecords(prev => prev.map(r =>
        ids.includes(r.id) && r.quickbookStatus === 'none'
          ? {...r, quickbookStatus: 'bill_created'} : r))
      setSelected(new Set())
      return
    }
    if (action === 'claimed')  { updateRecords(ids, { claimedPayment: true });  setSelected(new Set()); return }
    if (action === 'returned') { updateRecords(ids, { returned: true });         setSelected(new Set()); return }
  }

  // ── Email confirm ────────────────────────────────────────────
  const handleEmailSend = (targets: CodRecord[]) => {
    updateRecords(targets.map(r=>r.id), { emailSent: true })
    setEmailTarget(null)
    setSelected(new Set())
  }

  const qbLabel = (s: CodRecord['quickbookStatus']) =>
    s === 'paid' ? 'Paid in QB' : s === 'bill_created' ? 'Bill Created' : 'None'
  const qbClass = (s: CodRecord['quickbookStatus']) =>
    s === 'paid' ? styles.qbPaid : s === 'bill_created' ? styles.qbBill : styles.qbNone

  const unmatched  = records.filter(r=>!r.customer).length
  const unpaidCount = records.filter(r=>!r.paid&&!r.returned).length

  return (
    <div className={styles.page}>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Records</span>
          <span className={styles.statVal}>{records.length}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>COD Total</span>
          <span className={styles.statVal}>{fmt(records.reduce((a,r)=>a+r.codAmount,0))}</span>
        </div>
        <div className={`${styles.stat} ${unpaidCount>0?styles.statWarn:''}`}>
          <span className={styles.statLabel}>Unpaid</span>
          <span className={styles.statVal}>{unpaidCount}</span>
        </div>
        <div className={`${styles.stat} ${unmatched>0?styles.statDanger:''}`}>
          <span className={styles.statLabel}>Unmatched</span>
          <span className={styles.statVal}>{unmatched}</span>
        </div>
        <div className={styles.stat} style={{cursor:'pointer'}} onClick={()=>setShowPayHist(true)}>
          <span className={styles.statLabel}>Payment Batches ↗</span>
          <span className={styles.statVal}>{batches.length}</span>
        </div>
      </div>

      {/* Upload banner */}
      <div className={styles.uploadBanner}>
        <div className={styles.uploadLeft}>
          <span className={styles.uploadIcon}>📄</span>
          <div>
            <div className={styles.uploadTitle}>Upload UPS Capital COD Statement</div>
            <div className={styles.uploadSub}>PDF → auto-extract records → match with SHIPHEYO data</div>
          </div>
        </div>
        <button className={styles.uploadBtn}>Upload PDF Statement</button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input className={styles.input} placeholder="Search tracking, customer, check no…"
          value={search} onChange={e=>setSearch(e.target.value)} />
        <select className={styles.select} value={stmtFilter} onChange={e=>setStmt(e.target.value)}>
          {STATEMENTS.map(s=><option key={s}>{s}</option>)}
        </select>
        <select className={styles.select} value={custFilter} onChange={e=>setCust(e.target.value)}>
          {CUSTOMERS_OPT.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {someChecked && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <button className={styles.bulkBtn} onClick={()=>handleBulk('email')}>✉ Send Email Notice</button>
          <button className={styles.bulkBtn} onClick={()=>handleBulk('paid')}>💰 Mark as Paid</button>
          <button className={styles.bulkBtn} onClick={()=>handleBulk('quickbook')}>📒 Create QB Bill</button>
          <button className={styles.bulkBtn} onClick={()=>handleBulk('claimed')}>✓ Mark Claimed</button>
          <button className={styles.bulkBtn} onClick={()=>handleBulk('returned')}>↩ Mark Returned</button>
          <button className={styles.bulkClear} onClick={()=>setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allChecked}
                  ref={el=>{if(el) el.indeterminate=someChecked&&!allChecked}}
                  onChange={toggleAll} />
              </th>
              <th>Stmt Date</th>
              <th>Ref #</th>
              <th>Tracking Number</th>
              <th>Pickup</th>
              <th>Delivery</th>
              <th>COD Amt</th>
              <th>Check #</th>
              <th>Svc Fee</th>
              <th>Prem</th>
              <th>Check Amt</th>
              <th>Customer</th>
              <th>Email</th>
              <th className={styles.thCenter}>Returned</th>
              <th className={styles.thCenter}>Claimed</th>
              <th className={styles.thCenter}>Email Sent</th>
              <th>QuickBook</th>
              <th className={styles.thCenter}>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={19} className={styles.empty}>No records found.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className={
                selected.has(r.id) ? styles.rowSelected :
                r.returned         ? styles.rowReturned :
                !r.customer        ? styles.rowUnmatched :
                r.paid             ? styles.rowPaid : ''
              }>
                <td>
                  <input type="checkbox" checked={selected.has(r.id)}
                    onChange={()=>toggleOne(r.id)} />
                </td>
                <td className={styles.muted}>{r.statementDate}</td>
                <td className={styles.mono}>{r.referenceNo}</td>
                <td className={styles.tracking}>{r.trackingNo}</td>
                <td className={styles.muted}>{r.pickupDate}</td>
                <td className={styles.muted}>{r.deliveryDate}</td>
                <td className={styles.bold}>{fmt(r.codAmount)}</td>
                <td className={styles.mono}>{r.checkNo}</td>
                <td className={styles.muted}>{fmt(r.serviceFee)}</td>
                <td className={styles.muted}>{fmt(r.premiumFee)}</td>
                <td className={styles.bold}>{fmt(r.checkAmount)}</td>
                <td>
                  {r.customer
                    ? <span className={styles.customerName}>{r.customer}</span>
                    : <span className={styles.unmatchedBadge}>⚠ Unmatched</span>}
                </td>
                <td className={styles.muted}>{r.customerEmail||'—'}</td>
                {/* Boolean flags */}
                {(['returned','claimedPayment','emailSent'] as Flag[]).map(flag=>(
                  <td key={flag} className={styles.flagCell}>
                    <button
                      className={`${styles.flagBtn} ${r[flag]?styles.flagOn:styles.flagOff}`}
                      onClick={()=>toggleFlag(r.id, flag)}
                    >{r[flag]?'✓':'–'}</button>
                  </td>
                ))}
                {/* QuickBook status */}
                <td>
                  <span className={`${styles.qbBadge} ${qbClass(r.quickbookStatus)}`}>
                    {qbLabel(r.quickbookStatus)}
                  </span>
                </td>
                {/* Paid */}
                <td className={styles.flagCell}>
                  <button
                    className={`${styles.flagBtn} ${r.paid?styles.flagOn:styles.flagOff}`}
                    onClick={()=>toggleFlag(r.id,'paid')}
                  >{r.paid?'✓':'–'}</button>
                </td>
                <td>
                  <button className={styles.detailBtn} onClick={()=>setDetail(r)}>Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className={styles.footerRow}>
                <td colSpan={6} className={styles.footerLabel}>Total ({filtered.length})</td>
                <td className={styles.bold}>{fmt(totals.cod)}</td>
                <td/><td/><td/>
                <td className={styles.bold}>{fmt(totals.check)}</td>
                <td colSpan={8}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modals */}
      {detail && (
        <CodDetailModal record={detail} onClose={()=>setDetail(null)}
          onToggle={toggleFlag}
          onQbCreate={id=>setRecords(prev=>prev.map(r=>r.id===id&&r.quickbookStatus==='none'?{...r,quickbookStatus:'bill_created'}:r))}
          onEmailSingle={r=>setEmailTarget([r])}
        />
      )}
      {emailTarget && (
        <EmailPreviewModal records={emailTarget} onSend={handleEmailSend} onClose={()=>setEmailTarget(null)} />
      )}
      {showPayHist && (
        <PaymentHistoryModal batches={batches} onClose={()=>setShowPayHist(false)} />
      )}
    </div>
  )
}
