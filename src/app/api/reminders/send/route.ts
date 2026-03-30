import { NextResponse } from 'next/server'
import { sendRenewalEmail } from '@/lib/email'
import { format } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import { calculatePrice } from '@/lib/pricing'

export async function POST(request: Request){
  const { email, preview } = await request.json()
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
    
    if (!preview && (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass)) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }

    const { data: customers } = await supabase
      .from('customers')
      .select('next_due_date,next_payment_date,subscription_status,status,plan,subscription_type,streams,notes,full_name,name')
      .eq('email', email)
      .limit(1)
    const customer = customers?.[0]
    const dueDate = customer?.next_due_date || customer?.next_payment_date
    const formattedDate = dueDate ? format(new Date(dueDate), 'dd MMM yyyy') : null
    const isInactive = (customer?.status === 'inactive' || customer?.subscription_status === 'inactive')
    const plan = (customer?.plan || customer?.subscription_type || 'yearly') as 'monthly'|'yearly'
    const streams = Number(customer?.streams || 1)
    const downloads = /Downloads:\s*Yes/i.test(String(customer?.notes || ''))
    const pricingConfig = {
      monthly_price: Number(settings?.monthly_price) || 15,
      yearly_price: Number(settings?.yearly_price) || 85,
      stream_monthly_price: Number(settings?.stream_monthly_price) || 5,
      stream_yearly_price: Number(settings?.stream_yearly_price) || 20,
      downloads_price: Number(settings?.downloads_price) || 20
    }
    const amount = calculatePrice(plan, streams, pricingConfig, downloads)
    const pkgName = plan === 'yearly' ? 'Yearly' : 'Monthly'
    const extras = Math.max(0, streams - 1)
    const detailsBlock = [
      `Plan: ${pkgName}`,
      `Streams: ${streams}${extras > 0 ? ` (includes 1 + ${extras} extra)` : ''}`,
      `Downloads: ${downloads ? 'Yes' : 'No'}`,
      `Amount Due: £${amount.toFixed(2)}`,
      formattedDate ? `Due Date: ${formattedDate}` : null
    ].filter(Boolean).join('\n')
    
    let emailBody = `I hope you’re doing well.

This is a friendly reminder that your Plex service is coming up for renewal${formattedDate ? ' on ' + formattedDate : ''}. We send renewal emails well in advance so you have plenty of time to renew without any pressure.

Account Summary
${detailsBlock}

However, with how quickly the server is growing at the moment, we strongly recommend renewing before your expiry date to avoid the risk of losing your slot, as availability is limited.

Please note: we no longer offer monthly subscriptions — all plans are now yearly only.

💳 Payment Method

PayPal: Streamzrus1@gmail.com
(Please send as Friends & Family)

📺 Subscription Options

£85 per year – Includes full access to:

All 4K HDR / Dolby Vision content

1080p movies & TV shows

International sports

Additional streams: £20 per extra stream (allows multiple devices to watch at the same time).

⬇️ New: Downloads Option

We’ve also added a downloads feature for anyone who needs it:

£20 add-on

Ideal for travelling and saving mobile data

🌐 Account & Renewal Info

You can check your renewal date, payment instructions, and manage your account directly on our website:
http://plex-crm.vercel.app

Simply register or log in if you already have an account.

If you do not wish to renew, please let us know. Our slots are limited, and we currently have people waiting to join.

Thank you for your continued support.

Kind regards,
Neo
Streamz R Us`

    if (isInactive) {
      emailBody = `I hope you’re doing well.

We noticed that your Plex service is currently marked as INACTIVE. If you wish to restore access, please renew your subscription.

${formattedDate ? 'Your service expired on: ' + formattedDate + '\n\n' : ''}To reactivate your account, please see the payment details below:

Account Summary
${detailsBlock}

Please note: we no longer offer monthly subscriptions — all plans are now yearly only.

💳 Payment Method

PayPal: Streamzrus1@gmail.com
(Please send as Friends & Family)

📺 Subscription Options

£85 per year – Includes full access to:

All 4K HDR / Dolby Vision content

1080p movies & TV shows

International sports

Additional streams: £20 per extra stream (allows multiple devices to watch at the same time).

⬇️ New: Downloads Option

We’ve also added a downloads feature for anyone who needs it:

£20 add-on

Ideal for travelling and saving mobile data

🌐 Account & Renewal Info

You can manage your account directly on our website:
http://plex-crm.vercel.app

Simply register or log in if you already have an account.

If you do not wish to renew, please let us know so we can remove your account to free up space.

Thank you,
Neo
Streamz R Us`
    }

    const template = {
      subject: isInactive ? 'Service Inactive - Renewal Required' : 'Plex Renewal Reminder',
      body: emailBody
    }
    
    // Preview mode: return template without sending
    if (preview) {
      return NextResponse.json({ ok: true, preview: { subject: template.subject, body: template.body } })
    }
    
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
      await sendRenewalEmail(email, template)
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
