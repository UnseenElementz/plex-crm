import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/pricing'
import { createServiceClient, getRequester } from '@/lib/serverSupabase'

async function isActive(email?: string | null){
  try{
    if (!email) return false
    const s = createServiceClient(); if (!s) return false
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
    const requester = await getRequester(req)
    const { rid } = await req.json().catch(()=>({}))
    if (!rid) return NextResponse.json({ error: 'rid required' }, { status: 400 })
    if (!requester.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await isActive(requester.email)
    if (!ok) return NextResponse.json({ error: 'active subscription required' }, { status: 403 })
    const s = createServiceClient()
    if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

    const { data: existing } = await s
      .from('recommendation_likes')
      .select('*')
      .eq('recommendation_id', rid)
      .eq('user_email', requester.email)
      .limit(1)

    if (existing && existing.length){
      await s.from('recommendation_likes').delete().eq('id', existing[0].id)
      return NextResponse.json({ ok: true, liked: false })
    }

    await s.from('recommendation_likes').insert([{
      id: crypto.randomUUID(),
      recommendation_id: rid,
      user_email: requester.email,
      created_at: new Date().toISOString()
    }])
    return NextResponse.json({ ok: true, liked: true })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
