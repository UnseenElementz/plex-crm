import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request){
  if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const supabase = createClient(url, key)
  try{
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
    const type = (file.type || '').toLowerCase()
    if (!(type.includes('audio/mpeg') || type.includes('audio/mp3'))) return NextResponse.json({ error: 'Only MP3 allowed' }, { status: 400 })
    const name = `bg-music/${Date.now()}_${(file.name || 'music.mp3').replace(/[^a-zA-Z0-9.-]/g,'_')}`
    try{ await supabase.storage.createBucket('site-assets', { public: true }) } catch{}
    const { data, error } = await supabase.storage.from('site-assets').upload(name, file, { contentType: file.type, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { data: pub } = supabase.storage.from('site-assets').getPublicUrl(data.path)
    return NextResponse.json({ url: pub.publicUrl })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

