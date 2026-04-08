import nodemailer from 'nodemailer'

type EmailConfig = {
  host: string
  port?: number | string
  user: string
  pass: string
  from?: string
}

async function sendWithConfig(config: EmailConfig, to: string, subject: string, body: string) {
  const host = String(config.host || '').trim()
  const port = Number(config.port || 465)
  const user = String(config.user || '').trim()
  const pass = String(config.pass || '').trim()
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transporter.sendMail({ from: config.from || user, to, subject, text: body })
}

export async function sendPlainTextEmail(to: string, subject: string, body: string, config?: Partial<EmailConfig>) {
  if (config?.host && config?.user && config?.pass) {
    await sendWithConfig(config as EmailConfig, to, subject, body)
    return
  }
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  await sendWithConfig({ host, port, user, pass, from: process.env.SMTP_FROM || user }, to, subject, body)
}

export function renewalEmailTemplate30Days() {
  return {
    subject: 'Friendly Reminder - Hosting Renewal',
    body:
`Hi there,

I hope you are doing well.

This is a friendly reminder that your hosted service is due to expire soon. To continue enjoying uninterrupted access, please send over your renewal payment.

Payment Method:
PayPal - Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

GBP 85 per year - Full access package.

Additional streams: GBP 20 each per extra stream.

If you do not wish to renew, please kindly let us know. Our slots are limited, and we have a number of people waiting to join.

Thank you,
Neo
Streamz R Us`
  }
}

export function renewalEmailTemplate7Days() {
  return {
    subject: 'Friendly Reminder - Hosting Renewal',
    body:
`Hi there,

I hope you are doing well.

This is a friendly reminder that your hosted service is due to expire soon. To continue enjoying uninterrupted access, please send over your renewal payment.

Payment Method:
PayPal - Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

GBP 85 per year - Full access package.

Additional streams: GBP 20 each per extra stream.

If you do not wish to renew, please kindly let us know. Our slots are limited, and we have a number of people waiting to join.

Thank you,
Neo
Streamz R Us`
  }
}

export function renewalEmailTemplate0Days() {
  return {
    subject: 'Your Hosting Service Has Ended - Renewal Required',
    body:
`Hi there,

I hope you are doing well.

Your hosted service has ended today. To restore access, please send over your renewal payment at your earliest convenience.

Payment Method:
PayPal - Streamzrus1@gmail.com

(Please send as Friends & Family)

Subscription Options:

GBP 85 per year - Full access package.

Additional streams: GBP 20 each per extra stream.

If you decide not to re-subscribe, please kindly let us know. Our slots are limited, and we currently have many people waiting to join.

Thank you,
Neo
Streamz R Us`
  }
}

export async function sendRenewalEmail(to: string, template?: { subject: string; body: string }) {
  const { subject, body } = template || renewalEmailTemplate7Days()
  await sendPlainTextEmail(to, subject, body)
}

export function transcodeWarningTemplate() {
  return {
    subject: 'Over Stream Warning - Concurrent Streams Notice',
    body:
`Hello,

We have detected that your account is using more than one stream at the same time. This is a breach of our Terms of Service.

Over-using streams puts extra strain on our servers because each user is assigned a capped bandwidth limit. When someone goes over that limit, it can cause buffering or performance issues for other users who are following the rules.
To prevent this, each account is allowed 1 stream only, unless additional streams are purchased.

Please either:

Stick to the 1-stream limit,
or

Purchase an extra stream if you need more than one device.

This is your final warning. We operate on a 2-strike policy, and any further violations may result in a temporary or permanent IP ban. Our data centres have become very strict about excessive usage, and we must enforce these rules for everyone's service quality.

Please reply to confirm you understand the rules and acknowledge this final warning.

Thank you,
Streamz R Us Support`
  }
}

export async function sendTranscodeWarning(to: string) {
  const { subject, body } = transcodeWarningTemplate()
  await sendPlainTextEmail(to, subject, body)
}

export function chargebackBanTemplate() {
  return {
    subject: 'Service Termination - Chargeback Notice',
    body:
`Hello,

We have received notice that a chargeback was initiated for your recent payment.

As a result, we can no longer provide you with service. Your account has been permanently terminated, and your IP address has been banned from our system effective immediately.

Chargebacks are taken very seriously and are considered a breach of our agreement. This decision is final and cannot be reversed.

Streamz R Us`
  }
}

export async function sendChargebackBanEmail(to: string) {
  const { subject, body } = chargebackBanTemplate()
  await sendPlainTextEmail(to, subject, body)
}

export function overStreamingWarningTemplate(input: {
  warningNumber: number
  maxWarnings?: number
  companyName?: string
}) {
  const warningNumber = Math.max(1, Number(input.warningNumber || 1))
  const maxWarnings = Math.max(warningNumber, Number(input.maxWarnings || 3))
  const companyName = String(input.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'

  return {
    subject: `Over-Streaming Warning ${warningNumber}/${maxWarnings}`,
    body: `Hello,

This is warning ${warningNumber} of ${maxWarnings} for streaming beyond the limits of your current package.

Your active streams have now been stopped. Please make sure your usage stays within the package you are paying for.

If you need additional screens, please purchase them through your account portal.

Continued over-streaming may lead to a full ban from the service.

Thank you,

${companyName}`,
  }
}

export function serviceBanTemplate(input?: {
  appealEmail?: string
  companyName?: string
}) {
  const appealEmail = String(input?.appealEmail || 'streamzrus1@gmail.com').trim() || 'streamzrus1@gmail.com'
  const companyName = String(input?.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'

  return {
    subject: 'Service Ban Notice',
    body: `Hello,

Your access to this service has been banned for failing to follow our terms of service.

Warnings have already been sent multiple times and this decision is now final.

If you wish to appeal this decision, please email:
${appealEmail}

Thank you,

${companyName}`,
  }
}

export function renderTemplate(template: string, vars: Record<string, unknown>) {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars || {})) {
    if (!k) continue
    if (v === null || v === undefined) continue
    normalized[k.toLowerCase()] = String(v)
  }
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, keyRaw) => {
    const key = String(keyRaw || '').toLowerCase()
    return normalized[key] ?? ''
  })
}

export async function sendCustomEmail(
  to: string[],
  subject: string | ((recipient: string) => string),
  body: string | ((recipient: string) => string)
) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  const from = process.env.SMTP_FROM || user

  const recipients = to.filter(Boolean)
  const BATCH_SIZE = 5
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((addr) =>
        transporter
          .sendMail({ from, to: addr, subject: typeof subject === 'function' ? subject(addr) : subject, text: typeof body === 'function' ? body(addr) : body })
          .catch((e: unknown) => console.error(`Failed to send to ${addr}:`, e))
      )
    )
  }
}
