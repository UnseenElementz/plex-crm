import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

function envString(key: string) {
  return String(process.env[key] || '').trim()
}

function envBool(key: string, fallback = false) {
  const value = envString(key)
  if (!value) return fallback
  return value.toLowerCase() === 'true'
}

function getEnvInboxSettings() {
  const host = envString('INBOUND_IMAP_HOST')
  const port = envString('INBOUND_IMAP_PORT') || '993'
  const user = envString('INBOUND_IMAP_USER')
  const pass = envString('INBOUND_IMAP_PASS')
  const secure = envBool('INBOUND_IMAP_SECURE', true)
  const mailbox = envString('INBOUND_IMAP_MAILBOX') || 'INBOX'
  const keywords = envString('INBOUND_IMAP_SERVICE_KEYWORDS')
  const configured = Boolean(host && user && pass)

  return {
    configured,
    host,
    port,
    user,
    secure,
    mailbox,
    keywords,
  }
}

export async function GET(){
  const supabase = svc()
  let dbStatus = 'init'
  try{
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is required for admin settings' }, { status: 503, headers: { 'X-DB-Status': 'no-client' } })
    }

    let data: any = null
    let error: any = null
    dbStatus = 'connecting'
    const r = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    data = r.data || null
    error = r.error || null
    dbStatus = error ? 'error' : (data ? 'found' : 'empty')
    if (error) console.error('Supabase DB Error:', error)
    const envInbox = getEnvInboxSettings()

    if (envInbox.configured) {
      data = {
        ...(data || {}),
        imap_host: data?.imap_host ?? envInbox.host,
        imap_port: data?.imap_port ?? envInbox.port,
        imap_user: data?.imap_user ?? envInbox.user,
        imap_secure: data?.imap_secure ?? envInbox.secure,
        imap_mailbox: data?.imap_mailbox ?? envInbox.mailbox,
        service_email_keywords: data?.service_email_keywords ?? envInbox.keywords,
        imap_source: 'env',
        imap_configured: true,
      }
      if (cookies().get('admin_session')?.value === '1') {
        data.imap_pass = '__ENV_CONFIGURED__'
      }
    } else if (data) {
      data.imap_source = 'database'
      data.imap_configured = Boolean(data.imap_host && data.imap_user && data.imap_pass)
    }

    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!data && error) return NextResponse.json({ error: error.message }, { status: 404, headers: { 'X-DB-Status': dbStatus } })
    
    const safe: any = {}
    const allow = ['company_name','yearly_price','stream_yearly_price','movies_only_price','tv_only_price','downloads_price','payment_lock','chat_online','chat_availability','chat_idle_timeout_minutes','canonical_host','hero_image_url','bg_music_url','bg_music_volume','bg_music_enabled','plex_token','plex_server_url','imap_host','imap_port','imap_user','imap_secure','imap_mailbox','service_email_keywords','imap_source','imap_configured']
    for (const k of allow){ if (data && data[k] !== undefined) safe[k] = data[k] }
    
    return NextResponse.json(isAdmin ? (data || {}) : safe, { 
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 
            'X-DB-Status': dbStatus 
        } 
    })
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
    if (!supabase) return NextResponse.json({ error: 'Supabase is required for admin settings' }, { status: 503 })
    
    const payload = await request.json()
    const allowedKeys = [
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 
      'paypal_email', 'timezone', 'monthly_maintenance', 'company_name',
      'yearly_price', 'stream_yearly_price', 'movies_only_price', 'tv_only_price',
      'downloads_price', 'payment_lock', 'chat_online', 'chat_availability', 'chat_idle_timeout_minutes', 'hero_image_url',
      'admin_user', 'admin_pass', 'plex_token', 'plex_server_url',
      'bg_music_url', 'bg_music_volume', 'bg_music_enabled',
      'imap_host', 'imap_port', 'imap_user', 'imap_pass', 'imap_secure', 'imap_mailbox', 'service_email_keywords'
    ]
    
    const row: any = { id: 1 }
    for (const key of allowedKeys) {
      if (payload[key] !== undefined) row[key] = payload[key]
    }
    const envInbox = getEnvInboxSettings()

    if (row.plex_server_url !== undefined) {
      const raw = String(row.plex_server_url || '').trim()
      let v = raw.replace(/\/+$/,'')
      if (v === '') v = 'https://plex.tv'
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`
      row.plex_server_url = v
    }

    if (row.chat_availability !== undefined) {
      const v = String(row.chat_availability || '').toLowerCase()
      row.chat_availability = v === 'off' || v === 'waiting' || v === 'active' ? v : 'active'
      row.chat_online = row.chat_availability !== 'off'
    } else if (row.chat_online !== undefined) {
      row.chat_availability = row.chat_online ? 'active' : 'off'
    }
    
    let dbOk = false
    let dbError = null

    // Ensure only one row exists and it is ID 1
    const { data: existing } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    const supportsInboxColumns = existing
      ? ['imap_host', 'imap_port', 'imap_user', 'imap_pass', 'imap_secure', 'imap_mailbox', 'service_email_keywords'].every((key) => Object.prototype.hasOwnProperty.call(existing, key))
      : false
    if (!supportsInboxColumns) {
      delete row.imap_host
      delete row.imap_port
      delete row.imap_user
      delete row.imap_pass
      delete row.imap_secure
      delete row.imap_mailbox
      delete row.service_email_keywords
    } else if (envInbox.configured && row.imap_pass === '__ENV_CONFIGURED__') {
      delete row.imap_pass
    }
    
    if (!existing) {
        await supabase.from('admin_settings').delete().neq('id', 1)
        const { error: insErr } = await supabase.from('admin_settings').insert(row)
        if (insErr) dbError = insErr.message
        else dbOk = true
    } else {
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

    const { data: finalData, error: finalError } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    if (finalError) console.error('Final fetch error:', finalError)
    if (finalData) {
        Object.assign(row, finalData)
    }
    if (envInbox.configured) {
      row.imap_host = row.imap_host ?? envInbox.host
      row.imap_port = row.imap_port ?? envInbox.port
      row.imap_user = row.imap_user ?? envInbox.user
      row.imap_pass = '__ENV_CONFIGURED__'
      row.imap_secure = row.imap_secure ?? envInbox.secure
      row.imap_mailbox = row.imap_mailbox ?? envInbox.mailbox
      row.service_email_keywords = row.service_email_keywords ?? envInbox.keywords
      row.imap_source = 'env'
      row.imap_configured = true
    } else {
      row.imap_source = supportsInboxColumns ? 'database' : 'unavailable'
      row.imap_configured = Boolean(row.imap_host && row.imap_user && row.imap_pass)
    }

    return NextResponse.json({ ok: true, dbOk, dbError, settings: row }, { 
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } 
    })
  }catch(e: any){
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
