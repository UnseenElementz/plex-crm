import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest){
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/admin')){
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd){
      const isAdmin = req.cookies.get('admin_session')?.value === '1'
      if (!isAdmin){
        const url = new URL('/login', req.url)
        return NextResponse.redirect(url)
      }
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
