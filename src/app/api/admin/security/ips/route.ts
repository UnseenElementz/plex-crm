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
    let settings: any = null
    try{ if (s){ const { data } = await s.from('admin_settings').select('*').single(); settings = data || null } } catch{}
    if (!settings){
      const raw = cookies().get('admin_settings')?.value
      settings = raw ? JSON.parse(decodeURIComponent(raw)) : {}
    }
    const ip_logs = (settings as any)?.ip_logs || {}
    const blocked_ips = (settings as any)?.blocked_ips || []
    return NextResponse.json({ ip_logs, blocked_ips })
  } catch(e:any){ return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 }) }
}

export const runtime = 'nodejs'
