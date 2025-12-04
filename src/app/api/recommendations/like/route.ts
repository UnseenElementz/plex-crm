import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getStatus } from '@/lib/pricing'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

async function isActive(email?: string | null){
  try{
    if (!email) return false
    const s = svc(); if (!s) return false
    const { data } = await s.from('customers').select('*').eq('email', email).limit(1)
    const row = data?.[0]
    if (!row) return false
    const due = row.next_payment_date || row.next_due_date || null
    const status = getStatus(due ? new Date(due) : new Date())
    return status !== 'Overdue' && (row.subscription_status || 'active') !== 'inactive'
  }catch{ return false }
}

export async function POST(req: Request){
  try{
    const { rid, email } = await req.json().catch(()=>({}))
    if (!rid) return NextResponse.json({ error: 'rid required' }, { status: 400 })
    const ok = await isActive(email)
    if (!ok) return NextResponse.json({ error: 'active subscription required' }, { status: 403 })
    const s = svc()
    if (s){
      const { data: existing } = await s.from('recommendation_likes').select('*').eq('recommendation_id', rid).eq('user_email', email).limit(1)
      if (existing && existing.length){
        await s.from('recommendation_likes').delete().eq('id', existing[0].id)
        return NextResponse.json({ ok: true, liked: false })
      }
      await s.from('recommendation_likes').insert([{ id: crypto.randomUUID(), recommendation_id: rid, user_email: email, created_at: new Date().toISOString() }])
      return NextResponse.json({ ok: true, liked: true })
    }
    const jar = cookies(); const key = `likes_${rid}`
    const raw = jar.get(key)?.value
    const list: string[] = raw ? JSON.parse(decodeURIComponent(raw)) : []
    const idx = list.indexOf(email)
    if (idx >= 0) list.splice(idx,1); else list.push(email)
    const res = NextResponse.json({ ok: true, liked: idx<0 })
    res.headers.set('Set-Cookie', `${key}=${encodeURIComponent(JSON.stringify(list))}; Path=/; Max-Age=31536000`)
    return res
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
