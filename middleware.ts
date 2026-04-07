import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname === '/' ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/', req.url))
}

export const config = {
  matcher: '/:path*',
}
