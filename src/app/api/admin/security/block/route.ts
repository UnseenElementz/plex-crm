import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  try{
    const { ip } = await request.json().catch(()=>({}))
    if (!ip) return NextResponse.json({ error: 'ip required' }, { status: 400 })
    const s = svc()
    let settings: any = null
    try{ if (s){ const { data } = await s.from('admin_settings').select('*').single(); settings = data || {} } } catch{}
    settings = settings || {}
    const blocked = Array.isArray((settings as any).blocked_ips) ? (settings as any).blocked_ips : []
    const next = Array.from(new Set([...blocked, ip]))
    const row = { id: 1, ...(settings||{}), blocked_ips: next }
    if (s) await s.from('admin_settings').upsert(row)
    const res = NextResponse.json({ ok: true, blocked_ips: next })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){ return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 }) }
}

export async function DELETE(request: Request){
  try{
    const url = new URL(request.url)
    const ip = url.searchParams.get('ip') || ''
    if (!ip) return NextResponse.json({ error: 'ip required' }, { status: 400 })
    const s = svc()
    let settings: any = null
    try{ if (s){ const { data } = await s.from('admin_settings').select('*').single(); settings = data || {} } } catch{}
    settings = settings || {}
    const blocked = Array.isArray((settings as any).blocked_ips) ? (settings as any).blocked_ips : []
    const next = blocked.filter((x:string)=> x !== ip)
    const row = { id: 1, ...(settings||{}), blocked_ips: next }
    if (s) await s.from('admin_settings').upsert(row)
    const res = NextResponse.json({ ok: true, blocked_ips: next })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){ return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 }) }
}

export const runtime = 'nodejs'
