import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export type MailboxConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  mailbox?: string
  service_keywords?: string
  tlsRejectUnauthorized?: boolean
}

export type InboxMessage = {
  id: string
  uid: number
  fromEmail: string
  fromName: string
  subject: string
  date: string | null
  text: string
  html: string
  preview: string
  matchedCustomerEmail: string | null
  matchedCustomerName: string | null
  serviceScore: number
}

const DEFAULT_KEYWORDS = [
  'plex',
  'stream',
  'streamz',
  'subscription',
  'renewal',
  'payment',
  'server',
  'buffer',
  'support',
  'service',
  'account',
  'login',
  'issue',
  'problem',
]

function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase()
}

function normalizeMailboxPassword(value: string) {
  return String(value || '').replace(/\s+/g, '')
}

function toMailboxError(error: unknown) {
  const message = String((error as any)?.message || '').trim()
  const response = String((error as any)?.response || '').trim()
  const responseCode = String((error as any)?.serverResponseCode || '').trim().toUpperCase()
  const code = String((error as any)?.code || '').trim().toUpperCase()

  if (responseCode === 'AUTHENTICATIONFAILED' || /AUTHENTICATIONFAILED/i.test(response)) {
    return new Error('Mailbox login failed. Update the Gmail app password for the inbox account.')
  }

  if (code === 'ENOTFOUND') {
    return new Error('Mailbox host could not be resolved. Check the inbox host setting.')
  }

  if (/self-signed certificate/i.test(message)) {
    return new Error('Mailbox TLS verification failed on this machine. Adjust the local inbox TLS setting and try again.')
  }

  return error instanceof Error ? error : new Error('Failed to reach the inbox mailbox.')
}

function scoreServiceRelevance(content: string, subject: string, keywords: string[]) {
  const haystack = `${subject}\n${content}`.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (!keyword) continue
    if (haystack.includes(keyword.toLowerCase())) score += 1
  }
  return score
}

function htmlToText(value: string) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function createPreview(text: string, html = '') {
  return String(text || htmlToText(html))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function normalizeDate(value: string | Date | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function hasReplyStyleSubject(subject: string) {
  return /^(re|fw|fwd)\s*:/i.test(String(subject || '').trim())
}

function getEnvelopeSender(envelope: { from?: Array<{ address?: string; name?: string }>; replyTo?: Array<{ address?: string; name?: string }> } | undefined) {
  const replyTo = envelope?.replyTo?.[0]
  const from = envelope?.from?.[0]
  const preferred = replyTo?.address ? replyTo : from

  return {
    email: normalizeEmail(preferred?.address || from?.address || ''),
    name: String(preferred?.name || from?.name || ''),
  }
}

export async function markInboxMessageSeen({
  config,
  uid,
}: {
  config: MailboxConfig
  uid: number
}) {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Gmail-style app passwords are often copied with spaces for readability.
    auth: { user: config.user, pass: normalizeMailboxPassword(config.pass) },
    tls: { rejectUnauthorized: config.tlsRejectUnauthorized !== false },
    logger: false,
  })

  try {
    await client.connect()
    await client.mailboxOpen(config.mailbox || 'INBOX')
    const lock = await client.getMailboxLock(config.mailbox || 'INBOX')
    try {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
      return true
    } finally {
      lock.release()
    }
  } catch (error) {
    throw toMailboxError(error)
  } finally {
    try {
      await client.logout()
    } catch {}
  }
}

export async function fetchInboxMessages({
  config,
  customerIndex,
  limit = 40,
  serviceOnly = true,
  unreadOnly = true,
}: {
  config: MailboxConfig
  customerIndex: Map<string, { email: string; name: string }>
  limit?: number
  serviceOnly?: boolean
  unreadOnly?: boolean
}) {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Gmail-style app passwords are often copied with spaces for readability.
    auth: { user: config.user, pass: normalizeMailboxPassword(config.pass) },
    tls: { rejectUnauthorized: config.tlsRejectUnauthorized !== false },
    logger: false,
  })

  const keywords = String(config.service_keywords || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const activeKeywords = Array.from(new Set([...DEFAULT_KEYWORDS, ...keywords]))

  try {
    await client.connect()
    await client.mailboxOpen(config.mailbox || 'INBOX')

    const lock = await client.getMailboxLock(config.mailbox || 'INBOX')
    try {
      const allUids = await client.search(unreadOnly ? { seen: false } : { all: true }, { uid: true })
      if (!Array.isArray(allUids)) return []
      const recentUids = allUids.slice(-Math.max(limit * 3, unreadOnly ? 45 : 72))
      if (!recentUids.length) return []

      const envelopeRows = await client.fetchAll(recentUids, { uid: true, envelope: true, internalDate: true }, { uid: true })
      const candidates = envelopeRows
        .map((message) => {
          const sender = getEnvelopeSender(message.envelope)
          const subject = String(message.envelope?.subject || '').trim()
          const customer = customerIndex.get(sender.email) || null
          const subjectScore = scoreServiceRelevance('', subject, activeKeywords)
          return {
            uid: message.uid,
            fromEmail: sender.email,
            fromName: sender.name,
            subject,
            date: normalizeDate(message.internalDate),
            customer,
            subjectScore,
          }
        })
        .filter((message) => Boolean(message.fromEmail && message.customer))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())

      if (!candidates.length) return []

      const shortlist = candidates.slice(0, Math.max(limit * 2, 24))
      const messageMap = new Map(shortlist.map((message) => [message.uid, message]))
      const sourceRows = await client.fetchAll(shortlist.map((message) => message.uid), { uid: true, envelope: true, source: true, internalDate: true }, { uid: true })

      const parsedRows = await Promise.all(
        sourceRows.map(async (message) => {
          if (!message.source) return null
          const parsed = await simpleParser(message.source)
          const sender = getEnvelopeSender(message.envelope)
          const candidate = messageMap.get(message.uid)
          const fromEmail = normalizeEmail(parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address || sender.email)
          if (!fromEmail) return null

          const customer = customerIndex.get(fromEmail) || candidate?.customer || null
          if (!customer) return null

          const text = String(parsed.text || '')
          const html = typeof parsed.html === 'string' ? parsed.html : ''
          const subject = String(parsed.subject || candidate?.subject || message.envelope?.subject || '').trim()
          const score = scoreServiceRelevance(text || htmlToText(html), subject, activeKeywords)

          if (serviceOnly && score <= 0 && !hasReplyStyleSubject(subject)) return null

          return {
            id: `${message.uid}`,
            uid: message.uid,
            fromEmail,
            fromName: String(parsed.from?.value?.[0]?.name || candidate?.fromName || sender.name || ''),
            subject,
            date: normalizeDate(message.internalDate || candidate?.date || undefined),
            text,
            html,
            preview: createPreview(text, html),
            matchedCustomerEmail: customer.email,
            matchedCustomerName: customer.name,
            serviceScore: Math.max(score, candidate?.subjectScore || 0),
          } satisfies InboxMessage
        })
      )

      const messages = parsedRows.filter(Boolean) as InboxMessage[]

      return messages
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
        .slice(0, limit)
    } finally {
      lock.release()
    }
  } catch (error) {
    throw toMailboxError(error)
  } finally {
    try {
      await client.logout()
    } catch {}
  }
}
