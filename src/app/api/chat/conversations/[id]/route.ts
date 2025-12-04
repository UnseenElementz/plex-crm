import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(request: Request, { params }: { params: { id: string } }){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const body = await request.json()
      const { cookies } = await import('next/headers')
      const jar = cookies()
      const raw = jar.get('admin_conversations')?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      let row = list.find((c:any)=> c.id === params.id)
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (body.status !== undefined) row.status = body.status
      if (body.metadata !== undefined) row.metadata = body.metadata
      if (body.status === 'closed') row.closed_at = new Date().toISOString()
      row.updated_at = new Date().toISOString()
      const updated = list.map((c:any)=> c.id===params.id ? row : c)
      const res = NextResponse.json(row)
      res.cookies.set('admin_conversations', encodeURIComponent(JSON.stringify(updated)), { path: '/', maxAge: 31536000 })
      return res
    } catch(e:any){ return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 }) }
  }
  const supabase = createClient(url, key)
  try {
    const body = await request.json()
    const payload: any = {}
    if (body.status !== undefined) payload.status = body.status
    if (body.metadata !== undefined) payload.metadata = body.metadata
    if (body.status === 'closed') payload.closed_at = new Date().toISOString()
    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 })
    const { data, error } = await supabase
      .from('conversations')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const { cookies } = await import('next/headers')
      const jar = cookies()
      const raw = jar.get('admin_conversations')?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      const updated = (list || []).filter((c:any)=> c.id !== params.id)
      const res = NextResponse.json({ ok: true })
      res.cookies.set('admin_conversations', encodeURIComponent(JSON.stringify(updated)), { path: '/', maxAge: 31536000 })
      return res
    } catch(e:any){ return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 }) }
  }
  const supabase = createClient(url, key)
  try {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', params.id)
    const msgIds = (msgs || []).map(m => m.id)
    if (msgIds.length) {
      await supabase.from('attachments').delete().in('message_id', msgIds)
    }
    await supabase.from('messages').delete().eq('conversation_id', params.id)
    await supabase.from('participants').delete().eq('conversation_id', params.id)
    const { error } = await supabase.from('conversations').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
