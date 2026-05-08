'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import styles from './claims.module.css'

// ── Types ─────────────────────────────────────────────────────
type ClaimType   = 'COD' | 'General'
type ClaimStatus = 'Claimed' | 'Approved' | 'Paid'

type Claim = {
  id: string
  trackingNo: string
  date: string
  customer: string
  type: ClaimType
  claimAmount: number
  paidAmount: number | null
  status: ClaimStatus
  paidDate: string
  upsClaim: string
  emailSent: boolean
  memo: string
}

// ── Shipment lookup for auto-mapping ──────────────────────────
const SHIPMENT_LOOKUP: Record<string, { customer: string; date: string }> = {
  '1Z999AA10123456784': { customer: 'Jung Kim',   date: '2026-05-04' },
  '1Z888BB20234567895': { customer: 'Sarah Park', date: '2026-05-04' },
  '1Z777CC30345678906': { customer: 'Helen Cho',  date: '2026-05-04' },
  '1Z666DD40456789017': { customer: 'Jung Kim',   date: '2026-05-03' },
  '1Z555EE50567890128': { customer: 'Mike Lee',   date: '2026-05-03' },
  '1Z444FF60678901239': { customer: 'Brian Nam',  date: '2026-05-03' },
  '1Z333GG70789012340': { customer: 'Grace Han',  date: '2026-05-02' },
  '1Z222HH80890123451': { customer: 'Helen Cho',  date: '2026-05-02' },
  '1Z111II90901234562': { customer: 'Kevin Lim',  date: '2026-05-01' },
  '1Z000JJ01012345673': { customer: 'Sarah Park', date: '2026-05-01' },
}

// ── Mock data ─────────────────────────────────────────────────
const MOCK_CLAIMS: Claim[] = [
  // History (Paid)
  { id:'CLM001', trackingNo:'1Z777CC30345678906', date:'2026-03-15', customer:'Helen Cho',  type:'General', claimAmount:45.00,  paidAmount:42.00,  status:'Paid',     paidDate:'2026-03-20', upsClaim:'UPS-CLM-001', emailSent:true,  memo:'Package damaged in transit' },
  { id:'CLM005', trackingNo:'1Z333GG70789012340', date:'2026-02-28', customer:'Grace Han',  type:'COD',     claimAmount:180.00, paidAmount:175.00, status:'Paid',     paidDate:'2026-03-05', upsClaim:'UPS-CLM-005', emailSent:true,  memo:'COD check bounced'          },
  // Active
  { id:'CLM002', trackingNo:'1Z888BB20234567895', date:'2026-01-22', customer:'Sarah Park', type:'COD',     claimAmount:320.00, paidAmount:null,   status:'Claimed',  paidDate:'',           upsClaim:'UPS-CLM-002', emailSent:false, memo:'COD check bounced'          },
  { id:'CLM003', trackingNo:'1Z999AA10123456784', date:'2026-05-04', customer:'Jung Kim',   type:'General', claimAmount:28.50,  paidAmount:25.00,  status:'Approved', paidDate:'',           upsClaim:'UPS-CLM-003', emailSent:false, memo:'Lost package reimbursement'  },
  { id:'CLM004', trackingNo:'1Z444FF60678901239', date:'2026-05-03', customer:'Brian Nam',  type:'General', claimAmount:15.00,  paidAmount:null,   status:'Claimed',  paidDate:'',           upsClaim:'UPS-CLM-004', emailSent:false, memo:'Missing items'               },
]

const fmt   = (n: number)          => `$${n.toFixed(2)}`
const today = ()                   => new Date().toISOString().slice(0, 10)
const threeMonthsAgo = () => {
  const d = new Date(); d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}

