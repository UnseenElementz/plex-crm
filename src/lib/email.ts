import nodemailer from 'nodemailer'

export type EmailAttachment = {
  filename: string
  content: Buffer
  contentType?: string
  cid?: string
}

export type EmailConfig = {
  host: string
  port?: number | string
  user: string
  pass: string
  from?: string
  tlsRejectUnauthorized?: boolean
}

type SendCustomEmailResult = {
  attempted: number
  sent: number
  failed: number
  failures: Array<{ recipient: string; error: string }>
}

function envBool(key: string, fallback = true) {
  const value = String(process.env[key] || '').replace(/\\r\\n/g, '').replace(/[\r\n]+/g, '').trim().toLowerCase()
  if (!value) return fallback
  return value === 'true'
}

function normalizeEnvString(value: unknown) {
  return String(value || '').replace(/\\r\\n/g, '').replace(/[\r\n]+/g, '').trim()
}

function normalizeSecret(value: unknown) {
  return normalizeEnvString(value).replace(/\s+/g, '')
}

function resolveConfig(config?: Partial<EmailConfig> | null): EmailConfig | null {
  if (!config?.host || !config?.user || !config?.pass) return null
  const host = normalizeEnvString(config.host)
  const port = Number(config.port || 465)
  const user = normalizeEnvString(config.user)
  const pass = normalizeSecret(config.pass)
  if (!host || !user || !pass) return null
  return {
    host,
    port,
    user,
    pass,
    from: normalizeEnvString(config.from || user) || user,
    tlsRejectUnauthorized: config.tlsRejectUnauthorized,
  }
}

export function getSmtpConfigFromEnv(): EmailConfig | null {
  return resolveConfig({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    tlsRejectUnauthorized: envBool('SMTP_TLS_REJECT_UNAUTHORIZED', true),
  })
}

export function getSmtpConfigFromSettings(settings: any): EmailConfig | null {
  return resolveConfig({
    host: settings?.smtp_host,
    port: settings?.smtp_port || 465,
    user: settings?.smtp_user,
    pass: settings?.smtp_pass,
    from: settings?.smtp_from || settings?.smtp_user,
    tlsRejectUnauthorized: envBool('SMTP_TLS_REJECT_UNAUTHORIZED', true),
  })
}

export function smtpConfigsMatch(a?: Partial<EmailConfig> | null, b?: Partial<EmailConfig> | null) {
  const left = resolveConfig(a)
  const right = resolveConfig(b)
  if (!left || !right) return false
  return left.host === right.host && left.port === right.port && left.user === right.user && left.pass === right.pass && normalizeEnvString(left.from) === normalizeEnvString(right.from)
}

export function isLikelySmtpAuthError(error: unknown) {
  const message = String(error || '').toLowerCase()
  return (
    message.includes('invalid login') ||
    message.includes('username and password not accepted') ||
    message.includes('badcredentials') ||
    message.includes('auth plain') ||
    message.includes('eauth')
  )
}

function createTransport(config: EmailConfig) {
  const host = normalizeEnvString(config.host)
  const port = Number(config.port || 465)
  const user = normalizeEnvString(config.user)
  const pass = normalizeSecret(config.pass)
  if (!host || !user || !pass) throw new Error('SMTP config missing')
  return nodemailer.createTransport({
    host,
    port,
    pool: true,
    maxConnections: 1,
    maxMessages: Infinity,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: config.tlsRejectUnauthorized !== false },
  })
}

async function sendWithConfig(config: EmailConfig, to: string, subject: string, body: string, attachments?: EmailAttachment[]) {
  const transporter = createTransport(config)
  const user = normalizeEnvString(config.user)
  await transporter.sendMail({
    from: normalizeEnvString(config.from || user),
    to,
    subject,
    text: body,
    attachments: attachments && attachments.length ? attachments : undefined,
  })
}

