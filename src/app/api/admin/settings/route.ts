import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Supabase Admin Init Failed: Missing keys', { url: !!url, key: !!key })
    return null
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

export async function GET(){
  const supabase = svc()
  let dbStatus = 'init'
  try{
    let data: any = null
    let error: any = null
    if (supabase){
      dbStatus = 'connecting'
      const r = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
      data = r.data || null
      error = r.error || null
      dbStatus = error ? 'error' : (data ? 'found' : 'empty')
      if (error) console.error('Supabase DB Error:', error)
    } else {
      dbStatus = 'no-client'
    }

    // ABSOLUTE TRUTH: Use Database data if we have it.
    // Cookies are ONLY a fallback for when DB is totally unreachable (no-client or fatal error)
    let finalSettings = data
    if (!finalSettings) {
        const jar = cookies()
        const raw = jar.get('admin_settings')?.value
        finalSettings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    }
    
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!finalSettings && error) return NextResponse.json({ error: error.message }, { status: 404 })
    
    const safe: any = {}
    const allow = ['company_name','yearly_price','stream_yearly_price','movies_only_price','tv_only_price','downloads_price','payment_lock','chat_online','canonical_host','hero_image_url','bg_music_url','bg_music_volume','bg_music_enabled','plex_token','plex_server_url']
    for (const k of allow){ if (finalSettings && finalSettings[k] !== undefined) safe[k] = finalSettings[k] }
    
    const res = NextResponse.json(isAdmin ? (finalSettings || {}) : safe, { 
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 
            'X-DB-Status': dbStatus 
        } 
    })

    // Keep the cookie in sync with the DB truth
    if (finalSettings) {
        try {
            res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(finalSettings)), { path: '/', maxAge: 60*60*24*365 })
        } catch {}
    }

    return res
  }catch(e: any){
    console.error('Settings GET Fatal:', e)
    return NextResponse.json({ error: e?.message || 'Unknown error', dbStatus }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } })
  }
}

export async function PUT(request: Request){
  const supabase = svc()
  try{
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const payload = await request.json()
    const allowedKeys = [
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 
      'paypal_email', 'timezone', 'monthly_maintenance', 'company_name',
      'yearly_price', 'stream_yearly_price', 'movies_only_price', 'tv_only_price',
      'downloads_price', 'payment_lock', 'chat_online', 'hero_image_url',
      'admin_user', 'admin_pass', 'plex_token', 'plex_server_url',
      'bg_music_url', 'bg_music_volume', 'bg_music_enabled'
    ]
    
    const row: any = { id: 1 }
    for (const key of allowedKeys) {
      if (payload[key] !== undefined) row[key] = payload[key]
    }
    
    let dbOk = false
    let dbError = null

    if (supabase) {
      // NUCLEAR FIX: Ensure only one row exists and it is ID 1
      const { data: existing } = await supabase.from('admin_settings').select('id').eq('id', 1).maybeSingle()
      
      if (!existing) {
          await supabase.from('admin_settings').delete().neq('id', 1)
          const { error: insErr } = await supabase.from('admin_settings').insert(row)
          if (insErr) dbError = insErr.message
          else dbOk = true
      } else {
          // Row exists, do a standard update but EXCLUDE id from the update payload
          const updateData = { ...row }
          delete updateData.id
          
          const { error: updErr } = await supabase.from('admin_settings').update(updateData).eq('id', 1)
          if (updErr) {
              console.warn('Full update failed, trying individual updates...', updErr.message)
              const keys = Object.keys(updateData)
              let successCount = 0
              for (const k of keys) {
                  const { error: fieldError } = await supabase.from('admin_settings').update({ [k]: updateData[k] }).eq('id', 1)
                  if (!fieldError) successCount++
              }
              dbOk = successCount > 0
              dbError = updErr.message
          } else {
              dbOk = true
          }
      }

      // 4. VERIFY AND FETCH BACK - Use a fresh fetch to avoid any caching
      const { data: finalData, error: finalError } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
      if (finalError) console.error('Final fetch error:', finalError)
      if (finalData) {
          Object.assign(row, finalData)
      }
    }

    const res = NextResponse.json({ ok: true, dbOk, dbError, settings: row }, { 
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } 
    })
    
    try { 
        res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 60*60*24*365 }) 
    } catch {}

    return res
  }catch(e: any){
    const res = NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } })
    try { res.cookies.set('admin_settings', encodeURIComponent(await request.text()), { path: '/', maxAge: 60*60*24*365 }) } catch {}
    return res
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
