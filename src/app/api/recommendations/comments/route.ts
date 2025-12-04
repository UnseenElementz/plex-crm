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

export async function GET(req: Request){
  try{
    const url = new URL(req.url)
    const rid = url.searchParams.get('rid') || ''
    if (!rid) return NextResponse.json({ error: 'rid required' }, { status: 400 })
    const s = svc()
    if (s){
      const { data, error } = await s.from('recommendation_comments').select('*').eq('recommendation_id', rid).order('created_at', { ascending: true })
      if (!error) return NextResponse.json({ items: data || [] })
    }
    const jar = cookies(); const raw = jar.get(`comments_${rid}`)?.value
    const items = raw ? JSON.parse(decodeURIComponent(raw)) : []
    return NextResponse.json({ items })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const b = await req.json().catch(()=>({}))
    const ok = await isActive(String(b?.email || ''))
    if (!ok) return NextResponse.json({ error: 'active subscription required' }, { status: 403 })
    const payload = {
      id: crypto.randomUUID(),
      recommendation_id: String(b?.rid || ''),
      author_email: String(b?.email || ''),
      content: String(b?.content || ''),
      created_at: new Date().toISOString()
    }
    if (!payload.recommendation_id || !payload.content) return NextResponse.json({ error: 'rid and content required' }, { status: 400 })
    const s = svc()
    if (s){
      const { data, error } = await s.from('recommendation_comments').insert([payload]).select('*').single()
      if (!error) return NextResponse.json({ ok: true, item: data })
    }
    const jar = cookies(); const raw = jar.get(`comments_${payload.recommendation_id}`)?.value
    const items = raw ? JSON.parse(decodeURIComponent(raw)) : []
    items.push(payload)
    const res = NextResponse.json({ ok: true, item: payload })
    res.headers.set('Set-Cookie', `comments_${payload.recommendation_id}=${encodeURIComponent(JSON.stringify(items))}; Path=/; Max-Age=31536000`)
    return res
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