// ── Customer autocomplete ─────────────────────────────────────
function CustomerAC({ value, onChange, list }: {
  value: string; onChange: (v: string) => void; list: string[]
}) {
  const [input, setInput] = useState(value)
  const [open,  setOpen]  = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() =>
    input.trim() === '' ? list : list.filter(c => c.toLowerCase().includes(input.toLowerCase())),
    [input, list])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (v: string) => { setInput(v); onChange(v); setOpen(false) }
  const clear  = () => { setInput(''); onChange(''); setOpen(false) }

  return (
    <div className={styles.acWrap} ref={wrapRef}>
      <div className={styles.acInputWrap}>
        <input className={styles.filterInput} placeholder="Customer…" value={input}
          onChange={e => { setInput(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} />
        {input && <button className={styles.acClear} onClick={clear} tabIndex={-1}>✕</button>}
      </div>
      {open && suggestions.length > 0 && (
        <ul className={styles.acList}>
          <li className={styles.acAll} onMouseDown={clear}>All customers</li>
          {suggestions.map(c => (
            <li key={c} className={`${styles.acItem} ${input === c ? styles.acSelected : ''}`}
              onMouseDown={() => select(c)}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Add Claim Modal ───────────────────────────────────────────
function AddClaimModal({ onSave, onClose }: { onSave: (c: Claim) => void; onClose: () => void }) {
  const [trackingNo,  setTrackingNo]  = useState('')
  const [customer,    setCustomer]    = useState('')
  const [date,        setDate]        = useState('')
  const [type,        setType]        = useState<ClaimType>('General')
  const [claimAmt,    setClaimAmt]    = useState('')
  const [upsClaim,    setUpsClaim]    = useState('')
  const [memo,        setMemo]        = useState('')
  const [notFound,    setNotFound]    = useState(false)

  const handleBlur = () => {
    const hit = SHIPMENT_LOOKUP[trackingNo.trim()]
    if (hit) { setCustomer(hit.customer); setDate(hit.date); setNotFound(false) }
    else if (trackingNo.trim()) { setCustomer(''); setDate(''); setNotFound(true) }
  }

  const canSave = trackingNo.trim() && customer && parseFloat(claimAmt) > 0

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Add Claim</div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Tracking Number</label>
            <input className={styles.input} placeholder="Enter UPS tracking number…"
              value={trackingNo}
              onChange={e => { setTrackingNo(e.target.value); setNotFound(false); setCustomer(''); setDate('') }}
              onBlur={handleBlur} />
            {notFound && <span className={styles.fieldHint}>Tracking not found — enter customer manually</span>}
          </div>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Customer</label>
              <input className={styles.input} placeholder="Auto-mapped or enter manually…"
                value={customer} onChange={e => setCustomer(e.target.value)} />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Shipment Date</label>
              <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Claim Type</label>
              <select className={styles.input} value={type} onChange={e => setType(e.target.value as ClaimType)}>
                <option value="General">General</option>
                <option value="COD">COD</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Claim Amount</label>
              <input type="number" min="0" step="0.01" className={styles.input}
                placeholder="0.00" value={claimAmt} onChange={e => setClaimAmt(e.target.value)} />
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>UPS Claim #</label>
            <input className={styles.input} placeholder="e.g. UPS-CLM-001"
              value={upsClaim} onChange={e => setUpsClaim(e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Memo</label>
            <input className={styles.input} placeholder="Optional note…"
              value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} disabled={!canSave}
            onClick={() => canSave && onSave({
              id: `CLM${Date.now()}`, trackingNo: trackingNo.trim(), date, customer,
              type, claimAmount: parseFloat(claimAmt), paidAmount: null,
              status: 'Claimed', paidDate: '', upsClaim: upsClaim.trim(),
              emailSent: false, memo: memo.trim(),
            })}>
            Add Claim
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Claim Modal ──────────────────────────────────────────
function EditClaimModal({ claim, onSave, onClose }: {
  claim: Claim; onSave: (c: Claim) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Claim>({ ...claim })
  const set = <K extends keyof Claim>(k: K, v: Claim[K]) => setDraft(p => ({ ...p, [k]: v }))

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Edit Claim</div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Tracking Number</label>
            <input className={styles.input} value={draft.trackingNo}
              onChange={e => set('trackingNo', e.target.value)} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Customer</label>
              <input className={styles.input} value={draft.customer}
                onChange={e => set('customer', e.target.value)} />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Shipment Date</label>
              <input type="date" className={styles.input} value={draft.date}
                onChange={e => set('date', e.target.value)} />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Claim Type</label>
              <select className={styles.input} value={draft.type}
                onChange={e => set('type', e.target.value as ClaimType)}>
                <option value="General">General</option>
                <option value="COD">COD</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Claim Amount</label>
              <input type="number" min="0" step="0.01" className={styles.input}
                value={draft.claimAmount}
                onChange={e => set('claimAmount', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Paid Amount (UPS 실제 보상금)</label>
              <input type="number" min="0" step="0.01" className={styles.input}
                placeholder="Enter when received…"
                value={draft.paidAmount ?? ''}
                onChange={e => set('paidAmount', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Paid Date</label>
              <input type="date" className={styles.input} value={draft.paidDate}
                onChange={e => set('paidDate', e.target.value)} />
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>UPS Claim #</label>
            <input className={styles.input} value={draft.upsClaim}
              onChange={e => set('upsClaim', e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Memo</label>
            <input className={styles.input} value={draft.memo}
              onChange={e => set('memo', e.target.value)} />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={() => onSave(draft)}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}

// ── Email Preview Modal ───────────────────────────────────────
function ClaimEmailModal({ claim, onSend, onClose }: {
  claim: Claim; onSend: () => void; onClose: () => void
}) {
  const hasPaid = claim.paidAmount !== null
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>✉ Claim Email Preview</div>
            <div className={styles.modalSub}>{claim.customer} · {fmt(claim.claimAmount)}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {!hasPaid && (
            <div className={styles.warningBox}>
              ⚠ Paid Amount not yet received. You can still send a status update email, but the
              reimbursement amount will not be included.
            </div>
          )}
          <div className={styles.emailPreview}>
            <div className={styles.emailHeader}>
              <div>
                <span className={styles.emailTo}>To: {claim.customer}</span>
                <span className={styles.emailSubject}>UPS Claim Update — {claim.upsClaim || 'Pending #'}</span>
              </div>
              <span className={styles.emailAmt}>{hasPaid ? fmt(claim.paidAmount!) : claim.status}</span>
            </div>
            <div className={styles.emailBody}>
              <p>Dear <strong>{claim.customer}</strong>,</p>
              <br />
              <p>We would like to update you on the UPS claim filed on your behalf:</p>
              <br />
              <div className={styles.emailDetails}>
                <div className={styles.emailDetailRow}>
                  <span>Tracking Number</span>
                  <span className={styles.emailDetailMono}>{claim.trackingNo}</span>
                </div>
                <div className={styles.emailDetailRow}>
                  <span>Claim Type</span><span>{claim.type}</span>
                </div>
                <div className={styles.emailDetailRow}>
                  <span>Claim Amount</span><strong>{fmt(claim.claimAmount)}</strong>
                </div>
                {hasPaid && (
                  <div className={styles.emailDetailRow}>
                    <span>Paid Amount (UPS)</span>
                    <strong style={{ color: '#059669' }}>{fmt(claim.paidAmount!)}</strong>
                  </div>
                )}
                <div className={styles.emailDetailRow}>
                  <span>Claim Status</span><span>{claim.status}</span>
                </div>
                {claim.upsClaim && (
                  <div className={styles.emailDetailRow}>
                    <span>UPS Claim #</span><span>{claim.upsClaim}</span>
                  </div>
                )}
              </div>
              <br />
              <p>Please contact us if you have any questions.</p>
              <br />
              <p>Best regards,<br /><strong>EZHEYO INC</strong></p>
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnSave} onClick={onSend}>✉ Confirm &amp; Mark Sent</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ClaimsPage() {
  const [claims,      setClaims]      = useState<Claim[]>(MOCK_CLAIMS)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editTarget,  setEditTarget]  = useState<Claim | null>(null)
  const [emailTarget, setEmailTarget] = useState<Claim | null>(null)

  // Active filters
  const [activeTracking, setActiveTracking] = useState('')
  const [activeCustomer, setActiveCustomer] = useState('')
  const [activeType,     setActiveType]     = useState('All')
  const [activeStatus,   setActiveStatus]   = useState('All')

  // History filters
  const [histTracking, setHistTracking] = useState('')
  const [histCustomer, setHistCustomer] = useState('')
  const [histFrom,     setHistFrom]     = useState(threeMonthsAgo)
  const [histTo,       setHistTo]       = useState('')

  // ── Derived ──────────────────────────────────────────────────
  const activeClaims = useMemo(() =>
    claims.filter(c => c.status !== 'Paid').filter(c => {
      if (activeTracking && !c.trackingNo.toLowerCase().includes(activeTracking.toLowerCase())) return false
      if (activeCustomer && !c.customer.toLowerCase().includes(activeCustomer.toLowerCase())) return false
      if (activeType   !== 'All' && c.type   !== activeType)   return false
      if (activeStatus !== 'All' && c.status !== activeStatus) return false
      return true
    }), [claims, activeTracking, activeCustomer, activeType, activeStatus])

  const historyClaims = useMemo(() =>
    claims.filter(c => c.status === 'Paid').filter(c => {
      if (histTracking && !c.trackingNo.toLowerCase().includes(histTracking.toLowerCase())) return false
      if (histCustomer && !c.customer.toLowerCase().includes(histCustomer.toLowerCase()))   return false
      if (histFrom && c.paidDate && c.paidDate < histFrom) return false
      if (histTo   && c.paidDate && c.paidDate > histTo)   return false
      return true
    }), [claims, histTracking, histCustomer, histFrom, histTo])

  const allCustomers = useMemo(() =>
    Array.from(new Set(claims.map(c => c.customer))).sort(), [claims])

  const stats = useMemo(() => ({
    total:    claims.length,
    claimed:  claims.filter(c => c.status === 'Claimed').length,
    approved: claims.filter(c => c.status === 'Approved').length,
    paidOut:  claims.filter(c => c.status === 'Paid').reduce((a, c) => a + (c.paidAmount ?? c.claimAmount), 0),
  }), [claims])

  // ── Handlers ─────────────────────────────────────────────────
  const cycleStatus = (id: string) => {
    setClaims(prev => prev.map(c => {
      if (c.id !== id) return c
      if (c.status === 'Claimed')  return { ...c, status: 'Approved' }
      if (c.status === 'Approved') return { ...c, status: 'Paid', paidDate: today() }
      return c
    }))
  }

  const handleAdd  = (c: Claim) => { setClaims(prev => [c, ...prev]); setShowAdd(false) }
  const handleEdit = (c: Claim) => { setClaims(prev => prev.map(x => x.id === c.id ? c : x)); setEditTarget(null) }
  const handleEmailSend = () => {
    if (!emailTarget) return
    setClaims(prev => prev.map(c => c.id === emailTarget.id ? { ...c, emailSent: true } : c))
    setEmailTarget(null)
  }

  return (
    <div className={styles.page}>

      {/* ── Stats ───────────────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Claims</span>
          <span className={styles.statVal}>{stats.total}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pending / Claimed</span>
          <span className={styles.statVal}>{stats.claimed}</span>
        </div>
        <div className={`${styles.stat} ${stats.approved > 0 ? styles.statInfo : ''}`}>
          <span className={styles.statLabel}>Approved</span>
          <span className={styles.statVal}>{stats.approved}</span>
        </div>
        <div className={`${styles.stat} ${styles.statProfit}`}>
          <span className={styles.statLabel}>Total Paid Out</span>
          <span className={styles.statVal}>{fmt(stats.paidOut)}</span>
        </div>
      </div>

      {/* ── Section 1: Active Claims ─────────────────────────── */}
      <div className={styles.sectionWrap}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Active Claims</div>
            <div className={styles.sectionSub}>Click status badge to advance: Claimed → Approved → Paid</div>
          </div>
          <button className={styles.btnAdd} onClick={() => setShowAdd(true)}>+ Add Claim</button>
        </div>

        {/* Active filters */}
        <div className={styles.filterBar}>
          <input className={styles.filterInput} placeholder="Tracking No…"
            value={activeTracking} onChange={e => setActiveTracking(e.target.value)} />
          <CustomerAC value={activeCustomer} onChange={setActiveCustomer} list={allCustomers} />
          <select className={styles.filterSelect} value={activeType} onChange={e => setActiveType(e.target.value)}>
            <option value="All">Type: All</option>
            <option value="COD">COD</option>
            <option value="General">General</option>
          </select>
          <select className={styles.filterSelect} value={activeStatus} onChange={e => setActiveStatus(e.target.value)}>
            <option value="All">Status: All</option>
            <option value="Claimed">Claimed</option>
            <option value="Approved">Approved</option>
          </select>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tracking No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Type</th>
                <th className={styles.thRight}>Claim Amt</th>
                <th className={styles.thRight}>Paid Amt</th>
                <th>Claim Status</th>
                <th>UPS Claim #</th>
                <th className={styles.thCenter}>Email</th>
                <th>Memo</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeClaims.length === 0 && (
                <tr><td colSpan={11} className={styles.empty}>No active claims.</td></tr>
              )}
              {activeClaims.map(c => (
                <tr key={c.id}>
                  <td className={styles.tracking}>{c.trackingNo}</td>
                  <td className={styles.muted}>{c.date}</td>
                  <td className={styles.customerName}>{c.customer}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${c.type === 'COD' ? styles.typeCod : styles.typeGeneral}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className={`${styles.bold} ${styles.thRight}`}>{fmt(c.claimAmount)}</td>
                  <td className={styles.thRight}>
                    {c.paidAmount !== null
                      ? <span className={styles.paidAmt}>{fmt(c.paidAmount)}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                  <td>
                    <button
                      className={`${styles.statusBtn} ${c.status === 'Approved' ? styles.statusApproved : styles.statusClaimed}`}
                      title="Click to advance"
                      onClick={() => cycleStatus(c.id)}
                    >
                      {c.status}
                    </button>
                  </td>
                  <td className={styles.mono}>{c.upsClaim || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.thCenter}>
                    {c.emailSent
                      ? <span className={styles.emailSentBadge}>✓ Sent</span>
                      : <span className={styles.emailNotSent}>–</span>}
                  </td>
                  <td className={styles.muted}>{c.memo || '—'}</td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button className={styles.sendEmailBtn} onClick={() => setEmailTarget(c)}>✉</button>
                      <button className={styles.editBtn} onClick={() => setEditTarget(c)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 2: Claims History ─────────────────────────── */}
      <div className={styles.sectionWrap}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Claims History</div>
            <div className={styles.sectionSub}>Paid claims — default: last 3 months</div>
          </div>
        </div>

        {/* History filters */}
        <div className={styles.filterBar}>
          <input className={styles.filterInput} placeholder="Tracking No…"
            value={histTracking} onChange={e => setHistTracking(e.target.value)} />
          <CustomerAC value={histCustomer} onChange={setHistCustomer} list={allCustomers} />
          <label className={styles.dateLabel}>From</label>
          <input type="date" className={styles.filterInput} style={{ maxWidth: 150 }}
            value={histFrom} onChange={e => setHistFrom(e.target.value)} />
          <label className={styles.dateLabel}>To</label>
          <input type="date" className={styles.filterInput} style={{ maxWidth: 150 }}
            value={histTo} onChange={e => setHistTo(e.target.value)} />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tracking No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Type</th>
                <th className={styles.thRight}>Claim Amt</th>
                <th className={styles.thRight}>Paid Amt</th>
                <th>UPS Claim #</th>
                <th>Paid Date</th>
                <th className={styles.thCenter}>Email</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {historyClaims.length === 0 && (
                <tr><td colSpan={10} className={styles.empty}>No history found.</td></tr>
              )}
              {historyClaims.map(c => (
                <tr key={c.id} className={styles.rowPaid}>
                  <td className={styles.tracking}>{c.trackingNo}</td>
                  <td className={styles.muted}>{c.date}</td>
                  <td className={styles.customerName}>{c.customer}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${c.type === 'COD' ? styles.typeCod : styles.typeGeneral}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className={`${styles.bold} ${styles.thRight}`}>{fmt(c.claimAmount)}</td>
                  <td className={`${styles.thRight}`}>
                    {c.paidAmount !== null
                      ? <span className={styles.paidAmt}>{fmt(c.paidAmount)}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.mono}>{c.upsClaim || '—'}</td>
                  <td className={styles.muted}>{c.paidDate || '—'}</td>
                  <td className={styles.thCenter}>
                    {c.emailSent
                      ? <span className={styles.emailSentBadge}>✓ Sent</span>
                      : <span className={styles.emailNotSent}>–</span>}
                  </td>
                  <td className={styles.muted}>{c.memo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}
      {showAdd     && <AddClaimModal  onSave={handleAdd}  onClose={() => setShowAdd(false)} />}
      {editTarget  && <EditClaimModal claim={editTarget}  onSave={handleEdit} onClose={() => setEditTarget(null)} />}
      {emailTarget && <ClaimEmailModal claim={emailTarget} onSend={handleEmailSend} onClose={() => setEmailTarget(null)} />}
    </div>
  )
}
