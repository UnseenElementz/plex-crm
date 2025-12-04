import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  if (process.env.NODE_ENV === 'production'){
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const supabase = svc()
  const payload = await request.json().catch(()=>({})) as any
  const admin_user = (payload.admin_user || process.env.NEXT_PUBLIC_ADMIN_USER || 'Admin') as string
  const admin_pass = (payload.admin_pass || process.env.NEXT_PUBLIC_ADMIN_PASS || 'Badaman1') as string
  const adminAliasEmail = (process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').toLowerCase()
  try{
    if (supabase){
      await supabase.from('admin_settings').upsert({ id: 1, admin_user, admin_pass })
      let userId: string | null = null
      try{
        const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
        userId = (list?.data?.users || []).find(u=> (u.email || '').toLowerCase() === adminAliasEmail)?.id || null
      } catch {}
      if (!userId){
        const created = await supabase.auth.admin.createUser({ email: adminAliasEmail, password: admin_pass, email_confirm: true })
        userId = created?.data?.user?.id || null
      } else {
        await supabase.auth.admin.updateUserById(userId, { password: admin_pass })
      }
      await supabase.from('profiles').upsert({ email: adminAliasEmail, role: 'admin' }, { onConflict: 'email' })
      try{
        const { data: convs } = await supabase.from('conversations').select('id').order('updated_at', { ascending: false }).limit(1)
        let convId = convs && convs[0]?.id
        if (!convId){
          const ins = await supabase.from('conversations').insert({ status: 'active', customer_ip: '127.0.0.1', metadata: { full_name: 'Demo User', email: 'demo@example.com' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single()
          convId = ins?.data?.id
        }
        if (convId){
          await supabase.from('messages').insert({ conversation_id: convId, sender_id: 'seed', sender_type: 'customer', content: 'Welcome to chat! This is a demo message.', timestamp: new Date().toISOString(), is_read: false })
        }
      } catch {}
      try{
        const { data: custs } = await supabase.from('customers').select('id').limit(1)
        if (!custs || custs.length === 0){
          await supabase.from('customers').insert({ name: 'Demo Customer', email: 'demo@example.com', subscription_type: 'monthly', streams: 1, start_date: new Date().toISOString(), next_payment_date: new Date(new Date().setMonth(new Date().getMonth()+1)).toISOString(), notes: 'Plex: demo\nTimezone: Europe/London' })
        }
      } catch {}
    }
    const res = NextResponse.json({ ok: true, admin_user })
    res.cookies.set('admin_settings', encodeURIComponent(JSON.stringify({ admin_user, admin_pass })), { path: '/', maxAge: 60*60*24*365 })
    res.cookies.set('admin_session', '1', { httpOnly: true, path: '/', maxAge: 60*60*24 })
    return res
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'bootstrap failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
