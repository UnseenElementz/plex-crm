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
    const body = await request.json().catch(()=>({}))
    const email = String(body?.email || '').trim()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    let settings: any = null
    try{
      const s = svc()
      if (s){
        const { data } = await s.from('admin_settings').select('*').single()
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

    const subject = 'Plex Invite Sent — Setup Instructions'
    const bodyText = `Invite has been sent. If you’re having any trouble, we’re live on the website chat — but it’s all pretty straightforward.

Check your email and accept the Plex invitation.

Once accepted, restart your Plex device.

If you’re using 4K, do the following inside Plex settings:

Go to Video Settings

Turn Auto Quality Suggestions OFF (untick it)

Go to Remote Quality / Internet Quality

Set it to Original or Maximum
(If you don’t see it straight away, scroll UP — sometimes Plex hides it above the list for no reason.)

After that, you’re fully set up.
You’ll get a reminder email in a year — hopefully by then PayPal on the website will be behaving so renewals are nice and easy.

Thanks for joining Streamz R Us.
The rest don’t even come close. 😎
Tank- Developer`

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
      await sendCustomEmail([email], subject, bodyText)
      return NextResponse.json({ ok: true })
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
