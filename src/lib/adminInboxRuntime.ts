import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getSmtpConfigFromEnv,
  getSmtpConfigFromSettings,
  isLikelySmtpAuthError,
  renderTemplate,
  sendPlainTextEmail,
  smtpConfigsMatch,
} from '@/lib/email'
import { fetchInboxMessages, type InboxMessage, type MailboxConfig } from '@/lib/mailInbox'

export const DEFAULT_AUTO_REPLY_SUBJECT = 'We got your message'
export const DEFAULT_AUTO_REPLY_BODY = 'Hi {{first_name}},\n\nThank you for messaging Streamz R Us.\n\nA member of the team will be with you shortly.\n\nDue to high demand, please allow up to 24 hours for a reply, although it is usually much quicker.\n\nThanks,\nStreamz R Us'

export function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export function parseBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

export function envString(key: string) {
  return String(process.env[key] || '')
    .replace(/\\r\\n/g, '')
    .replace(/[\r\n]+/g, '')
    .trim()
}

export function getEnvInboxConfig() {
  return {
    host: envString('INBOUND_IMAP_HOST'),
    port: Number(envString('INBOUND_IMAP_PORT') || 993),
    secure: parseBool(envString('INBOUND_IMAP_SECURE'), true),
    tlsRejectUnauthorized: parseBool(envString('INBOUND_IMAP_TLS_REJECT_UNAUTHORIZED'), true),
    user: envString('INBOUND_IMAP_USER'),
    pass: envString('INBOUND_IMAP_PASS'),
    mailbox: envString('INBOUND_IMAP_MAILBOX') || 'INBOX',
    service_keywords: envString('INBOUND_IMAP_SERVICE_KEYWORDS'),
  }
}

export async function loadInboxSettings(supabase: SupabaseClient | null, fallbackSettings?: any) {
  let settings = fallbackSettings || null

  if (!settings && supabase) {
    try {
      const { data } = await supabase.from('admin_settings').select('*').single()
      settings = data || null
    } catch {
    }
  }

  const envConfig = getEnvInboxConfig()
  const config: MailboxConfig = {
    host: String(settings?.imap_host || envConfig.host || '').trim(),
    port: Number(settings?.imap_port || envConfig.port || 993),
    secure: settings?.imap_secure !== undefined ? parseBool(settings?.imap_secure, true) : envConfig.secure,
    tlsRejectUnauthorized: envConfig.tlsRejectUnauthorized,
    user: String(settings?.imap_user || envConfig.user || '').trim(),
    pass: String(settings?.imap_pass || envConfig.pass || '').trim(),
    mailbox: String(settings?.imap_mailbox || envConfig.mailbox || 'INBOX').trim() || 'INBOX',
    service_keywords: String(settings?.service_email_keywords || envConfig.service_keywords || '').trim(),
  }

  return { settings, config }
}

export async function buildCustomerIndex(supabase: SupabaseClient) {
  const { data: customers, error } = await supabase.from('customers').select('email,name')
  if (error) throw new Error(error.message)

  const customerIndex = new Map<string, { email: string; name: string }>()
  for (const customer of customers || []) {
    const email = String((customer as any).email || '').trim().toLowerCase()
    if (!email) continue
    customerIndex.set(email, {
      email,
      name: String((customer as any).name || '').trim(),
    })
  }

  return customerIndex
}

export async function fetchManagedInboxMessages({
  supabase,
  settings,
  limit,
  serviceOnly,
  unreadOnly,
}: {
  supabase: SupabaseClient
  settings?: any
  limit: number
  serviceOnly: boolean
  unreadOnly: boolean
}) {
  const { settings: resolvedSettings, config } = await loadInboxSettings(supabase, settings)
  if (!config.host || !config.user || !config.pass) {
    throw new Error('Inbound mailbox is not configured yet.')
  }

  const customerIndex = await buildCustomerIndex(supabase)
  const messages = await fetchInboxMessages({ config, customerIndex, limit, serviceOnly, unreadOnly })

  return { settings: resolvedSettings, config, messages }
}

