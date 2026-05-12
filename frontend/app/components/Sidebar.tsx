'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.css'

const NAV = [
  {
    section: 'Main',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
      { href: '/customers', label: 'Customers', icon: '👤' },
      { href: '/labels', label: 'Shipments History', icon: '📦' },
      { href: '/cod', label: 'COD Records', icon: '💳' },
      { href: '/claims', label: 'Claims', icon: '📝' },
    ]
  },
  {
    section: 'Finance',
    items: [
      { href: '/settlement', label: 'Settlement', icon: '📋' },
      { href: '/reports',    label: 'Reports',    icon: '📈' },
      { href: '/settings',   label: 'Settings',   icon: '⚙️' },
    ]
  }
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Image src="/logo.png" alt="EZHEYO" width={120} height={36} style={{ objectFit: 'contain' }} />
        <span className={styles.logoSub}>Admin</span>
      </div>

      <nav className={styles.nav}>
        {NAV.map(group => (
          <div key={group.section}>
            <div className={styles.section}>{group.section}</div>
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.item} ${pathname === item.href ? styles.active : ''}`}
              >
                <span className={styles.icon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
