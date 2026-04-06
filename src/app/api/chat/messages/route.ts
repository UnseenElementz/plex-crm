import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nextConversationStatus } from '@/lib/chatIdle'

export async function GET(request: Request){
  const urlObj = new URL(request.url)
  const conversationId = urlObj.searchParams.get('conversationId')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      if (!conversationId) return NextResponse.json([])
      const { cookies } = await import('next/headers')
      const raw = cookies().get(`admin_messages_${conversationId}`)?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      return NextResponse.json(Array.isArray(list) ? list : [])
    } catch { return NextResponse.json([]) }
  }
  const supabase = createClient(url, key)
  try {
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function POST(request: Request){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const body = await request.json()
      const { conversation_id, sender_type, content } = body || {}
      if (!conversation_id || !sender_type || !content) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
      const msg = { id: crypto.randomUUID(), conversation_id, sender_id: crypto.randomUUID(), sender_type, content, timestamp: new Date().toISOString(), is_read: false, metadata: {} }
      const { cookies } = await import('next/headers')
      const jar = cookies()
      const raw = jar.get(`admin_messages_${conversation_id}`)?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      list.push(msg)
      const convRaw = jar.get('admin_conversations')?.value
      const convs = convRaw ? JSON.parse(decodeURIComponent(convRaw)) : []
      const updatedConvs = (convs||[]).map((c:any) => {
        if (c.id !== conversation_id) return c
        const unreadCount = sender_type === 'customer'
          ? Number(c?.metadata?.unread_customer_count || 0) + 1
          : Number(c?.metadata?.unread_customer_count || 0)
        return {
          ...c,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(c?.metadata || {}),
            unread_customer_count: unreadCount,
            has_unread_customer_message: unreadCount > 0,
          },
        }
      })
      const res = NextResponse.json(msg)
      res.cookies.set(`admin_messages_${conversation_id}`, encodeURIComponent(JSON.stringify(list)), { path: '/', maxAge: 31536000 })
      res.cookies.set('admin_conversations', encodeURIComponent(JSON.stringify(updatedConvs)), { path: '/', maxAge: 31536000 })
      return res
    } catch(e:any){ return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 }) }
  }
  const supabase = createClient(url, key)
  try {
    const body = await request.json()
    const { conversation_id, sender_type, content } = body || {}
    if (!conversation_id || !sender_type || !content) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_id: crypto.randomUUID(),
        sender_type,
        content,
        timestamp: new Date().toISOString(),
        is_read: false
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    try{
      const nowIso = new Date().toISOString()
      const { data: conv } = await supabase
        .from('conversations')
        .select('status,metadata')
        .eq('id', conversation_id)
        .maybeSingle()
      const meta: any = conv?.metadata || {}
      meta.last_message_at = nowIso
      if (sender_type === 'admin') meta.last_admin_at = nowIso
      if (sender_type === 'customer') {
        meta.last_customer_at = nowIso
        meta.unread_customer_count = Number(meta.unread_customer_count || 0) + 1
        meta.has_unread_customer_message = true
      }
      const nextStatus = conv?.status ? nextConversationStatus({ current: conv.status, senderType: sender_type }) : undefined
      await supabase.from('conversations').update({ updated_at: nowIso, status: nextStatus, metadata: meta }).eq('id', conversation_id)
    } catch {}
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(request: Request){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const body = await request.json()
      const { conversation_id } = body || {}
      if (!conversation_id) return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 })
      const { cookies } = await import('next/headers')
      const jar = cookies()
      const raw = jar.get(`admin_messages_${conversation_id}`)?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      const updated = (list||[]).map((m:any)=> m.sender_type==='customer' ? { ...m, is_read: true } : m)
      const convRaw = jar.get('admin_conversations')?.value
      const convs = convRaw ? JSON.parse(decodeURIComponent(convRaw)) : []
      const updatedConvs = (convs || []).map((c: any) => {
        if (c.id !== conversation_id) return c
        return {
          ...c,
          metadata: {
            ...(c?.metadata || {}),
            unread_customer_count: 0,
            has_unread_customer_message: false,
          },
        }
      })
      const res = NextResponse.json({ ok: true })
      res.cookies.set(`admin_messages_${conversation_id}`, encodeURIComponent(JSON.stringify(updated)), { path: '/', maxAge: 31536000 })
      res.cookies.set('admin_conversations', encodeURIComponent(JSON.stringify(updatedConvs)), { path: '/', maxAge: 31536000 })
      return res
    } catch(e:any){ return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 }) }
  }
  const supabase = createClient(url, key)
  try {
    const body = await request.json()
    const { conversation_id } = body || {}
    if (!conversation_id) {
      return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 })
    }
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversation_id)
      .eq('sender_type', 'customer')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { data: conv } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversation_id)
      .maybeSingle()
    const nextMetadata = {
      ...(conv?.metadata || {}),
      unread_customer_count: 0,
      has_unread_customer_message: false,
    }
    await supabase.from('conversations').update({ metadata: nextMetadata }).eq('id', conversation_id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
