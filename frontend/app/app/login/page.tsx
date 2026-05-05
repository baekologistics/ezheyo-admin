'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요.')
      return
    }
    setLoading(true)
    setError('')
    // TODO: replace with real auth (NextAuth / Azure AD)
    setTimeout(() => {
      router.push('/dashboard')
    }, 1000)
  }

  return (
    <div className={styles.page}>
      {/* LEFT: Brand panel */}
      <div className={styles.left}>
        <div className={styles.leftLogo}>
          <Image src="/logo.png" alt="EZHEYO" width={160} height={48} style={{ objectFit: 'contain' }} />
          <div className={styles.logoSub}>Admin Portal</div>
        </div>
        <div className={styles.leftContent}>
          <h1 className={styles.headline}>
            Shipping<br />operations,<br /><span>simplified.</span>
          </h1>
          <p className={styles.desc}>EZHEYO 내부 관리 시스템.<br />고객 관리부터 정산까지 한 곳에서.</p>
        </div>
        <div className={styles.leftFooter}>
          &copy; 2026 EZHEYO INC &nbsp;·&nbsp; Internal use only
        </div>
      </div>

      {/* RIGHT: Login form */}
      <div className={styles.right}>
        <form className={styles.loginBox} onSubmit={handleLogin}>
          <h2 className={styles.title}>Sign in</h2>
          <p className={styles.sub}>EZHEYO 어드민 계정으로 로그인하세요.</p>

          <div className={styles.field}>
            <label>이메일</label>
            <input
              type="email"
              placeholder="your@ezheyo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldRow}>
              <label>비밀번호</label>
              <a href="#" className={styles.forgot}>Forgot password?</a>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnLogin} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in to Admin'}
          </button>

          <div className={styles.infoCard}>
            <span className={styles.infoIcon}>ℹ</span>
            <div className={styles.infoText}>
              <strong>EZHEYO 임직원 전용</strong>
              계정이 없거나 문제가 있으면 관리자에게 문의하세요.
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
