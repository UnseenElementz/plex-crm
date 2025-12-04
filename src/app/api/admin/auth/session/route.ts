import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request){
  try{
    const { email, mode, username, password } = await request.json().catch(()=>({}))
    if (mode === 'local'){
      if (!username || !password) return NextResponse.json({ error: 'credentials required' }, { status: 400 })
      try{
        const jar = (await import('next/headers')).cookies()
        const raw = jar.get('admin_settings')?.value
        const settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
        const envUser = process.env.NEXT_PUBLIC_ADMIN_USER || ''
        const envPass = process.env.NEXT_PUBLIC_ADMIN_PASS || ''
        const defaultUser = 'Anfrax786'
        const defaultPass = 'Badaman1'
        const expectUser = String((settings?.admin_user ?? envUser ?? defaultUser)).trim()
        const expectPass = String((settings?.admin_pass ?? envPass ?? defaultPass)).trim()
        const ok = expectUser.toLowerCase() === String(username).trim().toLowerCase() && expectPass === String(password).trim()
        if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        const res = NextResponse.json({ ok: true, local: true })
        res.cookies.set('admin_session', '1', { httpOnly: true, path: '/', maxAge: 60*60*24 })
        return res
      } catch(e:any){ return NextResponse.json({ error: e?.message || 'error' }, { status: 500 }) }
    }
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const alias = (process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').toLowerCase()
    if (email.toLowerCase() === alias && process.env.NODE_ENV !== 'production'){
      const res = NextResponse.json({ ok: true, alias: true })
      res.cookies.set('admin_session', '1', { httpOnly: true, path: '/', maxAge: 60*60*24 })
      return res
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    if (!url || !key) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
    const s = createClient(url, key)
    const { data } = await s.from('profiles').select('role').eq('email', email).limit(1)
    const role = data?.[0]?.role || null
    if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const res = NextResponse.json({ ok: true })
    res.cookies.set('admin_session', '1', { httpOnly: true, path: '/', maxAge: 60*60*24 })
    return res
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

import { cookies } from 'next/headers'

export async function GET(){
  try{
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ ok: false }, { status: 401 })
    return NextResponse.json({ ok: true })
  } catch(e:any){
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(){
  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
