import nodemailer from 'nodemailer'

export function renewalEmailTemplate30Days() {
  return {
    subject: 'Friendly Reminder – Plex Subscription Renewal',
    body:
`Hi there,

I hope you’re doing well.

This is a friendly reminder that your Plex service is about to expire. To continue enjoying uninterrupted access, please send over your renewal payment.

Payment Method:
PayPal – Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

£85 per year – Includes full access to all 4K HDR/DV content, 1080p movies & TV shows, and international sports.

Additional streams: £20 each per extra stream.

If you do not wish to renew, please kindly let us know. Our slots are limited, and we have a number of people waiting to join.

Thank you,
Neo
Streamz R Us`
  }
}

export function renewalEmailTemplate7Days() {
  return {
    subject: 'Friendly Reminder – Plex Subscription Renewal',
    body:
`Hi there,

I hope you’re doing well.

This is a friendly reminder that your Plex service is about to expire. To continue enjoying uninterrupted access, please send over your renewal payment.

Payment Method:
PayPal – Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

£85 per year – Includes full access to all 4K HDR/DV content, 1080p movies & TV shows, and international sports.

Additional streams: £20 each per extra stream.

If you do not wish to renew, please kindly let us know. Our slots are limited, and we have a number of people waiting to join.

Thank you,
Neo
Streamz R Us`
  }
}

export function renewalEmailTemplate0Days() {
  return {
    subject: 'Your Plex Service Has Ended – Renewal Required',
    body:
`Hi there,

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
  }
}

export async function sendRenewalEmail(to: string, template?: { subject: string; body: string }) {
  const { subject, body } = template || renewalEmailTemplate7Days()
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transporter.sendMail({ from: process.env.SMTP_FROM || user, to, subject, text: body })
}

export function transcodeWarningTemplate() {
  return {
    subject: 'Over Stream Warning – Concurrent Streams Notice',
    body:
`Hello,

We’ve detected that your account is using more than one stream at the same time. This is a breach of our Terms of Service.

Over-using streams puts extra strain on our servers because each user is assigned a capped bandwidth limit. When someone goes over that limit, it can cause buffering or performance issues for other users who are following the rules.
To prevent this, each account is allowed 1 stream only, unless additional streams are purchased.

Please either:

Stick to the 1-stream limit,
or

Purchase an extra stream if you need more than one device.

This is your final warning. We operate on a 2-strike policy, and any further violations may result in a temporary or permanent IP ban. Our datacentres have become very strict about excessive usage, and we must enforce these rules for everyone’s service quality.

Please reply to confirm you understand the rules and acknowledge this last warning.

Thank you,
Streamz R Us Support`
  }
}

export async function sendTranscodeWarning(to: string) {
  const { subject, body } = transcodeWarningTemplate()
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transporter.sendMail({ from: process.env.SMTP_FROM || user, to, subject, text: body })
}

export function chargebackBanTemplate() {
  return {
    subject: 'Service Termination – Chargeback Notice',
    body:
`Hello,

We have received notice that a chargeback was initiated for your recent payment.

As a result, we can no longer provide you with service. Your account has been permanently terminated, and your IP address has been banned from our system effective immediately.

Chargebacks are taken very seriously and are considered a breach of our agreement. This decision is final and cannot be reversed.

Tank | Developer`
  }
}

export async function sendChargebackBanEmail(to: string) {
  const { subject, body } = chargebackBanTemplate()
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transporter.sendMail({ from: process.env.SMTP_FROM || user, to, subject, text: body })
}

export async function sendCustomEmail(to: string[], subject: string, body: string) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  const from = process.env.SMTP_FROM || user
  
  const recipients = to.filter(Boolean)
  // Send in batches of 5 to reuse transport but speed up sending
  const BATCH_SIZE = 5
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(addr => 
      transporter.sendMail({ from, to: addr, subject, text: body }).catch((e: unknown) => console.error(`Failed to send to ${addr}:`, e))
    ))
  }
}
