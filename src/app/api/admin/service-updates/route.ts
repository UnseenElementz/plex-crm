import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getSupabaseSvc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(){
  try{
    const svc = getSupabaseSvc()
    if (!svc) return NextResponse.json({ error: 'Supabase is required for service updates' }, { status: 503 })
    const { data, error } = await svc
      .from('service_updates')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message || 'Failed to load updates' }, { status: 500 })
    return NextResponse.json({ updates: data || [] })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to load updates' }, { status: 500 })
  }
}

export async function POST(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(()=>({}))
    const title = (body?.title || '').trim()
    const content = (body?.content || '').trim()
    if (!title || !content) return NextResponse.json({ error: 'title and content required' }, { status: 400 })

    const now = new Date().toISOString()
    const svc = getSupabaseSvc()
    if (!svc) return NextResponse.json({ error: 'Supabase is required for service updates' }, { status: 503 })
    const { data, error } = await svc
      .from('service_updates')
      .insert([{ title, content, created_at: now }])
      .select('*')
      .single()
    if (error || !data) return NextResponse.json({ error: error?.message || 'Failed to save update' }, { status: 500 })
    return NextResponse.json({ ok: true, update: data })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to save update' }, { status: 500 })
  }
}

export async function DELETE(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    let id = url.searchParams.get('id') || ''
    if (!id){
      try{ const body = await request.json(); id = (body?.id || '').trim() } catch { /* ignore */ }
    }
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const svc = getSupabaseSvc()
    if (!svc) return NextResponse.json({ error: 'Supabase is required for service updates' }, { status: 503 })
    const { error } = await svc.from('service_updates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message || 'Failed to delete update' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to delete update' }, { status: 500 })
  }
}

