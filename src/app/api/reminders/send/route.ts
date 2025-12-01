import { NextResponse } from 'next/server'
import { sendRenewalEmail, renewalEmailTemplate0Days, renewalEmailTemplate7Days, renewalEmailTemplate30Days } from '@/lib/email'
import { differenceInDays } from 'date-fns'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request){
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  
  try {
    // Get settings from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('*')
      .single()
    
    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }

    const { data: customers } = await supabase.from('customers').select('next_due_date,next_payment_date').eq('email', email).limit(1)
    const customer = customers?.[0]
    const dueDate = customer?.next_due_date || customer?.next_payment_date
    const daysLeft = dueDate ? differenceInDays(new Date(dueDate), new Date()) : null
    const tpl = (daysLeft === 30) ? renewalEmailTemplate30Days() : (daysLeft === 7) ? renewalEmailTemplate7Days() : (daysLeft !== null && daysLeft <= 0) ? renewalEmailTemplate0Days() : renewalEmailTemplate7Days()
    
    // Temporarily set environment variables for the email function
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
    process.env.SMTP_PASS = (settings.smtp_pass || '').replace(/\s+/g, '')
    process.env.SMTP_FROM = settings.smtp_from || settings.smtp_user
    
    try {
      await sendRenewalEmail(email, tpl)
      return NextResponse.json({ ok: true })
    } finally {
      // Restore original environment variables
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value
        } else {
          delete process.env[key]
        }
      })
    }
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}
