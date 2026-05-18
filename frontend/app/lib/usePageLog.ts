import { useEffect } from 'react'
import { logPageView, authFetch } from './auth'

export { authFetch }

export function usePageLog(page: string) {
  useEffect(() => {
    logPageView(page)
  }, [page])
}
