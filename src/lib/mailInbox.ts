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

function scoreServiceRelevance(content: string, subject: string, keywords: string[]) {
  const haystack = `${subject}\n${content}`.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (!keyword) continue
    if (haystack.includes(keyword.toLowerCase())) score += 1
  }
  return score
}

function createPreview(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function normalizeDate(value: string | Date | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
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
    auth: { user: config.user, pass: config.pass },
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
      const allUids = await client.search(unreadOnly ? { seen: false } : { all: true })
      if (!Array.isArray(allUids)) return []
      const recentUids = allUids.slice(-Math.max(limit * 4, 60))
      if (!recentUids.length) return []
      const recentUidRange = recentUids.join(',')

      const messages: InboxMessage[] = []
      for await (const message of client.fetch(recentUidRange, { uid: true, envelope: true, source: true, internalDate: true })) {
        if (!message.source) continue
        const parsed = await simpleParser(message.source)
        const from = parsed.from?.value?.[0]
        const fromEmail = normalizeEmail(from?.address || '')
        if (!fromEmail) continue

        const customer = customerIndex.get(fromEmail) || null
        const text = String(parsed.text || '')
        const html = typeof parsed.html === 'string' ? parsed.html : ''
        const subject = String(parsed.subject || message.envelope?.subject || '').trim()
        const score = scoreServiceRelevance(text || html, subject, activeKeywords)

        if (!customer) continue
        if (serviceOnly && score <= 0) continue

        messages.push({
          id: `${message.uid}`,
          uid: message.uid,
          fromEmail,
          fromName: String(from?.name || ''),
          subject,
          date: normalizeDate(message.internalDate),
          text,
          html,
          preview: createPreview(text || html),
          matchedCustomerEmail: customer.email,
          matchedCustomerName: customer.name,
          serviceScore: score,
        })
      }

      return messages
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
        .slice(0, limit)
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {}
  }
}
