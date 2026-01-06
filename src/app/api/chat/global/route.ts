import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

async function isBanned(email: string) {
  const s = svc()
  if (!s) return false
  const { data } = await s.from('global_chat_bans').select('*').eq('email', email).limit(1)
  return !!data?.[0]
}

async function isChatOpen() {
  const s = svc()
  if (!s) return true
  const { data } = await s.from('global_chat_settings').select('value').eq('key', 'is_open').single()
  return data ? data.value === 'true' : true
}

export async function GET(req: Request){
  try{
    const s = svc()
    if (!s) return NextResponse.json({ items: [] })
    
    // Check if chat is open (optional for reading? "When closed: Customers can read messages but cannot send")
    // So reading is always allowed.
    
    const { data, error } = await s.from('global_chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      
    if (error) throw error
    
    // Reverse to show oldest first in UI if needed, but usually UI handles it.
    // Let's return as is (newest first).
    return NextResponse.json({ items: data || [] })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const b = await req.json().catch(()=>({}))
    const email = String(b?.email || '')
    const content = String(b?.content || '').trim()
    const name = String(b?.name || 'User')

    if (!email || !content) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    
    // 1. Check if chat is open
    const open = await isChatOpen()
    if (!open) return NextResponse.json({ error: 'Chat is currently closed' }, { status: 403 })

    // 2. Check active subscription
    const active = await isActive(email)
    if (!active) return NextResponse.json({ error: 'Active subscription required' }, { status: 403 })

    // 3. Check ban status
    const banned = await isBanned(email)
    if (banned) return NextResponse.json({ error: 'You are banned from the chat' }, { status: 403 })

    // 4. Save message
    const s = svc()
    if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    
    const { data, error } = await s.from('global_chat_messages').insert([{
      user_email: email,
      user_name: name,
      content: content
    }]).select().single()

    if (error) throw error

    return NextResponse.json({ ok: true, item: data })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
