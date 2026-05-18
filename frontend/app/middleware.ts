import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only protect /app/* routes (not /login)
  if (!pathname.startsWith('/app') || pathname.startsWith('/app/login')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('ezheyo_token')?.value

  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/app/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*'],
}
