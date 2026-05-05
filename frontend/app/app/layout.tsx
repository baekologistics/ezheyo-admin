import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EZHEYO Admin',
  description: 'EZHEYO Internal Admin Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
