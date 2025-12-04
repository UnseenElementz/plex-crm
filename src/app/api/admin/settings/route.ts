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
    let data: any = null
    let error: any = null
    if (supabase){
      const r = await supabase.from('admin_settings').select('*').single()
      data = r.data || null
      error = r.error || null
    }
    const jar = cookies()
    const raw = jar.get('admin_settings')?.value
    const cookieData = raw ? JSON.parse(decodeURIComponent(raw)) : {}
    const merged = { ...(data || {}), ...(cookieData || {}) }
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (error && !merged) return NextResponse.json({ error: error.message }, { status: 404 })
    const safe: any = {}
    const allow = ['monthly_price','yearly_price','stream_monthly_price','stream_yearly_price','three_year_price','stream_three_year_price','payment_lock','chat_online','canonical_host','hero_image_url','bg_music_url','bg_music_volume','bg_music_enabled']
    for (const k of allow){ if (merged && (merged as any)[k] !== undefined) safe[k] = (merged as any)[k] }
    const res = NextResponse.json(isAdmin ? merged : safe)
    try {
      if (isAdmin) {
        res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(merged)), { path: '/', maxAge: 60*60*24*365 })
      }
    } catch {}
    return res
  }catch(e: any){
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(request: Request){
  const supabase = svc()
  try{
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
