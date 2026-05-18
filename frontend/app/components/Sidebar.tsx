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
  ScrollText,
} from 'lucide-react'
import styles from './Sidebar.module.css'

type NavItem = {
  href:      string
  label:     string
  icon:      React.ReactNode
  minRole?:  'owner2' | 'owner1'   // undefined = all roles can see
}

type NavGroup = {
  section: string
  items:   NavItem[]
}

type Role = 'owner1' | 'owner2' | 'staff'

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
      { href: '/settlement', label: 'Settlement', icon: <ClipboardList {...ICON_SIZE} />, minRole: 'owner2' },
      { href: '/reports',    label: 'Reports',    icon: <BarChart2     {...ICON_SIZE} />, minRole: 'owner2' },
      { href: '/settings',   label: 'Settings',   icon: <Settings      {...ICON_SIZE} />, minRole: 'owner2' },
      { href: '/logs',       label: 'Activity Log', icon: <ScrollText  {...ICON_SIZE} />, minRole: 'owner1' },
    ],
  },
]

function canSee(role: Role, minRole?: 'owner2' | 'owner1'): boolean {
  if (!minRole) return true
  if (minRole === 'owner2') return role === 'owner1' || role === 'owner2'
  if (minRole === 'owner1') return role === 'owner1'
  return false
}

interface SidebarProps {
  role: Role
}

export default function Sidebar({ role }: SidebarProps) {
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
        {NAV.map(group => {
          const visibleItems = group.items.filter(item => canSee(role, item.minRole))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.section} className={styles.group}>
              <div className={styles.section}>{group.section}</div>
              {visibleItems.map(item => (
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
          )
        })}
      </nav>
    </aside>
  )
}
