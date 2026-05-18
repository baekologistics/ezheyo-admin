'use client'
import { usePathname } from 'next/navigation'
import styles from './TopBar.module.css'
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
  user?:      AuthUser | null
  onLogout?:  () => void
}

export default function TopBar({ user, onLogout }: TopBarProps) {
  const pathname = usePathname()
  const title    = TITLES[pathname] ?? 'Admin'

  return (
    <header className={styles.topbar}>
      <span className={styles.title}>{title}</span>
      <div className={styles.right}>
        {user && (
          <>
            <div className={styles.userInfo}>
              <span className={styles.displayName}>{user.displayName}</span>
              <span className={styles.roleBadge}>{ROLE_BADGE[user.role] ?? user.role}</span>
            </div>
            <button className={styles.logoutBtn} onClick={onLogout} title="Sign out">
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  )
}
