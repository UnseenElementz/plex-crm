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
    subject: 'Transcode Warning – Stream Usage Policy',
    body:
`Hello,

This is a courtesy warning that your current plan only supports a specific number of concurrent streams, and it appears you are exceeding that limit. This is a violation of our server rules.

Please ensure you remain within the number of streams included in your plan. If you require additional streams, let us know and we can arrange an upgrade.

If the misuse continues, disconnection may occur and no refund will be issued.

If you need any assistance, we are here to help.

Thank you,
Streamz R Us`
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

export async function sendCustomEmail(to: string[], subject: string, body: string) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  const from = process.env.SMTP_FROM || user
  for (const addr of to.filter(Boolean)) {
    await transporter.sendMail({ from, to: addr, subject, text: body })
  }
}
