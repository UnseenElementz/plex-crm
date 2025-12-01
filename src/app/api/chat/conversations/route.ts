import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
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
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const supabase = createClient(url, key)
  try {
    const body = await request.json()
    const { customer_ip, metadata } = body || {}
    const { data, error } = await supabase
      .from('conversations')
      .insert({ status: 'active', customer_ip, metadata, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
