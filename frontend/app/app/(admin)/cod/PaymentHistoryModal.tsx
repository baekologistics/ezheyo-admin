'use client'
import styles from './cod.module.css'
import type { PaymentBatch } from './page'

const fmt = (n: number) => `$${n.toFixed(2)}`

type Props = {
  batches: PaymentBatch[]
  onClose: () => void
}

export default function PaymentHistoryModal({ batches, onClose }: Props) {
  const total = batches.filter(b=>b.status==='paid').reduce((a,b)=>a+b.totalAmount, 0)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>💰 Payment History</div>
            <div className={styles.modalSub}>{batches.length} batch(es) · {fmt(total)} total paid</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {batches.length === 0 && (
            <div className={styles.empty}>No payment batches yet. Mark records as Paid to create entries.</div>
          )}

          {batches.map(b => (
            <div key={b.id} className={styles.batchCard}>
              <div className={styles.batchHeader}>
                <div>
                  <div className={styles.batchCustomer}>{b.customer}</div>
                  <div className={styles.batchDate}>Batch Date: {b.batchDate}</div>
                </div>
                <div className={styles.batchRight}>
                  <span className={styles.batchAmount}>{fmt(b.totalAmount)}</span>
                  <span className={`${styles.batchStatus} ${b.status==='paid'?styles.batchPaid:styles.batchPending}`}>
                    {b.status === 'paid' ? '✓ Paid' : 'Pending'}
                  </span>
                </div>
              </div>

              <div className={styles.batchTracking}>
                <span className={styles.batchTrackLabel}>Tracking numbers:</span>
                {b.trackingNos.map(t => (
                  <span key={t} className={styles.trackPill}>{t}</span>
                ))}
              </div>

              {b.paidDate && (
                <div className={styles.batchMeta}>Paid on {b.paidDate}{b.memo ? ` · ${b.memo}` : ''}</div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
