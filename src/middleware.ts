import { NextResponse, NextRequest } from 'next/server'

export function middleware(req: NextRequest){
  const ipHeader = req.headers.get('x-forwarded-for') || ''
  const ip = ipHeader.split(',')[0].trim()
  try{
    const raw = req.cookies.get('admin_settings')?.value || ''
    const settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    const blocked = Array.isArray(settings?.blocked_ips) ? settings.blocked_ips : []
    if (ip && blocked.includes(ip)){
      return new NextResponse('<html><body style="font-family:system-ui;background:#0b1220;color:#e11d48;display:flex;align-items:center;justify-content:center;height:100vh"><div><h1>Access Blocked</h1><p>Your IP is blocked.</p></div></body></html>', { status: 403, headers: { 'content-type': 'text/html' } })
    }
  } catch{}
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api/paypal|api/diagnostics|api/admin/security|api/admin/auth|api/admin/admins|api/admin/settings|favicon.ico).*)']
}
