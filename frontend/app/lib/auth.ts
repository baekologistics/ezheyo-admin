import Cookies from 'js-cookie'

const TOKEN_KEY = 'ezheyo_token'
const USER_KEY  = 'ezheyo_user'

export type AuthUser = {
  username:           string
  displayName:        string
  role:               'owner1' | 'owner2' | 'staff'
  mustChangePassword: boolean
}

// ── Token helpers ─────────────────────────────────────────────────
export function getToken(): string | undefined {
  return Cookies.get(TOKEN_KEY)
}

export function setToken(token: string): void {
  Cookies.set(TOKEN_KEY, token, { expires: 7, sameSite: 'strict' })
}

export function removeToken(): void {
  Cookies.remove(TOKEN_KEY)
  Cookies.remove(USER_KEY)
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_KEY)
  }
}

// ── User helpers (localStorage) ───────────────────────────────────
export function setUser(user: AuthUser): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }
}

export function getUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

// ── Fetch with auth ───────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  return fetch(`${API_URL}${input}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

// ── Log page view ─────────────────────────────────────────────────
export async function logPageView(page: string): Promise<void> {
  try {
    await authFetch('/api/logs/page-view', {
      method: 'POST',
      body: JSON.stringify({ page }),
    })
  } catch { /* non-fatal */ }
}