function getFirstName(name: string, email: string) {
  const cleanName = String(name || '').trim()
  if (cleanName) return cleanName.split(/\s+/)[0] || cleanName
  const cleanEmail = String(email || '').trim()
  if (cleanEmail.includes('@')) return cleanEmail.split('@')[0]
  return cleanEmail || 'there'
}

export async function sendInboxAutoReplies({
  supabase,
  settings,
  messages,
  mailboxUser,
}: {
  supabase: SupabaseClient | null
  settings: any
  messages: InboxMessage[]
  mailboxUser: string
}) {
  if (!supabase || !settings?.email_auto_reply_enabled || !messages.length || !mailboxUser) return { sent: 0 }
  const dbConfig = getSmtpConfigFromSettings(settings)
  const envConfig = getSmtpConfigFromEnv()
  const fallbackConfig = envConfig && (!dbConfig || !smtpConfigsMatch(dbConfig, envConfig)) ? envConfig : null
  let activeConfig = dbConfig || envConfig
  if (!activeConfig) return { sent: 0 }

  const uids = messages.map((message) => Number(message.uid)).filter((uid) => Number.isFinite(uid) && uid > 0)
  if (!uids.length) return { sent: 0 }

  let existingUids = new Set<number>()
  try {
    const { data, error } = await supabase
      .from('email_auto_reply_log')
      .select('message_uid')
      .eq('mailbox_user', mailboxUser)
      .in('message_uid', uids)

    if (error) return { sent: 0 }
    existingUids = new Set((data || []).map((row: any) => Number(row.message_uid)).filter((uid: number) => Number.isFinite(uid)))
  } catch {
    return { sent: 0 }
  }

  const pending = messages.filter((message) => !existingUids.has(Number(message.uid)))
  if (!pending.length) return { sent: 0 }

  const companyName = String(settings?.company_name || 'Streamz R Us').trim() || 'Streamz R Us'
  const subjectTemplate = String(settings?.email_auto_reply_subject || DEFAULT_AUTO_REPLY_SUBJECT).trim() || DEFAULT_AUTO_REPLY_SUBJECT
  const bodyTemplate = String(settings?.email_auto_reply_body || DEFAULT_AUTO_REPLY_BODY).trim() || DEFAULT_AUTO_REPLY_BODY
  const delivered: Array<{ mailbox_user: string; message_uid: number; recipient_email: string; auto_reply_subject: string }> = []
  let repairedSettings = !dbConfig && Boolean(envConfig)

  for (const message of pending) {
    const vars = {
      first_name: getFirstName(message.matchedCustomerName || message.fromName || '', message.fromEmail),
      full_name: String(message.matchedCustomerName || message.fromName || '').trim(),
      email: message.fromEmail,
      company_name: companyName,
    }
    const subject = renderTemplate(subjectTemplate, vars)
    const body = renderTemplate(bodyTemplate, vars)

    try {
      await sendPlainTextEmail(message.fromEmail, subject, body, activeConfig)
      delivered.push({
        mailbox_user: mailboxUser,
        message_uid: Number(message.uid),
        recipient_email: message.fromEmail,
        auto_reply_subject: subject,
      })
    } catch (error: any) {
      if (activeConfig === dbConfig && fallbackConfig && isLikelySmtpAuthError(error?.message || error)) {
        try {
          await sendPlainTextEmail(message.fromEmail, subject, body, fallbackConfig)
          activeConfig = fallbackConfig
          repairedSettings = true
          delivered.push({
            mailbox_user: mailboxUser,
            message_uid: Number(message.uid),
            recipient_email: message.fromEmail,
            auto_reply_subject: subject,
          })
        } catch {
        }
      }
    }
  }

  if (!delivered.length) return { sent: 0 }

  if (repairedSettings && supabase && activeConfig) {
    try {
      await supabase.from('admin_settings').update({
        smtp_host: activeConfig.host,
        smtp_port: String(activeConfig.port || 465),
        smtp_user: activeConfig.user,
        smtp_pass: activeConfig.pass,
        smtp_from: activeConfig.from || activeConfig.user,
      }).eq('id', 1)
    } catch {
    }
  }

  try {
    await supabase.from('email_auto_reply_log').insert(delivered)
  } catch {
  }

  return { sent: delivered.length }
}
