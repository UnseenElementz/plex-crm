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
  try{
    const s = svc()
    if (s){
      const { data, error } = await s.from('recommendations').select('*').order('created_at', { ascending: false })
      if (!error) return NextResponse.json({ items: data || [] })
    }
    const jar = cookies(); const raw = jar.get('recommendations')?.value
    const items = raw ? JSON.parse(decodeURIComponent(raw)) : []
    return NextResponse.json({ items })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const b = await req.json().catch(()=>({}))
    const payload = {
      id: crypto.randomUUID(),
      url: String(b?.url || ''),
      title: String(b?.title || ''),
      description: String(b?.description || ''),
      image: String(b?.image || ''),
      submitter_email: String(b?.email || ''),
      created_at: new Date().toISOString()
    }
    if (!payload.url || !payload.title) return NextResponse.json({ error: 'url and title required' }, { status: 400 })
    const s = svc()
    if (s){
      const { data, error } = await s.from('recommendations').insert([payload]).select('*').single()
      if (!error) return NextResponse.json({ ok: true, item: data })
    }
    const jar = cookies(); const raw = jar.get('recommendations')?.value
    const items = raw ? JSON.parse(decodeURIComponent(raw)) : []
    items.unshift(payload)
    const res = NextResponse.json({ ok: true, item: payload })
    res.headers.set('Set-Cookie', `recommendations=${encodeURIComponent(JSON.stringify(items))}; Path=/; Max-Age=31536000`)
    return res
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
