import fs from 'fs'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

function loadEnvFromDotEnvLocal() {
  try {
    const content = fs.readFileSync('.env.local', 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '')
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {}
}

async function getSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env')
  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('admin_settings').select('*').single()
  if (error) throw error
  return data || {}
}

function createTransportFromSettings(settings) {
  const host = settings?.smtp_host
  const port = Number(settings?.smtp_port || 587)
  const user = settings?.smtp_user
  const pass = String(settings?.smtp_pass || '').replace(/\s+/g, '')
  if (!host || !user || !pass) throw new Error('SMTP not configured')
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
}

function renewalEmailTemplate() {
  return {
    subject: 'Your Plex subscription is running out soon',
    body:
      'Your Plex sub is running out soon, please re-sub.\n' +
      'Send payment to: streamzsrus1@gmail.com\n' +
      '(PLEASE NOTE: VERY IMPORTANT — PLEASE SEND AS FRIENDS AND FAMILY PAYMENT OR WE WILL NOT ACCEPT AND WE WILL REFUND, WHICH WILL SLOW DOWN THE PROCESS.)'
  }
}

async function main() {
  loadEnvFromDotEnvLocal()
  const settings = await getSettings()
  const transporter = createTransportFromSettings(settings)
  const to = settings.smtp_from || settings.smtp_user

  // Contact Support test
  const contactSubject = '[Automated Support Test] Email Support'
  const contactText = 'This is a test of the contact support email pipeline.'
  await transporter.sendMail({ from: to, to, replyTo: 'support-test@example.com', subject: contactSubject, text: contactText })
  console.log('Contact support email sent OK')

  // Renewal Reminder test to admin inbox
  const { subject, body } = renewalEmailTemplate()
  await transporter.sendMail({ from: to, to, subject, text: body })
  console.log('Renewal reminder email sent OK')

  // Expired Reminder test to admin inbox
  const expiredSubject = 'Your Plex Service Has Ended – Renewal Required'
  const expiredText = `Hi there,

I hope you’re doing well.

Your Plex service has ended today. To restore access, please send over your renewal payment at your earliest convenience.

Payment Method:
PayPal – Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

£85 per year – Full access to all 4K HDR/DV content, 1080p movies & TV shows, and international sports.

Additional streams: £20 each per extra stream.

If you decide not to re-subscribe, please kindly let us know. Our slots are limited, and we currently have many people waiting to join.

Thank you,
Neo
Streamz R Us`
  await transporter.sendMail({ from: to, to, subject: expiredSubject, text: expiredText })
  console.log('Expired reminder email sent OK')
}

main().catch(err => {
  console.error('Email test failed:', err?.message || err)
  process.exit(1)
})
