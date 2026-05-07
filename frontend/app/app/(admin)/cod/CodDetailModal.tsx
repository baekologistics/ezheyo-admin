'use client'
import styles from './cod.module.css'
import type { CodRecord, Flag } from './page'

type Props = {
  record: CodRecord
  onClose: () => void
  onToggle: (id: string, flag: Flag) => void
  onQbCreate: (id: string) => void
  onEmailSingle: (r: CodRecord) => void
}

const fmt = (n: number) => `$${n.toFixed(2)}`

const FLAGS: { key: Flag; label: string; desc: string }[] = [
  { key: 'returned',       label: 'Returned',       desc: 'Package returned to sender' },
  { key: 'claimedPayment', label: 'Claimed Payment', desc: 'Customer confirmed receipt' },
  { key: 'emailSent',      label: 'Email Sent',      desc: 'COD notice sent to customer' },
  { key: 'paid',           label: 'Paid',            desc: 'Payment forwarded to customer' },
]

const QB_LABELS = { none:'Not Created', bill_created:'Bill Created', paid:'Paid in QB' }
const QB_NEXT   = { none:'Create QB Bill', bill_created:'Mark QB Paid', paid:'' }

export default function CodDetailModal({ record: r, onClose, onToggle, onQbCreate, onEmailSingle }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>COD Record Detail</div>
            <div className={styles.modalSub}>{r.statementNo} · {r.statementDate}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>

          <div className={styles.modalSection}>Shipment</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Tracking Number</span>
              <span className={styles.infoVal} style={{fontFamily:'monospace',fontSize:12}}>{r.trackingNo}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Reference #</span>
              <span className={styles.infoVal}>{r.referenceNo}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Pickup Date</span>
              <span className={styles.infoVal}>{r.pickupDate}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Delivery Date</span>
              <span className={styles.infoVal}>{r.deliveryDate}</span>
            </div>
          </div>

          <div className={styles.modalSection}>Customer</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Name</span>
              <span className={styles.infoVal}>
                {r.customer || <span className={styles.unmatchedBadge}>⚠ Unmatched</span>}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoVal}>{r.customerEmail || '—'}</span>
            </div>
          </div>

          <div className={styles.modalSection}>COD Amounts</div>
          <div className={styles.amountRow}>
            <div className={styles.amountItem}>
              <span className={styles.infoLabel}>C.O.D. Amount</span>
              <span className={styles.amountVal}>{fmt(r.codAmount)}</span>
            </div>
            <div className={styles.amountItem}>
              <span className={styles.infoLabel}>Service Fee</span>
              <span className={styles.amountVal} style={{color:'var(--muted)'}}>−{fmt(r.serviceFee)}</span>
            </div>
            <div className={styles.amountItem}>
              <span className={styles.infoLabel}>Premium Fee</span>
              <span className={styles.amountVal} style={{color:'var(--muted)'}}>−{fmt(r.premiumFee)}</span>
            </div>
            <div className={`${styles.amountItem} ${styles.amountTotal}`}>
              <span className={styles.infoLabel}>Check Amount</span>
              <span className={styles.amountVal}>{fmt(r.checkAmount)}</span>
            </div>
          </div>
          <div className={styles.checkNo}>Check # <strong>{r.checkNo}</strong></div>

          <div className={styles.modalSection}>QuickBooks</div>
          <div className={styles.qbRow}>
            <span className={`${styles.qbBadge} ${r.quickbookStatus==='paid'?styles.qbPaid:r.quickbookStatus==='bill_created'?styles.qbBill:styles.qbNone}`}>
              {QB_LABELS[r.quickbookStatus]}
            </span>
            {r.quickbookStatus !== 'paid' && (
              <button className={styles.qbBtn} onClick={() => onQbCreate(r.id)}>
                {QB_NEXT[r.quickbookStatus]}
              </button>
            )}
          </div>

          <div className={styles.modalSection}>Status Flags</div>
          <div className={styles.flagList}>
            {FLAGS.map(f => (
              <div key={f.key} className={styles.flagRow}>
                <div>
                  <div className={styles.flagLabel}>{f.label}</div>
                  <div className={styles.flagDesc}>{f.desc}</div>
                </div>
                <button
                  className={`${styles.flagToggle} ${r[f.key]?styles.flagToggleOn:''}`}
                  onClick={() => onToggle(r.id, f.key)}
                >
                  {r[f.key] ? '✓  On' : '–  Off'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalFooter}>
          {r.customer && !r.emailSent && (
            <button className={styles.noticeBtn} style={{marginRight:'auto'}}
              onClick={() => { onEmailSingle(r); onClose() }}>
              ✉ Send COD Notice
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
