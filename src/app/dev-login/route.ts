import { NextResponse } from 'next/server'

export async function GET(req: Request){
  if (process.env.NODE_ENV === 'production'){
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const res = NextResponse.redirect(new URL('/admin', req.url))
  res.cookies.set('admin_session', '1', { httpOnly: true, path: '/', maxAge: 60*60*24 })
  return res
}

export const runtime = 'nodejs'
