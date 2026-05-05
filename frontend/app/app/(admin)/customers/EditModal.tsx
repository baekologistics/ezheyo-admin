'use client'
import { useState } from 'react'
import styles from './customers.module.css'
import type { Customer } from './page'

type Props = {
  customer: Customer
  salesPersons: string[]
  onSave: (id: string, salesPerson: string, memo: string) => void
  onClose: () => void
}

export default function EditModal({ customer, salesPersons, onSave, onClose }: Props) {
  const [salesPerson, setSalesPerson] = useState(customer.salesPerson)
  const [memo, setMemo]               = useState(customer.memo)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Edit Customer</div>
            <div className={styles.modalSub}>{customer.name} · {customer.email}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Read-only info */}
          <div className={styles.readonlyGrid}>
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyLabel}>Margin Rate</span>
              <span className={styles.readonlyVal}>{customer.marginRate}</span>
            </div>
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyLabel}>Payment Type</span>
              <span className={styles.readonlyVal}>{customer.paymentType}</span>
            </div>
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyLabel}>Status</span>
              <span className={styles.readonlyVal}>{customer.status}</span>
            </div>
            <div className={styles.readonlyItem}>
              <span className={styles.readonlyLabel}>Customer ID</span>
              <span className={styles.readonlyVal}>{customer.id}</span>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Editable: Sales Person */}
          <label className={styles.fieldLabel}>Sales Person</label>
          <select
            className={styles.modalSelect}
            value={salesPerson}
            onChange={e => setSalesPerson(e.target.value)}
          >
            <option value="">— Unassigned</option>
            {salesPersons.map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </select>
          <p className={styles.fieldHint}>10% of profit will be allocated to this person in Settlement.</p>

          {/* Editable: Memo */}
          <label className={styles.fieldLabel} style={{ marginTop: 16 }}>Internal Memo</label>
          <textarea
            className={styles.modalTextarea}
            placeholder="Internal notes (not visible to customer)…"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={3}
          />
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={() => onSave(customer.id, salesPerson, memo)}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
