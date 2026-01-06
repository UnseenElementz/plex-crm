import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'chat-attachments'
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])

function sanitize(name: string){
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(request: Request){
  try{
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    const supabase = createClient(url, key)
    
    const form = await request.formData()
    const file = form.get('file') as unknown as File | null
    const conversationId = String(form.get('conversationId') || '').trim()
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    
    const type = (file.type || '').toLowerCase()
    const size = (file as any).size as number
    if (!ALLOWED.has(type)) return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    if (size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    
    try { await supabase.storage.createBucket(BUCKET, { public: true }) } catch {}
    
    const name = `${conversationId}/${Date.now()}_${sanitize((file as any).name || 'upload')}`
    const { data, error } = await supabase.storage.from(BUCKET).upload(name, file as any, { contentType: type, upsert: false, cacheControl: '3600' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
    return NextResponse.json({ 
      url: pub.publicUrl, 
      fileName: (file as any).name || 'upload', 
      fileSize: size, 
      fileType: type 
    })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}

