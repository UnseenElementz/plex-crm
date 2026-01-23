import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(request: Request){
  if (cookies().get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

  const supabase = createClient(url, key)
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  return NextResponse.json({
    plex_username: data.plex_username,
    full_name: data.full_name || data.name,
    status: data.status || data.subscription_status
  })
}
