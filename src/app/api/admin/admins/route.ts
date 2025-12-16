import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(){
  const s = svc()
  if (!s){
    try{
      const raw = cookies().get('admin_settings')?.value
      const settings = raw ? JSON.parse(decodeURIComponent(raw)) : {}
      const perms = (settings as any)?.admin_perms || {}
      const admins = Object.keys(perms).map(email=>({ email, full_name: '', pages: perms[email] || ['dashboard','customers','settings','email','chat'] }))
      return NextResponse.json({ admins })
    } catch(e:any){ return NextResponse.json({ error: 'service unavailable' }, { status: 503 }) }
  }
  try{
    let profs: any[] = []
    try{ const { data } = await s.from('profiles').select('email,full_name,role'); profs = data || [] } catch{}
    let users: any[] = []
    try{ const list = await (s as any).auth?.admin?.listUsers({ page: 1, perPage: 200 }); users = list?.data?.users || [] } catch{}
    const fromProfiles = (profs||[]).filter(p=> (p as any).role === 'admin').map(p=>({ email: (p as any).email, full_name: (p as any).full_name || '' }))
    const fromUsers = (users||[]).filter(u=> String(u.user_metadata?.role||'').toLowerCase() === 'admin').map(u=>({ email: (u.email||'').toLowerCase(), full_name: String(u.user_metadata?.full_name||'') }))
    const byEmail: Record<string, { email:string; full_name:string }> = {}
    for (const a of [...fromProfiles, ...fromUsers]){ const key = (a.email||'').toLowerCase(); if (!key) continue; byEmail[key] = { email: key, full_name: a.full_name || byEmail[key]?.full_name || '' } }
    let perms: Record<string, string[]> = {}
    try{ const { data: settings } = await s.from('admin_settings').select('*').single(); perms = (settings as any)?.admin_perms || {} } catch{
      const raw = cookies().get('admin_settings')?.value
      const settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
      perms = settings?.admin_perms || {}
    }
    const allEmails = new Set([...Object.keys(byEmail), ...Object.keys(perms)])
    const admins = Array.from(allEmails).map(email=>({ email, full_name: byEmail[email]?.full_name || '', pages: perms[email] || ['dashboard','customers','settings','email','chat'] }))
    return NextResponse.json({ admins })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export async function POST(request: Request){
  const s = svc()
  if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  try{
    const body = await request.json()
    const email = String(body.email||'').toLowerCase()
    const password = String(body.password||'')
    const full_name = String(body.full_name||'')
    const pages: string[] = Array.isArray(body.pages) ? body.pages : []
    if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 })

    const admin = (s as any).auth?.admin
    if (!admin) return NextResponse.json({ error: 'admin auth not available' }, { status: 500 })
    let userId: string | null = null
    try{
      const list = await admin.listUsers({ page: 1, perPage: 200 })
      userId = (list?.data?.users || []).find((u:any)=> (u.email || '').toLowerCase() === email)?.id || null
    } catch{}
    if (!userId){
      const created = await admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'admin', full_name } })
      userId = created?.data?.user?.id || null
    } else {
      await admin.updateUserById(userId, { password })
    }
    await s.from('profiles').upsert({ email, role: 'admin', full_name }, { onConflict: 'email' })

    let settings: any = null
    try{
      const { data } = await s.from('admin_settings').select('*').single()
      settings = data || {}
    } catch{}
    settings = settings || {}
    const nextPerms = { ...(settings.admin_perms || {}), [email]: pages }
    const row = { id: 1, ...(settings||{}), admin_perms: nextPerms }
    await s.from('admin_settings').upsert(row)
    const res = NextResponse.json({ ok: true, email, pages })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export async function PUT(request: Request){
  const s = svc()
  if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  try{
    const body = await request.json()
    const email = String(body.email||'').toLowerCase()
    const password = body.password ? String(body.password) : undefined
    const full_name = String(body.full_name||'')
    const pages: string[] = Array.isArray(body.pages) ? body.pages : []
    const originalEmail = String(body.originalEmail || email).toLowerCase()

    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const admin = (s as any).auth?.admin
    if (!admin) return NextResponse.json({ error: 'admin auth not available' }, { status: 500 })
    
    let userId: string | null = null
    try{
      const list = await admin.listUsers({ page: 1, perPage: 200 })
      userId = (list?.data?.users || []).find((u:any)=> (u.email || '').toLowerCase() === originalEmail)?.id || null
    } catch{}

    if (userId){
      const updateData: any = { user_metadata: { role: 'admin', full_name } }
      if (email !== originalEmail) updateData.email = email
      if (password) updateData.password = password
      updateData.email_confirm = true
      
      await admin.updateUserById(userId, updateData)
    }

    await s.from('profiles').upsert({ email, role: 'admin', full_name }, { onConflict: 'email' })
    if (email !== originalEmail) {
      // Clean up old profile if email changed
      // Note: Supabase auth change handles user, but profile needs manual cleanup if PK is email
      // If profile PK is id, it's fine. If PK is email, we might leave an orphan.
      // Assuming PK is user_id or email. If email, we should delete old.
      await s.from('profiles').delete().eq('email', originalEmail)
    }

    let settings: any = null
    try{
      const { data } = await s.from('admin_settings').select('*').single()
      settings = data || {}
    } catch{}
    settings = settings || {}
    const perms = { ...(settings.admin_perms || {}) }
    if (email !== originalEmail) delete perms[originalEmail]
    perms[email] = pages
    
    const row = { id: 1, ...(settings||{}), admin_perms: perms }
    await s.from('admin_settings').upsert(row)
    
    const res = NextResponse.json({ ok: true })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request){
  const s = svc()
  if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  try{
    const url = new URL(request.url)
    const email = (url.searchParams.get('email') || '').toLowerCase()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const admin = (s as any).auth?.admin
    if (admin){
      try{
        const list = await admin.listUsers({ page: 1, perPage: 200 })
        const userId = (list?.data?.users || []).find((u:any)=> (u.email || '').toLowerCase() === email)?.id
        if (userId) await admin.deleteUser(userId)
      } catch{}
    }
    
    await s.from('profiles').delete().eq('email', email)

    let settings: any = null
    try{
      const { data } = await s.from('admin_settings').select('*').single()
      settings = data || {}
    } catch{}
    settings = settings || {}
    const perms = { ...(settings.admin_perms || {}) }
    delete perms[email]
    
    const row = { id: 1, ...(settings||{}), admin_perms: perms }
    await s.from('admin_settings').upsert(row)
    
    const res = NextResponse.json({ ok: true })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify(row)), { path: '/', maxAge: 31536000 })
    return res
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