export async function sendPlainTextEmail(to: string, subject: string, body: string, config?: Partial<EmailConfig>, attachments?: EmailAttachment[]) {
  const resolved = resolveConfig(config) || getSmtpConfigFromEnv()
  if (!resolved) throw new Error('SMTP config missing')
  await sendWithConfig(resolved, to, subject, body, attachments)
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

export function videoTranscodeWarningTemplate(input?: {
  companyName?: string
}) {
  const companyName = String(input?.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'
  return {
    subject: 'Plex Quality Settings Advice',
    body:
`Hello,

Our system has noticed that your stream is video transcoding, which usually means Plex is playing at a lower quality than the original file.

If you want full quality playback, and especially if you want 4K content to work properly, please go into Plex settings and update the following:

Video
Remote Quality
Set quality to Maximum or Original
Turn Quality Suggestions off

If your internet connection is on the lower side, you are allowed to lower the quality in settings when needed. Just note that 4K will not work properly when quality is forced lower.

Thanks for being a member.

${companyName}`
  }
}

export async function sendTranscodeWarning(to: string) {
  const { subject, body } = videoTranscodeWarningTemplate()
  await sendPlainTextEmail(to, subject, body)
}

export function overDownloadWarningTemplate(input?: {
  companyName?: string
}) {
  const companyName = String(input?.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'

  return {
    subject: 'Download Limit Notice',
    body:
`Hello,

Our system has noticed more than 2 downloads running at the same time on your account.

To keep the service stable for everyone, please keep downloads to a maximum of 2 at one time.

If extra downloads are left running in the background, please pause or cancel the additional ones before starting more.

Thanks for being a member.

${companyName}`,
  }
}

export async function sendOverDownloadWarning(to: string, input?: { companyName?: string }) {
  const { subject, body } = overDownloadWarningTemplate(input)
  await sendPlainTextEmail(to, subject, body)
}

export function streamKilledTemplate(input: {
  companyName?: string
  reason: string
}) {
  const companyName = String(input.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'
  const reason = String(input.reason || '').trim()

  return {
    subject: 'Your Stream Was Stopped',
    body: `Hello,

Your active Plex stream has been stopped by ${companyName}.

Reason:
${reason || 'No reason provided.'}

If you need to continue watching, please fix the issue above before starting playback again.

Thank you,

${companyName}`,
  }
}

export async function sendStreamKilledEmail(
  to: string,
  input: {
    companyName?: string
    reason: string
  }
) {
  const { subject, body } = streamKilledTemplate(input)
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

export function timeWasterBanTemplate(input?: {
  appealEmail?: string
  companyName?: string
  loginUrl?: string
  banPageUrl?: string
}) {
  const appealEmail = String(input?.appealEmail || 'streamzrus1@gmail.com').trim() || 'streamzrus1@gmail.com'
  const companyName = String(input?.companyName || 'STREAMZ R US').trim() || 'STREAMZ R US'
  const loginUrl = String(input?.loginUrl || '').trim()
  const banPageUrl = String(input?.banPageUrl || '').trim()

  return {
    subject: 'Community Access Update',
    body: `Hi,

Thank you for your interest.

As we move towards a more closed community, we are keeping access focused on our current customers and future joins will be handled much more selectively through invite codes from existing members.

Because of the volume of requests we receive, and the amount of time that can be lost in long back-and-forth conversations over weeks or months, we are not able to continue with this enquiry or offer access.

This may simply come down to timing and capacity on our side, but we do need to keep things moving and cannot keep open requests running indefinitely.

${banPageUrl ? `You can view the website status here:\n${banPageUrl}\n` : ''}${loginUrl ? `Website login:\n${loginUrl}\n` : ''}
We are sorry to disappoint and hope you find another server that suits you well.

If you believe this was sent in error, you may contact:
${appealEmail}

Kind regards,
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
  body: string | ((recipient: string) => string),
  attachments?: EmailAttachment[],
  config?: Partial<EmailConfig>
) : Promise<SendCustomEmailResult> {
  const resolved = resolveConfig(config) || getSmtpConfigFromEnv()
  if (!resolved) throw new Error('SMTP config missing')
  const transporter = createTransport(resolved)
  const from = normalizeEnvString(resolved.from || resolved.user)

  const recipients = to.filter(Boolean)
  const failures: Array<{ recipient: string; error: string }> = []
  let sent = 0
  try {
    for (const addr of recipients) {
      const result = await transporter
        .sendMail({
          from,
          to: addr,
          subject: typeof subject === 'function' ? subject(addr) : subject,
          text: typeof body === 'function' ? body(addr) : body,
          attachments: attachments && attachments.length ? attachments : undefined,
        })
        .then(() => ({ recipient: addr, ok: true as const }))
        .catch((e: unknown) => {
          const error = e instanceof Error ? e.message : 'Unknown SMTP error'
          console.error(`Failed to send to ${addr}:`, e)
          return { recipient: addr, ok: false as const, error }
        })

      if (result.ok) sent += 1
      else failures.push({ recipient: result.recipient, error: result.error })
    }
  } finally {
    transporter.close()
  }

  return {
    attempted: recipients.length,
    sent,
    failed: failures.length,
    failures,
  }
}

export function referralCreditEmailTemplate(input: {
  firstName?: string
  rewardAmount?: number
  linkedCount?: number
  linkedLimit?: number
  referredEmail?: string
}) {
  const firstName = String(input.firstName || 'there').trim() || 'there'
  const rewardAmount = Number(input.rewardAmount || 10)
  const linkedCount = Math.max(0, Number(input.linkedCount || 0))
  const linkedLimit = Math.max(linkedCount, Number(input.linkedLimit || 8))
  const referredEmail = String(input.referredEmail || '').trim()

  return {
    subject: 'Good news, you have been credited GBP 10.00',
    body: `Hi ${firstName},

Good news, you have been credited GBP ${rewardAmount.toFixed(2)} in your Streamz R Us account.

${referredEmail ? `Referral linked: ${referredEmail}\n` : ''}You now have ${linkedCount}/${linkedLimit} referral slots linked on your account.

Keep it up.

Remember, every time one of your linked referrals makes a full-price renewal, you receive another GBP ${rewardAmount.toFixed(2)} credit as well.

Thanks,
Streamz R Us`,
  }
}

export async function sendReferralCreditEmail(to: string, input: {
  firstName?: string
  rewardAmount?: number
  linkedCount?: number
  linkedLimit?: number
  referredEmail?: string
}) {
  const { subject, body } = referralCreditEmailTemplate(input)
  await sendPlainTextEmail(to, subject, body)
}

export function terminationDateSoonTemplate(input?: {
  firstName?: string
  planEndDate?: string
  companyName?: string
}) {
  const firstName = String(input?.firstName || 'there').trim() || 'there'
  const planEndDate = String(input?.planEndDate || 'your current plan end date').trim() || 'your current plan end date'
  const companyName = String(input?.companyName || 'Streamz R Us').trim() || 'Streamz R Us'

  return {
    subject: 'Termination Date Soon',
    body: `Hi ${firstName},

This email is to confirm that your ${companyName} access is scheduled for termination soon.

Your current plan will remain active until ${planEndDate}. After this date, your access will end automatically, your slot will be released, and your membership will not continue.

We now operate as a closed private community, and access is limited to selected active members only.

Thank you for being with ${companyName}. We appreciate your time with us and wish you all the best going forward.

Kind regards,
${companyName}`,
  }
}

export async function sendTerminationDateSoonEmail(to: string, input?: {
  firstName?: string
  planEndDate?: string
  companyName?: string
}) {
  const { subject, body } = terminationDateSoonTemplate(input)
  await sendPlainTextEmail(to, subject, body)
}

export function serviceTerminatedTemplate(input?: {
  firstName?: string
  companyName?: string
}) {
  const firstName = String(input?.firstName || 'there').trim() || 'there'
  const companyName = String(input?.companyName || 'Streamz R Us').trim() || 'Streamz R Us'

  return {
    subject: 'Service Terminated',
    body: `Hi ${firstName},

This email is to confirm that your ${companyName} service has now been terminated.

Your access has been removed, your slot has been released, and your membership will not continue.

We now operate as a closed private community, and access is limited to selected active members only.

Thank you for being with ${companyName}. We appreciate your time with us and wish you all the best going forward.

Kind regards,
${companyName}`,
  }
}

export async function sendServiceTerminatedEmail(to: string, input?: {
  firstName?: string
  companyName?: string
}) {
  const { subject, body } = serviceTerminatedTemplate(input)
  await sendPlainTextEmail(to, subject, body)
}
