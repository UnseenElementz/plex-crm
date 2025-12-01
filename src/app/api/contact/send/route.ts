import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request){
  try{
    const { email, subject, message } = await request.json()
    if (!email || !subject || !message) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: settings } = await supabase.from('admin_settings').select('*').single()
    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: Number(settings.smtp_port || 587),
      secure: Number(settings.smtp_port || 587) === 465,
      auth: { user: settings.smtp_user, pass: String(settings.smtp_pass || '').replace(/\s+/g, '') }
    })
    const to = settings.smtp_from || settings.smtp_user
    await transporter.sendMail({
      from: to,
      to,
      replyTo: email,
      subject: `[Customer Contact] ${subject}`,
      text: `From: ${email}\n\n${message}`
    })
    return NextResponse.json({ ok: true })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}
