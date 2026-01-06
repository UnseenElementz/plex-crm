import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(){
    const s = svc()
    if (!s) return NextResponse.json({ is_open: true })
    const { data } = await s.from('global_chat_settings').select('value').eq('key', 'is_open').single()
    return NextResponse.json({ is_open: data ? data.value === 'true' : true })
}
