'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  AlertCircle,
  Inbox,
  ClipboardList,
  BarChart2,
  Settings,
} from 'lucide-react'
import styles from './Sidebar.module.css'

type NavItem = {
  href:  string
  label: string
  icon:  React.ReactNode
}

type NavGroup = {
  section: string
  items:   NavItem[]
}

const ICON_SIZE = { width: 16, height: 16 }

const NAV: NavGroup[] = [
  {
    section: 'Main',
    items: [
      { href: '/dashboard', label: 'Dashboard',         icon: <LayoutDashboard {...ICON_SIZE} /> },
      { href: '/customers', label: 'Customers',         icon: <Users           {...ICON_SIZE} /> },
      { href: '/labels',    label: 'Shipments History', icon: <Package         {...ICON_SIZE} /> },
      { href: '/cod',       label: 'COD Records',       icon: <FileText        {...ICON_SIZE} /> },
      { href: '/claims',    label: 'Claims',            icon: <AlertCircle     {...ICON_SIZE} /> },
      { href: '/requests',  label: 'Customer Requests', icon: <Inbox           {...ICON_SIZE} /> },
    ],
  },
  {
    section: 'Finance',
    items: [
      { href: '/settlement', label: 'Settlement', icon: <ClipboardList {...ICON_SIZE} /> },
      { href: '/reports',    label: 'Reports',    icon: <BarChart2     {...ICON_SIZE} /> },
      { href: '/settings',   label: 'Settings',   icon: <Settings      {...ICON_SIZE} /> },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoAdmin}>ADMIN</span>
        <Image
          src="/logo.png"
          alt="EZHEYO"
          width={110}
          height={32}
          style={{ objectFit: 'contain' }}
        />
      </div>

      <nav className={styles.nav}>
        {NAV.map(group => (
          <div key={group.section} className={styles.group}>
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
