'use client'
import { usePathname } from 'next/navigation'
import styles from './TopBar.module.css'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/labels': 'Shipments History',
  '/cod': 'COD Records',
  '/claims': 'Claims',
  '/settlement': 'Settlement',
  '/reports': 'Reports',
}

export default function TopBar() {
  const pathname = usePathname()
  const title = TITLES[pathname] ?? 'Admin'

  return (
    <header className={styles.topbar}>
      <span className={styles.title}>{title}</span>
      <div className={styles.right}>
        <span className={styles.user}>EZHEYO Admin</span>
      </div>
    </header>
  )
}
