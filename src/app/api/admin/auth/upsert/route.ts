import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(){
  const supabase = svc()
  if (!supabase) return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 })
  const adminEmail = 'admin@streamzrus.local'
  try{
    const { data: settingsRow } = await supabase.from('admin_settings').select('admin_pass').single()
    const password = settingsRow?.admin_pass || 'Badaman1'
    let userId: string | null = null
    try{
      const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
      userId = (list?.data?.users || []).find(u=> (u.email || '').toLowerCase() === adminEmail)?.id || null
    } catch {}
    if (!userId){
      const created = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
      userId = created?.data?.user?.id || null
    } else {
      await supabase.auth.admin.updateUserById(userId, { password })
    }
    await supabase
      .from('profiles')
      .upsert({ email: adminEmail, role: 'admin' }, { onConflict: 'email' })
    return NextResponse.json({ ok: true, userId })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed to upsert admin user' }, { status: 500 })
  }
}

export async function GET(){
  return POST()
}

export const runtime = 'nodejs'
