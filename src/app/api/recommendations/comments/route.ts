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

export async function GET(req: Request){
  try{
    const url = new URL(req.url)
    const rid = url.searchParams.get('rid') || ''
    if (!rid) return NextResponse.json({ error: 'rid required' }, { status: 400 })
    const s = createServiceClient()
    if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

    const { data, error } = await s
      .from('recommendation_comments')
      .select('*')
      .eq('recommendation_id', rid)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items = (data || []).map((item: any) => {
      const rawAuthor = String(item.author_email || '').trim().toLowerCase()
      const isSystem = rawAuthor === 'system@streamzrus.local'
      const isAdmin = isSystem || rawAuthor === 'support@streamzrus.local' || rawAuthor === 'admin@streamzrus.local'
      return {
        ...item,
        role: isSystem ? 'system' : isAdmin ? 'admin' : 'customer',
        author_label: isSystem ? 'Status update' : isAdmin ? 'Support team' : 'Customer',
      }
    })

    return NextResponse.json({ items })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const requester = await getRequester(req)
    const b = await req.json().catch(()=>({}))
    const recommendationId = String(b?.rid || '').trim()
    const content = String(b?.content || '').trim()
    if (!recommendationId || !content) return NextResponse.json({ error: 'rid and content required' }, { status: 400 })

    const s = createServiceClient()
    if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

    let authorEmail = requester.email
    if (requester.isAdmin) {
      authorEmail = 'support@streamzrus.local'
    }

    if (!authorEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!requester.isAdmin) {
      const ok = await isActive(authorEmail)
      if (!ok) return NextResponse.json({ error: 'active subscription required' }, { status: 403 })
    }

    const payload = {
      id: crypto.randomUUID(),
      recommendation_id: recommendationId,
      author_email: authorEmail,
      content,
      created_at: new Date().toISOString()
    }

    const { data, error } = await s.from('recommendation_comments').insert([payload]).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await s
      .from('recommendations')
      .update({ updated_at: payload.created_at })
      .eq('id', recommendationId)

    return NextResponse.json({
      ok: true,
      item: {
        ...data,
        role: requester.isAdmin ? 'admin' : 'customer',
        author_label: requester.isAdmin ? 'Support team' : 'Customer',
      },
    })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
