'use client'
import { useEffect, useState, useCallback } from 'react'
import styles from './settings.module.css'
import { authFetch, getUser } from '@/lib/auth'

// ── Types ─────────────────────────────────────────────────────────
type SalesPerson = {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
}

type AdminUser = {
  id:                  string
  username:            string
  display_name:        string
  role:                'owner1' | 'owner2' | 'staff'
  must_change_password: boolean
  last_login:          string | null
  created_at:          string
}

type Role = 'owner1' | 'owner2' | 'staff'

// ── Helpers ───────────────────────────────────────────────────────
const ROLE_LABELS: Record<Role, string> = {
  owner1: 'Owner 1',
  owner2: 'Owner 2',
  staff:  'Staff',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Role badge ────────────────────────────────────────────────────
function RoleBadge({ role }: { role: Role }) {
  const cls =
    role === 'owner1' ? styles.roleOwner1 :
    role === 'owner2' ? styles.roleOwner2 :
    styles.roleStaff
  return <span className={`${styles.roleBadge} ${cls}`}>{ROLE_LABELS[role]}</span>
}

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ msg, onHide }: { msg: string; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 3000)
    return () => clearTimeout(t)
  }, [onHide])
  return <div className={styles.toast}>{msg}</div>
}

// ── Main page ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const currentUser = getUser()
  const isOwner1    = currentUser?.role === 'owner1'

  // ── Sales Persons state ────────────────────────────────────────
  const [persons,    setPersons]    = useState<SalesPerson[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [editTarget, setEditTarget] = useState<SalesPerson | null>(null)
  const [form,       setForm]       = useState({ name: '', email: '', phone: '' })
  const [saving,     setSaving]     = useState(false)

  // ── User Management state ──────────────────────────────────────
  const [users,       setUsers]       = useState<AdminUser[]>([])
  const [usersLoading,setUsersLoading]= useState(false)
  const [roleChanging,setRoleChanging]= useState<string | null>(null)  // userId
  const [resetting,   setResetting]   = useState<string | null>(null)  // userId
  const [toast,       setToast]       = useState('')
  const [confirmReset,setConfirmReset]= useState<AdminUser | null>(null)

  const showToast = (msg: string) => setToast(msg)

  // ── Load sales persons ─────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    authFetch('/api/settings/sales-persons')
      .then(r => r.json() as Promise<SalesPerson[]>)
      .then(data => { setPersons(data); setLoading(false) })
      .catch(err => { setError((err as Error).message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // ── Load admin users ───────────────────────────────────────────
  const loadUsers = useCallback(() => {
    if (!isOwner1) return
    setUsersLoading(true)
    authFetch('/api/auth/users')
      .then(r => r.json() as Promise<AdminUser[]>)
      .then(data => { setUsers(data); setUsersLoading(false) })
      .catch(() => setUsersLoading(false))
  }, [isOwner1])

  useEffect(() => { loadUsers() }, [loadUsers])

  // ── Sales Persons handlers ─────────────────────────────────────
  const openAdd  = () => { setForm({ name: '', email: '', phone: '' }); setEditTarget(null); setShowForm(true) }
  const openEdit = (sp: SalesPerson) => { setForm({ name: sp.name, email: sp.email || '', phone: sp.phone || '' }); setEditTarget(sp); setShowForm(true) }
  const cancelForm = () => { setShowForm(false); setEditTarget(null) }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editTarget) {
        await authFetch(`/api/settings/sales-persons/${editTarget.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await authFetch('/api/settings/sales-persons', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowForm(false); setEditTarget(null); load()
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const handleDeactivate = async (sp: SalesPerson) => {
    if (!confirm(`Deactivate ${sp.name}? They will no longer appear in new assignments.`)) return
    await authFetch(`/api/settings/sales-persons/${sp.id}`, { method: 'DELETE' })
    load()
  }

  const handleReactivate = async (sp: SalesPerson) => {
    await authFetch(`/api/settings/sales-persons/${sp.id}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) })
    load()
  }

  // ── User Management handlers ───────────────────────────────────
  const handleRoleChange = async (user: AdminUser, newRole: Role) => {
    if (newRole === user.role) return
    setRoleChanging(user.id)
    try {
      const res  = await authFetch(`/api/auth/users/${user.id}/role`, {
        method: 'PATCH',
        body:   JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        showToast(d.error ?? 'Failed to update role')
        return
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
      showToast(`${user.display_name} role → ${ROLE_LABELS[newRole]}`)
    } catch {
      showToast('Failed to update role')
    } finally {
      setRoleChanging(null)
    }
  }

  const handleResetPassword = async (user: AdminUser) => {
    setConfirmReset(null)
    setResetting(user.id)
    try {
      const res = await authFetch(`/api/auth/users/${user.id}/reset-password`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        showToast(d.error ?? 'Failed to reset password')
        return
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, must_change_password: true } : u))
      showToast(`${user.display_name} password reset to Ezheyo2023!`)
    } catch {
      showToast('Failed to reset password')
    } finally {
      setResetting(null)
    }
  }

  const active   = persons.filter(p => p.is_active)
  const inactive = persons.filter(p => !p.is_active)

  return (
    <div className={styles.page}>

      {/* ── User Management (owner1 only) ──────────────────────── */}
      {isOwner1 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>User Management</div>
              <div className={styles.cardSub}>
                Manage admin accounts, roles, and passwords. Only visible to Owner 1.
              </div>
            </div>
          </div>

          {usersLoading ? (
            <div className={styles.loadingRow}>Loading…</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf      = u.id === currentUser?.username   // compare by username since JWT has username
                  const isSelfById  = users.find(x => x.username === currentUser?.username)?.id === u.id
                  const isChanging  = roleChanging === u.id
                  const isResetting = resetting    === u.id

                  return (
                    <tr key={u.id}>
                      {/* Username */}
                      <td>
                        <span className={styles.mono}>{u.username}</span>
                        {isSelfById && (
                          <span className={styles.youBadge}>you</span>
                        )}
                      </td>

                      {/* Display Name */}
                      <td><strong>{u.display_name}</strong></td>

                      {/* Role */}
                      <td>
                        {isSelfById ? (
                          // Can't change own role
                          <RoleBadge role={u.role} />
                        ) : (
                          <div className={styles.roleSelectWrap}>
                            <select
                              className={styles.roleSelect}
                              value={u.role}
                              disabled={isChanging}
                              onChange={e => handleRoleChange(u, e.target.value as Role)}
                            >
                              <option value="owner1">Owner 1</option>
                              <option value="owner2">Owner 2</option>
                              <option value="staff">Staff</option>
                            </select>
                            {isChanging && <span className={styles.savingDot}>…</span>}
                          </div>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className={styles.muted}>{fmtDate(u.last_login)}</td>

                      {/* Password reset */}
                      <td>
                        <div className={styles.pwCell}>
                          {u.must_change_password && (
                            <span className={styles.mustChange}>Must change</span>
                          )}
                          <button
                            className={styles.resetBtn}
                            disabled={isResetting}
                            onClick={() => setConfirmReset(u)}
                          >
                            {isResetting ? '…' : 'Reset'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Sales Persons ──────────────────────────────────────── */}
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
                      <button className={styles.editBtn}       onClick={() => openEdit(sp)}>Edit</button>
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

      {/* ── Password Reset Confirm Modal ───────────────────────── */}
      {confirmReset && (
        <div className={styles.overlay} onClick={() => setConfirmReset(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Reset Password</div>
              <button className={styles.closeBtn} onClick={() => setConfirmReset(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Reset <strong>{confirmReset.display_name}</strong> ({confirmReset.username})
                password to <code className={styles.codePw}>Ezheyo2023!</code>?
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                The user will be required to change their password on next login.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setConfirmReset(null)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={() => handleResetPassword(confirmReset)}>
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sales Person Add/Edit Modal ────────────────────────── */}
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
              <input className={styles.input} placeholder="Full name"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Email</label>
              <input className={styles.input} placeholder="email@example.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Phone</label>
              <input className={styles.input} placeholder="(optional)"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={cancelForm}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSubmit}
                disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Person'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────── */}
      {toast && <Toast msg={toast} onHide={() => setToast('')} />}

    </div>
  )
}
