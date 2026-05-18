'use client'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import styles from './TopBar.module.css'
import { authFetch } from '@/lib/auth'
import type { AuthUser } from '@/lib/auth'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/labels':    'Shipments History',
  '/cod':       'COD Records',
  '/claims':    'Claims',
  '/requests':  'Customer Requests',
  '/settlement':'Settlement',
  '/reports':   'Reports',
  '/settings':  'Settings',
  '/logs':      'Activity Log',
}

const ROLE_BADGE: Record<string, string> = {
  owner1: 'Owner',
  owner2: 'Owner',
  staff:  'Staff',
}

interface TopBarProps {
  user?:     AuthUser | null
  onLogout?: () => void
}

export default function TopBar({ user, onLogout }: TopBarProps) {
  const pathname = usePathname()
  const title    = TITLES[pathname] ?? 'Admin'

  // ── Dropdown ───────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Change Password modal ──────────────────────────────────────────
  const [pwModal,   setPwModal]   = useState(false)
  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' })
  const [pwSaving,  setPwSaving]  = useState(false)
  const [pwError,   setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  const openPwModal = () => {
    setMenuOpen(false)
    setPwForm({ current: '', next: '', confirm: '' })
    setPwError('')
    setPwSuccess(false)
    setPwModal(true)
  }

  const handleChangePw = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwError('All fields are required.')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    if (pwForm.next.length < 8) {
      setPwError('New password must be at least 8 characters.')
      return
    }
    setPwSaving(true)
    setPwError('')
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body:   JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setPwError(d.error ?? 'Failed to change password.')
        return
      }
      setPwSuccess(true)
      setTimeout(() => setPwModal(false), 1500)
    } catch {
      setPwError('Network error. Please try again.')
    } finally {
      setPwSaving(false)
    }
  }

  // Avatar: first letter of displayName
  const initial = user?.displayName?.charAt(0).toUpperCase() ?? '?'

  return (
    <>
      <header className={styles.topbar}>
        <span className={styles.title}>{title}</span>

        <div className={styles.right}>
          {user && (
            <>
              <span className={styles.roleBadge}>
                {ROLE_BADGE[user.role] ?? user.role}
              </span>

              {/* ── User menu trigger ─────────────────────────── */}
              <div className={styles.menuWrap} ref={menuRef}>
                <button
                  className={`${styles.userBtn} ${menuOpen ? styles.userBtnOpen : ''}`}
                  onClick={() => setMenuOpen(v => !v)}
                >
                  <span className={styles.avatar}>{initial}</span>
                  <span className={styles.displayName}>{user.displayName}</span>
                  <svg
                    className={`${styles.chevron} ${menuOpen ? styles.chevronUp : ''}`}
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                  >
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* ── Dropdown ──────────────────────────────────── */}
                {menuOpen && (
                  <div className={styles.dropdown}>
                    <button className={styles.dropItem} onClick={openPwModal}>
                      <span className={styles.dropIcon}>🔑</span>
                      Change Password
                    </button>
                    <div className={styles.dropDivider} />
                    <button
                      className={`${styles.dropItem} ${styles.dropItemDanger}`}
                      onClick={() => { setMenuOpen(false); onLogout?.() }}
                    >
                      <span className={styles.dropIcon}>🚪</span>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Change Password Modal ────────────────────────────────────── */}
      {pwModal && (
        <div className={styles.overlay} onClick={() => setPwModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Change Password</span>
              <button className={styles.closeBtn} onClick={() => setPwModal(false)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {pwSuccess ? (
                <div className={styles.successMsg}>✅ Password changed successfully!</div>
              ) : (
                <>
                  <label className={styles.fieldLabel}>Current Password</label>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Enter current password"
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                  />
                  <label className={styles.fieldLabel} style={{ marginTop: 14 }}>New Password</label>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="At least 8 characters"
                    value={pwForm.next}
                    onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                  />
                  <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Confirm New Password</label>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Re-enter new password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  />
                  {pwError && <div className={styles.errorMsg}>{pwError}</div>}
                </>
              )}
            </div>

            {!pwSuccess && (
              <div className={styles.modalFooter}>
                <button className={styles.cancelBtn} onClick={() => setPwModal(false)}>Cancel</button>
                <button
                  className={styles.saveBtn}
                  onClick={handleChangePw}
                  disabled={pwSaving}
                >
                  {pwSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
