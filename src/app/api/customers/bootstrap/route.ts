import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: Request){
  try{
    const s = svc()
    if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
    const { email, password, full_name } = await req.json().catch(()=>({}))
    if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 })
    const admin = (s as any).auth?.admin
    if (!admin) return NextResponse.json({ error: 'admin auth not available' }, { status: 500 })
    const { data: existing } = await s.from('profiles').select('user_id').eq('email', email).limit(1)
    let userId = existing?.[0]?.user_id as string | undefined
    if (!userId){
      const { data: created, error } = await admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'customer', full_name } })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      userId = created.user?.id
    }
    if (userId){
      await s.from('profiles').upsert({ user_id: userId, email, role: 'customer', full_name })
      const now = new Date()
      const next = new Date(now.getTime()); next.setMonth(next.getMonth() + 1)
      await s.from('customers').upsert({ email, name: full_name || email, subscription_type: 'monthly', streams: 1, start_date: now.toISOString(), next_payment_date: next.toISOString(), subscription_status: 'active' })
    }
    return NextResponse.json({ ok: true })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 }) }
}

