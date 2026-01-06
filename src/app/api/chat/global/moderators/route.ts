import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(){
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const s = svc()
    if (!s) return NextResponse.json({ items: [] })
    const { data } = await s.from('global_chat_moderators').select('*').order('added_at', { ascending: false })
    return NextResponse.json({ items: data || [] })
}

export async function POST(req: Request){
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const b = await req.json().catch(()=>({}))
    const email = b.email
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const s = svc()
    if (s) await s.from('global_chat_moderators').upsert({ email })
    return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request){
    const isAdmin = cookies().get('admin_session')?.value === '1'
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const url = new URL(req.url)
    const email = url.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const s = svc()
    if (s) await s.from('global_chat_moderators').delete().eq('email', email)
    return NextResponse.json({ ok: true })
}
