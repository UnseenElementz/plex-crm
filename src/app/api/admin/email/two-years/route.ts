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
 
 After sitting down with our data centre team and carefully going through all past payments, we’ve had to make some difficult but necessary decisions to ensure the long-term stability of the service for everyone.
 
 As stated previously, all lifetime payments will be honoured for 3 years, but this only applies to users who paid full price (£120 or more). Anyone who purchased a lifetime plan below that amount will receive 2 years, as extending it to 3 years would be unsustainable and put the platform at a loss.
 
 Before our current structure, Unseen ran some extremely cheap “lifetime” deals. Some users paid £50–£80 and were promised lifetime access. As much as we respect Unseen, those prices were never realistic. At £50 for lifetime service, we might as well have shut the doors. No platform can operate at a loss.
 
 We also originally assumed everyone had paid the proper full price for lifetime access. However, it turns out many users paid heavily discounted, very low amounts. Extending these plans to 3 years would compromise the stability of the service and directly affect all users. We are committed to keeping the platform strong, reliable, and sustainable — and that means making decisions that protect the entire community.
 
 It’s important to note that most providers only honour “lifetime” until the server dies or goes offline. That’s the industry standard. And as many of you know, we’ve had 2–3 servers go down in the past. If this were any other platform, they would have simply started fresh with new clients and left previous users behind. 
 We chose to be transparent and rebuild properly, even when it meant extra work, cost, and time.
 
 For those arguing that 3 years isn’t fair after paying £150, let’s break it down:
 £150 over 3 years = £4.17 per month.
 Even if the plan were extended to 3 years, this is still far below what any service of this scale could operate on.
 
 If someone feels our service, content collection, stability, and support are only worth £4–£6 a month, then respectfully — they’re welcome to find another provider. We’re not Netflix with a billion-pound budget, yet our platform outperforms most services out there. We’ve invested thousands into improvements, infrastructure, and new features. Sustainability matters.
 
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
