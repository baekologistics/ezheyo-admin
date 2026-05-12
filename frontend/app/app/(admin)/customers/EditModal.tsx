'use client'
import { useState } from 'react'
import styles from './customers.module.css'
import type { Customer, SalesPerson, SalesAssignment } from './types'

type AssignRow = {
  sales_person_id: string
  name: string
  ratio: number
}

type Props = {
  customer: Customer
  salesPersons: SalesPerson[]
  onSave: (
    id: string,
    assignments: Array<{ sales_person_id: string; ratio: number }>,
    memo: string
  ) => void
  onClose: () => void
}

export default function EditModal({ customer, salesPersons, onSave, onClose }: Props) {
  const [memo, setMemo] = useState(customer.memo)

  // Initialise from existing assignments
  const [rows, setRows] = useState<AssignRow[]>(() =>
    customer.assignments.map((a: SalesAssignment) => ({
      sales_person_id: a.id,
      name:            a.name,
      ratio:           a.ratio,
    }))
  )

  const total = rows.reduce((s, r) => s + r.ratio, 0)
  const sumOk  = rows.length === 0 || total === 100

  // IDs already assigned
  const assignedIds = new Set(rows.map(r => r.sales_person_id))
  const available   = salesPersons.filter(sp => !assignedIds.has(sp.id))

  const addRow = () => {
    if (available.length === 0) return
    const sp = available[0]
    const defaultRatio = Math.max(0, 100 - total)
    setRows(prev => [...prev, { sales_person_id: sp.id, name: sp.name, ratio: defaultRatio }])
  }

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const changePerson = (idx: number, spId: string) => {
    const sp = salesPersons.find(s => s.id === spId)
    if (!sp) return
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, sales_person_id: spId, name: sp.name } : r))
  }

  const changeRatio = (idx: number, val: string) => {
    const n = Math.min(100, Math.max(0, parseInt(val) || 0))
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ratio: n } : r))
  }

  const handleSave = () => {
    if (!sumOk) return
    onSave(
      customer.id,
      rows.map(r => ({ sales_person_id: r.sales_person_id, ratio: r.ratio })),
      memo
    )
  }

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
              <span className={styles.readonlyVal} style={{ fontSize: 11 }}>{customer.id}</span>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Sales Person assignments */}
          <label className={styles.fieldLabel}>Sales Person Assignment</label>
          <p className={styles.fieldHint} style={{ marginBottom: 10 }}>
            10% of profit is allocated to assigned sales persons. Ratios must sum to 100%.
          </p>

          {rows.length > 0 && (
            <div className={styles.assignTable}>
              {rows.map((row, idx) => {
                // Options: current selection + unassigned ones
                const opts = salesPersons.filter(sp => sp.id === row.sales_person_id || !assignedIds.has(sp.id))
                return (
                  <div key={idx} className={styles.assignRow}>
                    <select
                      className={styles.assignSelect}
                      value={row.sales_person_id}
                      onChange={e => changePerson(idx, e.target.value)}
                    >
                      {opts.map(sp => (
                        <option key={sp.id} value={sp.id}>{sp.name}</option>
                      ))}
                    </select>
                    <div className={styles.assignRatioWrap}>
                      <input
                        type="number"
                        className={styles.assignRatioInput}
                        min={1} max={100}
                        value={row.ratio}
                        onChange={e => changeRatio(idx, e.target.value)}
                      />
                      <span className={styles.assignPct}>%</span>
                    </div>
                    <button className={styles.assignRemove} onClick={() => removeRow(idx)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}

          <div className={styles.assignFooter}>
            {available.length > 0 && (
              <button className={styles.assignAddBtn} onClick={addRow}>+ Add Person</button>
            )}
            <span className={`${styles.assignTotal} ${!sumOk ? styles.assignTotalErr : ''}`}>
              {rows.length > 0 ? `Total: ${total}%${sumOk ? ' ✓' : ` (need 100%)`}` : 'Unassigned'}
            </span>
          </div>

          <div className={styles.divider} />

          {/* Memo */}
          <label className={styles.fieldLabel}>Internal Memo</label>
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
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!sumOk}
            style={!sumOk ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
