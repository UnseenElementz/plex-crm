import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  try{
    const s = svc()
    if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
    const ipHeader = request.headers.get('x-forwarded-for') || ''
    const ip = ipHeader.split(',')[0].trim() || 'unknown'
    let email = ''
    try{
      const { data } = await s.auth.getUser()
      email = data.user?.email || ''
    } catch{}
    let { data: settings } = await s.from('admin_settings').select('*').single()
    settings = settings || {}
    const logs = (settings as any).ip_logs || {}
    const list = Array.isArray(logs[email]) ? logs[email] : []
    const next = Array.from(new Set([...list, ip])).slice(-20)
    const all = Array.isArray((settings as any).ip_all) ? (settings as any).ip_all : []
    const nextAll = Array.from(new Set([...all, ip])).slice(-1000)
    const updated = { ...(settings||{}), ip_logs: { ...logs, [email]: next }, ip_all: nextAll }
    await s.from('admin_settings').upsert({ id: 1, ...updated })
    const res = NextResponse.json({ ok: true, ip, email })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(updated)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
