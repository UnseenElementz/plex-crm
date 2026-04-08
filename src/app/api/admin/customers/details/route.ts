import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getVisibleCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { buildReferralCode } from '@/lib/referrals'

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
    .select('name,email,subscription_type,streams,next_payment_date,subscription_status,notes')
    .eq('email', email)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const notes = String((data as any).notes || '')
  const parsedNotes = parseCustomerNotes(notes)
  let ipLogs: Record<string, string[]> = {}
  let blockedIps: string[] = []
  try {
    const { data: settings } = await supabase.from('admin_settings').select('ip_logs,blocked_ips').eq('id', 1).maybeSingle()
    ipLogs = (settings?.ip_logs || {}) as Record<string, string[]>
    blockedIps = Array.isArray(settings?.blocked_ips) ? settings?.blocked_ips : []
  } catch {}
  const customerIps = Array.isArray(ipLogs[email]) ? ipLogs[email] : []
  return NextResponse.json({
    plex_username: parsedNotes.plexUsername,
    full_name: (data as any).name || '',
    status: (data as any).subscription_status || 'inactive',
    subscription_type: (data as any).subscription_type || '',
    streams: (data as any).streams || 1,
    next_payment_date: (data as any).next_payment_date || null,
    notes: getVisibleCustomerNotes(notes),
    referral_code: buildReferralCode(String((data as any).email || email)),
    referral_credit: parsedNotes.referralCredit,
    referred_by: parsedNotes.referredBy || null,
    ip_history: customerIps,
    blocked_ips: blockedIps
  })
}
