import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function withUnreadMetadata(conversations: any[], unreadCounts: Record<string, number>) {
  return (conversations || []).map((conversation) => {
    const unreadCount = Number(unreadCounts[conversation.id] || 0)
    return {
      ...conversation,
      metadata: {
        ...(conversation.metadata || {}),
        unread_customer_count: unreadCount,
        has_unread_customer_message: unreadCount > 0,
      },
    }
  })
}

export async function GET(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const { cookies } = await import('next/headers')
      const raw = cookies().get('admin_conversations')?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      const unreadCounts = Object.fromEntries(
        (Array.isArray(list) ? list : []).map((conversation: any) => {
          const messagesRaw = cookies().get(`admin_messages_${conversation.id}`)?.value
          const messages = messagesRaw ? JSON.parse(decodeURIComponent(messagesRaw)) : []
          const unreadCount = (Array.isArray(messages) ? messages : []).filter(
            (message: any) => message?.sender_type === 'customer' && !message?.is_read
          ).length
          return [conversation.id, unreadCount]
        })
      )
      return NextResponse.json(withUnreadMetadata(Array.isArray(list) ? list : [], unreadCounts))
    } catch { return NextResponse.json([]) }
  }
  const supabase = createClient(url, key)
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const conversationIds = (data || []).map((conversation: any) => conversation.id)
    let unreadCounts: Record<string, number> = {}

    if (conversationIds.length > 0) {
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .eq('sender_type', 'customer')
        .eq('is_read', false)

      unreadCounts = (unreadMessages || []).reduce((acc: Record<string, number>, row: any) => {
        const key = String(row.conversation_id || '')
        if (!key) return acc
        acc[key] = Number(acc[key] || 0) + 1
        return acc
      }, {})
    }

    return NextResponse.json(withUnreadMetadata(data || [], unreadCounts))
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
      const { customer_ip, metadata } = body || {}
      const row = {
        id: crypto.randomUUID(),
        status: 'waiting',
        customer_ip: customer_ip || null,
        metadata: { ...(metadata || {}), unread_customer_count: 0, has_unread_customer_message: false },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
      }
      const { cookies } = await import('next/headers')
      const jar = cookies()
      const raw = jar.get('admin_conversations')?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      list.unshift(row)
      const res = NextResponse.json(row)
      res.cookies.set('admin_conversations', encodeURIComponent(JSON.stringify(list)), { path: '/', maxAge: 31536000 })
      return res
    } catch(e:any){ return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 }) }
  }
  const supabase = createClient(url, key)
  try {
    const body = await request.json()
    const { customer_ip, metadata } = body || {}
    
    // Auto-enrich with customer data if email is present
    let enrichedMetadata = {
      ...metadata,
      unread_customer_count: 0,
      has_unread_customer_message: false,
    }
    if (metadata?.email) {
      const { data: customer } = await supabase
        .from('customers')
        .select('name,subscription_type,streams,subscription_status,next_payment_date,notes')
        .eq('email', metadata.email)
        .single()
      
      if (customer) {
        const notes = String((customer as any).notes || '')
        const plexUsername = notes.match(/Plex:\s*([^\n]+)/i)?.[1]?.trim() || ''
        enrichedMetadata = {
          ...enrichedMetadata,
          plex_username: plexUsername || (enrichedMetadata as any).plex_username,
          full_name: (customer as any).name || (enrichedMetadata as any).full_name,
          subscription_type: (customer as any).subscription_type || (enrichedMetadata as any).subscription_type,
          streams: (customer as any).streams || (enrichedMetadata as any).streams,
          subscription_status: (customer as any).subscription_status || (enrichedMetadata as any).subscription_status,
          next_payment_date: (customer as any).next_payment_date || (enrichedMetadata as any).next_payment_date
        }
      }
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ status: 'waiting', customer_ip, metadata: enrichedMetadata, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
