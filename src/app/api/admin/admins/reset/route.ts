import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  const s = svc()
  if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  try{
    const { email, newPassword } = await request.json().catch(()=>({}))
    if (!email || !newPassword) return NextResponse.json({ error: 'email and newPassword required' }, { status: 400 })
    const admin = (s as any).auth?.admin
    if (!admin) return NextResponse.json({ error: 'admin auth not available' }, { status: 500 })
    let userId: string | null = null
    try{
      const list = await admin.listUsers({ page: 1, perPage: 200 })
      userId = (list?.data?.users || []).find((u:any)=> (u.email || '').toLowerCase() === String(email).toLowerCase())?.id || null
    } catch{}
    if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 })
    await admin.updateUserById(userId, { password: newPassword })
    return NextResponse.json({ ok: true })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
