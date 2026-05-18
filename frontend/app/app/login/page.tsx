'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import styles from './login.module.css'
import { setToken, setUser, authFetch } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

type LoginResponse = {
  token: string
  user: {
    username:           string
    displayName:        string
    role:               'owner1' | 'owner2' | 'staff'
    mustChangePassword: boolean
  }
}

// ── Main page (login + optional change-password) ──────────────────
export default function LoginPage() {
  const router = useRouter()

  // login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // change-password state
  const [mode,       setMode]       = useState<'login' | 'changePassword'>('login')
  const [pendingToken, setPendingToken] = useState('')
  const [pendingUser,  setPendingUser]  = useState<LoginResponse['user'] | null>(null)
  const [curPw,  setCurPw]  = useState('')
  const [newPw,  setNewPw]  = useState('')
  const [newPw2, setNewPw2] = useState('')

  // ── Handle login ───────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) { setError('아이디와 비밀번호를 입력하세요.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json() as LoginResponse & { error?: string }
      if (!res.ok) { setError(data.error ?? '로그인에 실패했습니다.'); return }

      if (data.user.mustChangePassword) {
        // Save token temporarily and show change-password screen
        setPendingToken(data.token)
        setPendingUser(data.user)
        setMode('changePassword')
        setCurPw(password)
      } else {
        setToken(data.token)
        setUser(data.user)
        router.push('/dashboard')
      }
    } catch {
      setError('서버에 연결할 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ── Handle change password ─────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPw || !newPw2) { setError('새 비밀번호를 입력하세요.'); return }
    if (newPw !== newPw2)  { setError('새 비밀번호가 일치하지 않습니다.'); return }
    if (newPw.length < 8)  { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
        body:    JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? '비밀번호 변경에 실패했습니다.'); return }

      // Success: store token and user, then go to dashboard
      if (pendingUser) {
        setToken(pendingToken)
        setUser({ ...pendingUser, mustChangePassword: false })
      }
      router.push('/dashboard')
    } catch {
      setError('서버에 연결할 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render: Change Password ───────────────────────────────────
  if (mode === 'changePassword') {
    return (
      <div className={styles.page}>
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

        <div className={styles.right}>
          <form className={styles.loginBox} onSubmit={handleChangePassword}>
            <h2 className={styles.title}>비밀번호 변경</h2>
            <p className={styles.sub}>초기 비밀번호를 변경해야 합니다.</p>

            <div className={styles.field}>
              <label>현재 비밀번호</label>
              <input type="password" value={curPw}
                onChange={e => setCurPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div className={styles.field}>
              <label>새 비밀번호</label>
              <input type="password" placeholder="8자 이상" value={newPw}
                onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className={styles.field}>
              <label>새 비밀번호 확인</label>
              <input type="password" placeholder="한 번 더 입력" value={newPw2}
                onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" />
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button type="submit" className={styles.btnLogin} disabled={loading}>
              {loading ? '저장 중…' : '비밀번호 변경 후 로그인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Render: Login ─────────────────────────────────────────────
  return (
    <div className={styles.page}>
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

      <div className={styles.right}>
        <form className={styles.loginBox} onSubmit={handleLogin}>
          <h2 className={styles.title}>Sign in</h2>
          <p className={styles.sub}>EZHEYO 어드민 계정으로 로그인하세요.</p>

          <div className={styles.field}>
            <label>아이디</label>
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label>비밀번호</label>
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
