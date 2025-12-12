import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendCustomEmail } from '@/lib/email'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  try{
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const supabase = svc()
    let settings: any = null
    try{
      if (supabase){
        const { data } = await supabase.from('admin_settings').select('*').single()
        settings = data || null
      }
    } catch {}
    if (!settings){
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    }
    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass){
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }

    const subject = 'SERVICE UPDATE – IMPORTANT INFORMATION REGARDING LIFETIME PAYMENTS'
    const body = `SERVICE UPDATE – IMPORTANT INFORMATION REGARDING LIFETIME PAYMENTS

We need to clear up an ongoing issue around lifetime subscriptions.

As stated previously, all lifetime payments will be honoured for 3 years, but this only applies to users who paid over £100. Anyone who purchased a lifetime plan below that amount cannot be included — it simply isn’t fair or sustainable.

Before our current structure, Unseen ran some extremely cheap “lifetime” deals. Some users paid £50–£80 and were promised lifetime access. As much as we respect Unseen, those prices were never realistic. At £50 for lifetime service, we might as well shut the doors. No platform can operate at a loss.

For those arguing that 3 years isn’t fair after paying £80, let’s break it down:
£80 over 3 years = just £2 a month.

If someone believes our service, content collection, stability, and support are only worth £2 a month, then respectfully — they’re welcome to find another provider. We’re not spending hours maintaining servers, fixing issues, and upgrading systems for pocket change. We’re not Netflix with a billion-pound budget, yet our platform outperforms most services out there. We’ve invested thousands into improvements, infrastructure, and features. Sustainability matters.

To address another issue: we’ve received reports of users sharing and promoting other platforms within our Discord. This will not be tolerated. Anyone doing this will be identified and permanently banned. We want a solid, loyal community — not people who take from our service while pushing others elsewhere.

Big things are coming. This platform has received real investment, and we’re only just getting started.

Thank you to those who genuinely support us.
Loyal users will always be looked after.

– Tank, Lead Developer`

    const originalEnv = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_FROM: process.env.SMTP_FROM
    }
    process.env.SMTP_HOST = settings.smtp_host
    process.env.SMTP_PORT = settings.smtp_port || '587'
    process.env.SMTP_USER = settings.smtp_user
    process.env.SMTP_PASS = String(settings.smtp_pass || '').replace(/\s+/g, '')
    process.env.SMTP_FROM = settings.smtp_from || settings.smtp_user
    try{
      await sendCustomEmail([email], subject, body)
      return NextResponse.json({ ok: true })
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
