'use client'
import { useEffect, useState } from 'react'
import styles from './settings.module.css'
import { authFetch } from '@/lib/auth'

type SalesPerson = {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
}

export default function SettingsPage() {
  const [persons,    setPersons]    = useState<SalesPerson[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [editTarget, setEditTarget] = useState<SalesPerson | null>(null)

  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    authFetch('/api/settings/sales-persons')
      .then(r => r.json() as Promise<SalesPerson[]>)
      .then(data => { setPersons(data); setLoading(false) })
      .catch(err => { setError((err as Error).message); setLoading(false) })
  }

  useEffect(load, [])

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '' })
    setEditTarget(null)
    setShowForm(true)
  }

  const openEdit = (sp: SalesPerson) => {
    setForm({ name: sp.name, email: sp.email || '', phone: sp.phone || '' })
    setEditTarget(sp)
    setShowForm(true)
  }

  const cancelForm = () => { setShowForm(false); setEditTarget(null) }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editTarget) {
        await authFetch(`/api/settings/sales-persons/${editTarget.id}`, {
          method: 'PUT',
          body:   JSON.stringify(form),
        })
      } else {
        await authFetch('/api/settings/sales-persons', {
          method: 'POST',
          body:   JSON.stringify(form),
        })
      }
      setShowForm(false)
      setEditTarget(null)
      load()
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const handleDeactivate = async (sp: SalesPerson) => {
    if (!confirm(`Deactivate ${sp.name}? They will no longer appear in new assignments.`)) return
    await authFetch(`/api/settings/sales-persons/${sp.id}`, { method: 'DELETE' })
    load()
  }

  const handleReactivate = async (sp: SalesPerson) => {
    await authFetch(`/api/settings/sales-persons/${sp.id}`, {
      method: 'PUT',
      body:   JSON.stringify({ is_active: true }),
    })
    load()
  }

  const active   = persons.filter(p => p.is_active)
  const inactive = persons.filter(p => !p.is_active)

  return (
    <div className={styles.page}>
      {/* Sales Persons */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Sales Persons</div>
            <div className={styles.cardSub}>
              Manage who can be assigned to customers. 10% of profit goes to assigned sales persons in Settlement.
            </div>
          </div>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Person</button>
        </div>

        {error && <div className={styles.errorBox}>⚠ {error}</div>}

        {loading ? (
          <div className={styles.loadingRow}>Loading…</div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.length === 0 && (
                  <tr><td colSpan={5} className={styles.empty}>No active sales persons.</td></tr>
                )}
                {active.map(sp => (
                  <tr key={sp.id}>
                    <td><strong>{sp.name}</strong></td>
                    <td className={styles.muted}>{sp.email || '—'}</td>
                    <td className={styles.muted}>{sp.phone || '—'}</td>
                    <td><span className={styles.pillActive}>Active</span></td>
                    <td className={styles.actions}>
                      <button className={styles.editBtn} onClick={() => openEdit(sp)}>Edit</button>
                      <button className={styles.deactivateBtn} onClick={() => handleDeactivate(sp)}>Deactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {inactive.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Inactive</div>
                <table className={styles.table}>
                  <tbody>
                    {inactive.map(sp => (
                      <tr key={sp.id} className={styles.inactiveRow}>
                        <td><span className={styles.inactiveName}>{sp.name}</span></td>
                        <td className={styles.muted}>{sp.email || '—'}</td>
                        <td className={styles.muted}>{sp.phone || '—'}</td>
                        <td><span className={styles.pillInactive}>Inactive</span></td>
                        <td className={styles.actions}>
                          <button className={styles.reactivateBtn} onClick={() => handleReactivate(sp)}>Reactivate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className={styles.overlay} onClick={cancelForm}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {editTarget ? 'Edit Sales Person' : 'Add Sales Person'}
              </div>
              <button className={styles.closeBtn} onClick={cancelForm}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.fieldLabel}>Name <span className={styles.required}>*</span></label>
              <input
                className={styles.input}
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Email</label>
              <input
                className={styles.input}
                placeholder="email@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
              <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Phone</label>
              <input
                className={styles.input}
                placeholder="(optional)"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={cancelForm}>Cancel</button>
              <button
                className={styles.saveBtn}
                onClick={handleSubmit}
                disabled={saving || !form.name.trim()}
              >
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Person'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
