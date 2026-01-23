import { NextResponse } from 'next/server'
import { sendChargebackBanEmail } from '@/lib/email'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request){
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { data: settings } = await supabase.from('admin_settings').select('*').single()
    if (!settings?.smtp_host) return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })

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
      await sendChargebackBanEmail(email)
      
      // Also block user in chat and mark as inactive
      const { data: cust } = await supabase.from('customers').select('id').eq('email', email).single()
      if (cust) {
          await supabase.from('customers').update({ status: 'banned', notes: 'BANNED - Chargeback' }).eq('id', cust.id)
      }
      
      // Ban from global chat
      await supabase.from('global_chat_bans').upsert({ email, reason: 'Chargeback', banned_at: new Date().toISOString() })

      return NextResponse.json({ ok: true })
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}
