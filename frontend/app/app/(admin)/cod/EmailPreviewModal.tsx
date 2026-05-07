'use client'
import { useMemo } from 'react'
import styles from './cod.module.css'
import type { CodRecord } from './page'

const fmt = (n: number) => `$${n.toFixed(2)}`

type Props = {
  records: CodRecord[]
  onSend: (targets: CodRecord[]) => void
  onClose: () => void
}

export default function EmailPreviewModal({ records, onSend, onClose }: Props) {
  // Group by customer
  const grouped = useMemo(() => {
    const map: Record<string, CodRecord[]> = {}
    records.filter(r => r.customer).forEach(r => {
      if (!map[r.customer]) map[r.customer] = []
      map[r.customer].push(r)
    })
    return map
  }, [records])

  const skipped = records.filter(r => !r.customer).length

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>✉ Email Notice Preview</div>
            <div className={styles.modalSub}>
              {Object.keys(grouped).length} customer(s) · {records.filter(r=>r.customer).length} records
              {skipped > 0 && <span style={{color:'#EF4444'}}> · {skipped} unmatched skipped</span>}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {Object.entries(grouped).map(([customer, rows]) => {
            const total = rows.reduce((a, r) => a + r.checkAmount, 0)
            const email = rows[0].customerEmail
            return (
              <div key={customer} className={styles.emailPreview}>
                <div className={styles.emailHeader}>
                  <div>
                    <span className={styles.emailTo}>To: {email}</span>
                    <span className={styles.emailCustomer}>{customer}</span>
                  </div>
                  <span className={styles.emailTotal}>{fmt(total)}</span>
                </div>

                {/* Email body preview */}
                <div className={styles.emailBody}>
                  <p>Dear <strong>{customer}</strong>,</p>
                  <br/>
                  <p>We have received the following C.O.D. payment(s) from UPS Capital on your behalf. Please review the details below:</p>
                  <br/>
                  <table className={styles.emailTable}>
                    <thead>
                      <tr>
                        <th>Statement Date</th>
                        <th>Tracking Number</th>
                        <th>Pickup Date</th>
                        <th>COD Amount</th>
                        <th>Fees</th>
                        <th>Check Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id}>
                          <td>{r.statementDate}</td>
                          <td style={{fontFamily:'monospace',fontSize:'11px'}}>{r.trackingNo}</td>
                          <td>{r.pickupDate}</td>
                          <td>{fmt(r.codAmount)}</td>
                          <td style={{color:'#6B7280'}}>{fmt(r.serviceFee + r.premiumFee)}</td>
                          <td><strong>{fmt(r.checkAmount)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{textAlign:'right',fontWeight:600,paddingTop:8}}>Total Payable:</td>
                        <td style={{fontWeight:700,color:'#059669'}}>{fmt(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <br/>
                  <p>Payment will be processed within the week. Please contact us if you have any questions.</p>
                  <br/>
                  <p>Best regards,<br/><strong>EZHEYO INC</strong></p>
                </div>
              </div>
            )
          })}

          {skipped > 0 && (
            <div className={styles.skipNote}>
              ⚠ {skipped} record(s) with no matched customer were skipped and will not receive an email.
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.sendBtn}
            onClick={() => onSend(records.filter(r => r.customer))}
          >
            ✉ Confirm & Mark as Sent ({Object.keys(grouped).length})
          </button>
        </div>
      </div>
    </div>
  )
}
