import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(){
  const supabase = svc()
  try{
    if (!supabase) {
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      const data = raw ? JSON.parse(decodeURIComponent(raw)) : {}
      return NextResponse.json(data || {})
    }
    const { data, error } = await supabase.from('admin_settings').select('*').single()
    if (error) {
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      const cookieData = raw ? JSON.parse(decodeURIComponent(raw)) : null
      if (cookieData) return NextResponse.json(cookieData)
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    // overlay cookie values if present to avoid nulls
    const jar = cookies()
    const raw = jar.get('admin_settings')?.value
    const cookieData = raw ? JSON.parse(decodeURIComponent(raw)) : {}
    const merged = { ...(data || {}), ...(cookieData || {}) }
    // also reflect into cookie for stability
    const res = NextResponse.json(merged)
    try { res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(merged)), { path: '/', maxAge: 60*60*24*365 }) } catch {}
    return res
  }catch(e: any){
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(request: Request){
  const supabase = svc()
  try{
    const payload = await request.json()
    const row = { id: 1, ...payload }
    let dbOk = false
    if (supabase) {
      const { error } = await supabase.from('admin_settings').upsert(row)
      dbOk = !error
    }
    // Always set cookie for persistence across ports
    const res = NextResponse.json({ ok: true, dbOk })
    try { res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 60*60*24*365 }) } catch {}
    return res
  }catch(e: any){
    const res = NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
    try { res.cookies.set('admin_settings', encodeURIComponent(await request.text()), { path: '/', maxAge: 60*60*24*365 }) } catch {}
    return res
  }
}
