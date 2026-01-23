import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key){
    try{
      const { cookies } = await import('next/headers')
      const raw = cookies().get('admin_conversations')?.value
      const list = raw ? JSON.parse(decodeURIComponent(raw)) : []
      return NextResponse.json(Array.isArray(list) ? list : [])
    } catch { return NextResponse.json([]) }
  }
  const supabase = createClient(url, key)
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
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
      const { customer_ip, metadata } = body || {}
      const row = { id: crypto.randomUUID(), status: 'active', customer_ip: customer_ip || null, metadata: metadata || {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), closed_at: null }
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
    let enrichedMetadata = { ...metadata }
    if (metadata?.email) {
      const { data: customer } = await supabase
        .from('customers')
        .select('plex_username, full_name, name')
        .eq('email', metadata.email)
        .single()
      
      if (customer) {
        enrichedMetadata = {
          ...enrichedMetadata,
          plex_username: customer.plex_username,
          full_name: customer.full_name || customer.name || enrichedMetadata.full_name
        }
      }
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ status: 'active', customer_ip, metadata: enrichedMetadata, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
