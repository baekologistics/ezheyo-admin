'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar  from '@/components/TopBar'
import styles  from './admin.module.css'
import { getToken, getUser, setUser, removeToken, authFetch, type AuthUser } from '@/lib/auth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const [user,  setUserState]  = useState<AuthUser | null>(null)
  const [ready, setReady]      = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) { router.replace('/login'); return }

    // Try cached user first so layout renders immediately
    const cached = getUser()
    if (cached) { setUserState(cached); setReady(true) }

    // Always re-validate with server
    authFetch('/api/auth/me')
      .then(r => {
        if (!r.ok) throw new Error('unauthorized')
        return r.json() as Promise<AuthUser>
      })
      .then(u => { setUser(u); setUserState(u); setReady(true) })
      .catch(() => { removeToken(); router.replace('/login') })
  }, [router])

  const handleLogout = async () => {
    try { await authFetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    removeToken()
    router.replace('/login')
  }

  if (!ready) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', color:'var(--muted)', fontSize:14 }}>
        Loading…
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <Sidebar role={user?.role ?? 'staff'} />
      <div className={styles.main}>
        <TopBar user={user} onLogout={handleLogout} />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
