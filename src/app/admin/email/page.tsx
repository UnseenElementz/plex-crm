'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Bot, Clock3, Download, Eye, ImagePlus, MailOpen, RefreshCw, Reply, SendHorizonal, Users, X } from 'lucide-react'
import { getStatus } from '@/lib/pricing'
import { getSupabase } from '@/lib/supabaseClient'

type Customer = {
  id: string
  full_name: string
  email: string
  status: string
  next_due_date: string
  plan?: string
  streams?: number
}

type PlexLinkRow = {
  status: 'linked' | 'email_mismatch' | 'not_in_crm' | 'missing_plex_email'
  linked_by: 'email' | 'plex_username' | null
  recipient_email: string
  plex_email: string
  plex_username: string
  customer_id: string | null
  customer_email: string | null
  customer_name: string | null
}

type PlexPreview = {
  totals: { total: number; linked: number; mismatched: number; not_in_crm: number; missing_plex_email: number }
  rows: PlexLinkRow[]
  emails: string[]
}

type InboxMessage = {
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

type MailOpsMeta = {
  autoReplyEnabled: boolean
  autoReplySubject: string
  companyName: string
}

function formatInboxDate(value: string | null) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No timestamp'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Awaiting timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Awaiting timestamp'
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.floor(diff / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function buildReplySubject(subject: string) {
  const clean = String(subject || '').trim()
  if (!clean) return 'Re: Your message'
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`
}

function buildReplyGreeting(mail: InboxMessage) {
  const name = String(mail.matchedCustomerName || mail.fromName || '').trim()
  const firstName = name.split(/\s+/)[0]
  return `${firstName ? `Hi ${firstName},` : 'Hi,'}\n\nThanks for your message. We're on it and will help you from here.\n\n`
}

function buildQuotedReplyBody(mail: InboxMessage) {
  const sourceText = String(mail.text || mail.preview || '').trim()
  const quoted = sourceText
    ? sourceText.split(/\r?\n/).map((line) => `> ${line}`).join('\n')
    : '> No original message text found.'

  return `${buildReplyGreeting(mail)}---------- original message ----------\nFrom: ${mail.fromEmail}\nSent: ${formatInboxDate(mail.date)}\nSubject: ${mail.subject || '(No subject)'}\n\n${quoted}\n`
}

function normalizeMessageText(value: string) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u00a0/g, ' ').trim()
}

function splitThreadSections(value: string) {
  const text = normalizeMessageText(value)
  if (!text) return { latest: '', quoted: '' }
  const markers = [/^On .+ wrote:\s*$/m, /^-{6,}\s*original message\s*-{6,}\s*$/im, /^From:\s.+$/m, /^>\s?/m]
  const indexes = markers.map((pattern) => text.search(pattern)).filter((index) => index >= 0).sort((a, b) => a - b)
  if (!indexes.length) return { latest: text, quoted: '' }
  const splitAt = indexes[0]
  const latest = text.slice(0, splitAt).trim()
  return { latest: latest || text, quoted: latest ? text.slice(splitAt).trim() : '' }
}

function buildTicketCode(uid: number) {
  return `SRU-${String(uid).padStart(5, '0')}`
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getTicketTier(score: number) {
  if (score >= 5) return { label: 'Priority', classes: 'border-rose-400/25 bg-rose-400/12 text-rose-200' }
  if (score >= 3) return { label: 'Warm', classes: 'border-amber-400/25 bg-amber-400/12 text-amber-200' }
  return { label: 'Standard', classes: 'border-cyan-400/25 bg-cyan-400/12 text-cyan-200' }
}

function getTicketState(mail: InboxMessage, replyContext: InboxMessage | null) {
  if (replyContext?.uid === mail.uid) return { label: 'Reply Armed', classes: 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100' }
  return { label: 'New', classes: 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200' }
}

function getCustomerStatus(customer: Customer) {
  if (customer.status === 'inactive') return 'Inactive'
  if (!customer.plan) return 'No plan'
  return getStatus(new Date(customer.next_due_date))
}

export default function AdminEmailPage() {
  const composerRef = useRef<HTMLDivElement | null>(null)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const inboxPollingRef = useRef(false)
  const authBootRef = useRef<Promise<boolean> | null>(null)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [customerFilter, setCustomerFilter] = useState<'all' | 'active' | 'inactive' | 'due_soon' | 'overdue'>('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [queueFilter, setQueueFilter] = useState<'all' | 'priority' | 'replying'>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [plexPreview, setPlexPreview] = useState<PlexPreview | null>(null)
  const [showPlexPreview, setShowPlexPreview] = useState(false)
  const [plexFilter, setPlexFilter] = useState<'all' | 'mismatch' | 'not_in_crm'>('all')
  const [includeNotInCrm, setIncludeNotInCrm] = useState(false)
  const [confirmingSync, setConfirmingSync] = useState(false)
  const [inbox, setInbox] = useState<InboxMessage[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState('')
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null)
  const [replyContext, setReplyContext] = useState<InboxMessage | null>(null)
  const [inboxActionUid, setInboxActionUid] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ url: string; name: string; size: number }[]>([])
  const [opsMeta, setOpsMeta] = useState<MailOpsMeta>({
    autoReplyEnabled: false,
    autoReplySubject: 'We got your message',
    companyName: 'Streamz R Us',
  })
  const [lastInboxSyncAt, setLastInboxSyncAt] = useState<Date | null>(null)

  const deferredCustomerSearch = useDeferredValue(customerSearch)
  const deferredTicketSearch = useDeferredValue(ticketSearch)

  useEffect(() => {
    void bootEmailDesk()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadInbox()
    }, 30000)

    const handleFocusSync = () => {
      void loadInbox()
    }

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') void loadInbox()
    }

    window.addEventListener('focus', handleFocusSync)
    document.addEventListener('visibilitychange', handleVisibilitySync)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocusSync)
      document.removeEventListener('visibilitychange', handleVisibilitySync)
    }
  }, [])

  useEffect(() => {
    if (!attachments.length) {
      setAttachmentPreviews([])
      return
    }
    const next = attachments.map((file) => ({ url: URL.createObjectURL(file), name: file.name, size: file.size }))
    setAttachmentPreviews(next)
    return () => next.forEach((item) => URL.revokeObjectURL(item.url))
  }, [attachments])

  function flashMessage(text: string, timeout = 4500) {
    setMsg(text)
    window.setTimeout(() => setMsg((current) => (current === text ? '' : current)), timeout)
  }

  async function ensureAdminSession() {
    if (authBootRef.current) return authBootRef.current

    authBootRef.current = (async () => {
      try {
        const current = await fetch('/api/admin/auth/session', { cache: 'no-store' })
        if (current.ok) return true

        if (typeof window !== 'undefined' && localStorage.getItem('localAdmin') === '1') {
          const username = localStorage.getItem('localAdminUser') || ''
          const password = localStorage.getItem('localAdminPass') || ''
          if (username && password) {
            const local = await fetch('/api/admin/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'local', username, password }),
            })
            if (local.ok) return true
          }
        }

        const supabase = getSupabase()
        if (!supabase) return false
        const { data } = await supabase.auth.getUser()
        const email = String(data.user?.email || '').trim()
        if (!email) return false

        const hydrated = await fetch('/api/admin/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        return hydrated.ok
      } catch {
        return false
      }
    })()

    const ok = await authBootRef.current
    authBootRef.current = null
    return ok
  }

  async function bootEmailDesk() {
    const ok = await ensureAdminSession()
    if (!ok) {
      setInboxError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }
    await Promise.all([loadCustomers(), loadInbox(), loadOpsMeta()])
  }

  async function loadCustomers() {
    try {
      setLoading(true)
      const response = await fetch('/api/customers')
      if (!response.ok) return
      const data = await response.json()
      setCustomers(Array.isArray(data) ? data : [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function loadOpsMeta() {
    try {
      const response = await fetch(`/api/admin/settings?t=${Date.now()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return
      setOpsMeta({
        autoReplyEnabled: Boolean(data?.email_auto_reply_enabled),
        autoReplySubject: String(data?.email_auto_reply_subject || 'We got your message'),
        companyName: String(data?.company_name || 'Streamz R Us'),
      })
    } catch {
    }
  }

  async function loadInbox() {
    const authorized = await ensureAdminSession()
    if (!authorized) {
      setInboxError('Admin session expired. Please sign in again.')
      setInbox([])
      return
    }
    if (inboxPollingRef.current) return
    inboxPollingRef.current = true
    try {
      setInboxLoading(true)
      setInboxError('')
      const response = await fetch('/api/admin/email/inbox?serviceOnly=true&unreadOnly=true&limit=40', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setInboxError(data?.error || 'Failed to load inbox')
        setInbox([])
        return
      }
      const rows = Array.isArray(data?.messages) ? data.messages : []
      setInbox(rows)
      setSelectedInboxId((current) => (current && rows.some((row: InboxMessage) => row.id === current) ? current : rows[0]?.id || null))
      setLastInboxSyncAt(new Date())
    } catch (error: any) {
      setInboxError(error?.message || 'Failed to load inbox')
      setInbox([])
    } finally {
      setInboxLoading(false)
      inboxPollingRef.current = false
    }
  }

  async function markInboxItemRead(uid: number, options?: { silent?: boolean }) {
    setInboxActionUid(uid)
    try {
      const response = await fetch('/api/admin/email/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (!options?.silent) flashMessage(data?.error || 'Could not mark that email as read.')
        return false
      }
      const nextInbox = inbox.filter((mail) => mail.uid !== uid)
      setInbox(nextInbox)
      setSelectedInboxId((current) => (current && nextInbox.some((mail) => mail.id === current) ? current : nextInbox[0]?.id || null))
      if (replyContext?.uid === uid) setReplyContext(null)
      if (!options?.silent) flashMessage('Ticket cleared from the live queue.')
      return true
    } catch (error: any) {
      if (!options?.silent) flashMessage(error?.message || 'Could not mark that email as read.')
      return false
    } finally {
      setInboxActionUid((current) => (current === uid ? null : current))
    }
  }

  async function syncPlex() {
    setSyncing(true)
    setMsg('Loading Plex sync preview...')
    try {
      const response = await fetch('/api/admin/customers/sync-plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'email', action: 'preview' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        flashMessage(data?.error || 'Sync failed')
        return
      }
      setPlexPreview({
        totals: data?.totals || { total: 0, linked: 0, mismatched: 0, not_in_crm: 0, missing_plex_email: 0 },
        rows: Array.isArray(data?.rows) ? data.rows : [],
        emails: Array.isArray(data?.emails) ? data.emails : [],
      })
      setPlexFilter('all')
      setIncludeNotInCrm(false)
      setShowPlexPreview(true)
      setMsg('')
    } catch (error: any) {
      flashMessage(error?.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function confirmPlexSyncSelection() {
    const rows = plexPreview?.rows || []
    const eligible = rows.filter((row) => row.status !== 'missing_plex_email')
    const picked = eligible.filter((row) => row.status !== 'not_in_crm' || includeNotInCrm)
    const emails = Array.from(new Set(picked.map((row) => String(row.recipient_email || '').trim()).filter(Boolean)))
    const mismatchRows = picked.filter((row) => row.status === 'email_mismatch')
    const mismatchCustomerIds = mismatchRows.map((row) => row.customer_id).filter(Boolean)

    setSelected(Object.fromEntries(emails.map((email) => [email, true])))
    setShowPlexPreview(false)
    flashMessage(`Selected ${emails.length} recipients from Plex.`)

    setConfirmingSync(true)
    try {
      await fetch('/api/admin/customers/sync-plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'email',
          action: 'confirm',
          include_unmatched: includeNotInCrm,
          selected_count: emails.length,
          mismatch_count: mismatchRows.length,
          mismatch_customer_ids: mismatchCustomerIds,
        }),
      })
    } catch {
    } finally {
      setConfirmingSync(false)
    }
  }

  function toggle(email: string) {
    setSelected((current) => {
      const next = { ...current }
      if (next[email]) delete next[email]
      else next[email] = true
      return next
    })
  }

  function toggleAll() {
    if (selectAllCustomers) {
      const next = { ...selected }
      filteredCustomers.forEach((customer) => delete next[customer.email])
      setSelected(next)
      return
    }
    const next = { ...selected }
    filteredCustomers.forEach((customer) => {
      next[customer.email] = true
    })
    setSelected(next)
  }

  function selectDueSoon2Months() {
    const twoMonthsFromNow = new Date()
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)
    const now = new Date()
    const next = { ...selected }
    customers.forEach((customer) => {
      if (!customer.next_due_date) return
      const due = new Date(customer.next_due_date)
      if (due >= now && due <= twoMonthsFromNow) next[customer.email] = true
    })
    setSelected(next)
    flashMessage('Selected customers due within the next 2 months.')
  }

  function selectByStreams(minStreams: number, maxStreams?: number) {
    const next = { ...selected }
    let count = 0
    customers.forEach((customer) => {
      const streams = Number(customer.streams || 0)
      if (streams >= minStreams && (maxStreams === undefined || streams <= maxStreams)) {
        next[customer.email] = true
        count += 1
      }
    })
    setSelected(next)
    flashMessage(`Selected ${count} customers with ${maxStreams ? `${minStreams}-${maxStreams}` : `${minStreams}+`} streams.`)
  }

  function clearReplyMode() {
    setReplyContext(null)
  }

  function addAttachments(files: File[]) {
    const MAX_ATTACHMENTS = 3
    const MAX_SIZE = 4 * 1024 * 1024
    let error = ''
    setAttachmentError('')
    setAttachments((current) => {
      const next = [...current]
      files.forEach((file) => {
        if (next.length >= MAX_ATTACHMENTS) {
          error = `Max ${MAX_ATTACHMENTS} images allowed.`
          return
        }
        if (!file.type.startsWith('image/')) {
          error = 'Only image files are supported.'
          return
        }
        if (file.size > MAX_SIZE) {
          error = 'Each image must be under 4MB.'
          return
        }
        next.push(file)
      })
      return next
    })
    if (error) setAttachmentError(error)
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, i) => i !== index))
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      messageRef.current?.focus()
    })
  }

  function exportCustomerEmails(format: 'txt' | 'csv') {
    const rows = customers
      .map((customer) => ({
        name: String(customer.full_name || '').trim(),
        email: String(customer.email || '').trim().toLowerCase(),
        status: getCustomerStatus(customer),
      }))
      .filter((customer) => customer.email)

    if (!rows.length) {
      flashMessage('No customer emails available to export.')
      return
    }

    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'txt') {
      downloadTextFile(`customer-emails-${stamp}.txt`, rows.map((row) => row.email).join('; '), 'text/plain;charset=utf-8')
      flashMessage(`Exported ${rows.length} customer emails as TXT.`)
      return
    }

    const csv = [
      'Name,Email,Status',
      ...rows.map((row) =>
        [row.name, row.email, row.status]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n')

    downloadTextFile(`customer-emails-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
    flashMessage(`Exported ${rows.length} customer emails as CSV.`)
  }

  function openInboxMessage(mail: InboxMessage) {
    setSelectedInboxId(mail.id)
  }

  function startReplyDraft(mail: InboxMessage) {
    const recipient = String(mail.matchedCustomerEmail || mail.fromEmail || '').trim().toLowerCase()
    if (!recipient) {
      flashMessage('That email does not have a reply address yet.')
      return
    }
    setSelectedInboxId(mail.id)
    setSelected({ [recipient]: true })
    setReplyContext(mail)
    setSubject(buildReplySubject(mail.subject))
    setBody(buildQuotedReplyBody(mail))
    flashMessage(`Reply draft armed for ${mail.matchedCustomerName || mail.fromEmail}.`, 3000)
    focusComposer()
  }

  async function send() {
    const recipients = Object.keys(selected)
    if (!recipients.length) {
      flashMessage('No recipients selected')
      return
    }
    setSending(true)
    setMsg('')
    try {
      const payload = new FormData()
      payload.append('subject', subject)
      payload.append('body', body)
      payload.append('mode', 'list')
      recipients.forEach((recipient) => payload.append('recipients', recipient))
      attachments.forEach((file) => payload.append('attachments', file))

      const response = await fetch('/api/admin/email/custom', {
        method: 'POST',
        body: payload,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        flashMessage(data?.error || 'Failed to send')
        return
      }

      const repliedUid = replyContext?.uid || null
      const autoMarked = repliedUid ? await markInboxItemRead(repliedUid, { silent: true }) : true
      flashMessage(
        repliedUid && !autoMarked
          ? `Reply sent to ${data?.count || recipients.length}, but the live ticket still needs clearing.${data?.warning ? ` ${data.warning}` : ''}`
          : `Message sent to ${data?.count || recipients.length} recipient${(data?.count || recipients.length) === 1 ? '' : 's'}.${data?.warning ? ` ${data.warning}` : ''}`
      )

      setSelected({})
      setSubject('')
      setBody('')
      setReplyContext(null)
      setAttachments([])
      setAttachmentError('')
      await loadInbox()
    } catch (error: any) {
      flashMessage(error?.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const previewRows = useMemo(() => {
    const rows = plexPreview?.rows || []
    if (plexFilter === 'mismatch') return rows.filter((row) => row.status === 'email_mismatch')
    if (plexFilter === 'not_in_crm') return rows.filter((row) => row.status === 'not_in_crm')
    return rows
  }, [plexPreview, plexFilter])

  const filteredCustomers = useMemo(() => {
    const query = deferredCustomerSearch.toLowerCase()
    return customers.filter((customer) => {
      const rawStatus = getCustomerStatus(customer)
      const matchesSearch = `${customer.full_name}${customer.email}`.toLowerCase().includes(query)
      if (!matchesSearch) return false
      if (customerFilter === 'all') return true
      if (customerFilter === 'active') return rawStatus === 'Active'
      if (customerFilter === 'inactive') return rawStatus === 'Inactive' || rawStatus === 'No plan'
      if (customerFilter === 'due_soon') return rawStatus === 'Due Soon' || rawStatus === 'Due Today'
      if (customerFilter === 'overdue') return rawStatus === 'Overdue'
      return true
    })
  }, [customers, customerFilter, deferredCustomerSearch])

  const filteredInbox = useMemo(() => {
    const query = deferredTicketSearch.toLowerCase()
    return inbox.filter((mail) => {
      const matchesSearch = `${mail.matchedCustomerName}${mail.fromName}${mail.fromEmail}${mail.subject}${mail.preview}`.toLowerCase().includes(query)
      if (!matchesSearch) return false
      if (queueFilter === 'priority') return Number(mail.serviceScore || 0) >= 4
      if (queueFilter === 'replying') return replyContext ? mail.uid === replyContext.uid : false
      return true
    })
  }, [deferredTicketSearch, inbox, queueFilter, replyContext])

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected])
  const selectedInbox = useMemo(() => inbox.find((mail) => mail.id === selectedInboxId) || null, [inbox, selectedInboxId])
  const selectedInboxSections = useMemo(() => splitThreadSections(selectedInbox?.text || selectedInbox?.preview || ''), [selectedInbox])
  const selectedInboxCustomer = useMemo(() => {
    const candidates = [
      String(selectedInbox?.matchedCustomerEmail || '').trim().toLowerCase(),
      String(selectedInbox?.fromEmail || '').trim().toLowerCase(),
    ].filter(Boolean)
    if (!candidates.length) return null
    return customers.find((customer) => candidates.includes(String(customer.email || '').trim().toLowerCase())) || null
  }, [customers, selectedInbox])
  const selectAllCustomers = useMemo(() => filteredCustomers.length > 0 && filteredCustomers.every((customer) => selected[customer.email]), [filteredCustomers, selected])
  const unreadServiceAverage = useMemo(() => {
    if (!inbox.length) return '0.0'
    const total = inbox.reduce((sum, mail) => sum + Number(mail.serviceScore || 0), 0)
    return (total / inbox.length).toFixed(1)
  }, [inbox])
  const priorityCount = useMemo(() => inbox.filter((mail) => Number(mail.serviceScore || 0) >= 4).length, [inbox])

  return (
    <main className="pb-8 pt-1 sm:pb-10 sm:pt-2">
      <section className="mail-hero relative overflow-hidden rounded-[24px] border border-cyan-400/16 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_82%_22%,rgba(96,165,250,0.16),transparent_26%),linear-gradient(180deg,rgba(6,12,28,0.92),rgba(6,10,24,0.96))] p-4 shadow-[0_30px_120px_rgba(8,15,42,0.55)] sm:rounded-[34px] sm:p-7">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <div className="absolute -left-24 top-10 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-5">
            <div className="eyebrow">
              <MailOpen size={14} />
              24/7 Ticket Desk
            </div>
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[2.5rem]">
                One live queue, one clear thread stage, one fast reply dock.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Customer replies now land in a ticket-style command view with always-on auto acknowledgement, faster queue triage, and a dedicated compose lane for direct or bulk follow-up.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void loadInbox()} disabled={inboxLoading} className="btn-outline">
                <RefreshCw size={15} className={inboxLoading ? 'animate-spin' : ''} />
                {inboxLoading ? 'Refreshing queue...' : 'Refresh queue'}
              </button>
              <button onClick={() => void syncPlex()} disabled={syncing} className="btn-outline">
                {syncing ? 'Syncing...' : 'Sync Plex users'}
              </button>
              <a href="/admin" className="btn-outline">
                Back to support
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
              <div className="ticket-stat-card">
                <div className="ticket-stat-label">Unread now</div>
                <div className="ticket-stat-value">{inbox.length}</div>
                <div className="ticket-stat-note">Active queue size</div>
              </div>
              <div className="ticket-stat-card">
                <div className="ticket-stat-label">Priority</div>
                <div className="ticket-stat-value">{priorityCount}</div>
                <div className="ticket-stat-note">High-signal replies</div>
              </div>
              <div className="ticket-stat-card">
                <div className="ticket-stat-label">Reply dock</div>
                <div className="ticket-stat-value text-xl">{replyContext ? 'Armed' : 'Standby'}</div>
                <div className="ticket-stat-note">{replyContext ? buildTicketCode(replyContext.uid) : 'Select a ticket'}</div>
              </div>
              <div className="ticket-stat-card">
                <div className="ticket-stat-label">Signal avg</div>
                <div className="ticket-stat-value">{unreadServiceAverage}</div>
                <div className="ticket-stat-note">Queue relevance</div>
              </div>
            </div>
          </div>
          <div className="ticket-side-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">Automation lane</div>
                <div className="mt-3 text-xl font-semibold text-white">Auto reply engine</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Production cron pings the inbox every five minutes. New matched replies get one acknowledgement and stay queued for a human response.
                </p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${opsMeta.autoReplyEnabled ? 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200' : 'border-slate-600 bg-slate-900/70 text-slate-400'}`}>
                {opsMeta.autoReplyEnabled ? '24/7 live' : 'offline'}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  <Bot size={14} />
                  Auto reply subject
                </div>
                <div className="mt-2 text-sm font-medium text-white">{opsMeta.autoReplySubject}</div>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  <Clock3 size={14} />
                  Queue rhythm
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  Browser-side live refresh every 30 seconds while this desk is open, plus instant refresh when you refocus the tab.
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Last sync {lastInboxSyncAt ? formatInboxDate(lastInboxSyncAt.toISOString()) : 'waiting'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 2xl:grid-cols-[1.1fr_1.35fr_1fr]">
        <section className="ticket-panel">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Queue</div>
              <h3 className="mt-2 text-xl font-semibold text-white">Live tickets</h3>
              <p className="mt-1 text-sm text-slate-400">Unread customer replies sorted into one working stack.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {filteredInbox.length} visible
            </div>
          </div>
          <div className="space-y-4 p-5">
            <input className="input" placeholder="Search by customer, subject, or sender..." value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'all', label: 'All queue' },
                { value: 'priority', label: 'Priority only' },
                { value: 'replying', label: 'Reply armed' },
              ] as const).map((item) => (
                <button key={item.value} className={`btn-xs-outline ${queueFilter === item.value ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100' : ''}`} onClick={() => setQueueFilter(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ticket-list-scroll">
            {inboxLoading ? <div className="p-5 text-sm text-slate-400">Loading ticket queue...</div> : null}
            {!inboxLoading && inboxError ? <div className="p-5 text-sm text-rose-300">{inboxError}</div> : null}
            {!inboxLoading && !inboxError && filteredInbox.length === 0 ? <div className="p-5 text-sm text-slate-500">No tickets match the current queue filter.</div> : null}
            {filteredInbox.map((mail) => {
              const active = selectedInboxId === mail.id
              const busy = inboxActionUid === mail.uid
              const tier = getTicketTier(Number(mail.serviceScore || 0))
              const state = getTicketState(mail, replyContext)
              return (
                <button key={mail.id} type="button" onClick={() => openInboxMessage(mail)} className={`ticket-card ${active ? 'ticket-card-active' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${state.classes}`}>{state.label}</span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${tier.classes}`}>{tier.label}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{buildTicketCode(mail.uid)}</div>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{mail.matchedCustomerName || mail.fromName || mail.fromEmail}</div>
                      <div className="mt-1 truncate text-sm text-slate-300">{mail.subject || '(No subject)'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">{mail.serviceScore || 0}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(mail.date)}</div>
                    </div>
                  </div>
                  <div className="mt-3 line-clamp-3 text-xs leading-6 text-slate-400">{mail.preview}</div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-500">{mail.fromEmail}</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-xs-outline" onClick={(event) => { event.stopPropagation(); openInboxMessage(mail) }}>
                        <Eye size={13} />
                        Open
                      </button>
                      <button type="button" className="btn-xs" onClick={(event) => { event.stopPropagation(); startReplyDraft(mail) }}>
                        <Reply size={13} />
                        Reply
                      </button>
                      <button type="button" className="btn-xs-outline" onClick={(event) => { event.stopPropagation(); void markInboxItemRead(mail.uid) }} disabled={busy}>
                        {busy ? 'Saving...' : 'Clear'}
                      </button>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="ticket-panel 2xl:min-h-[42rem]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Thread stage</div>
              <h3 className="mt-2 text-xl font-semibold text-white">Ticket detail</h3>
              <p className="mt-1 text-sm text-slate-400">Open the latest customer message, inspect context, and jump straight into reply mode.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {selectedInbox ? buildTicketCode(selectedInbox.uid) : 'No ticket selected'}
            </div>
          </div>
          {!selectedInbox ? (
            <div className="flex min-h-[28rem] items-center justify-center p-6 text-sm text-slate-500">Select a live ticket to open the thread stage.</div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="rounded-[30px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(8,18,40,0.96),rgba(5,10,24,0.98))] p-5 shadow-[0_24px_90px_rgba(8,15,42,0.34)]">
                <div className="flex flex-col gap-4 border-b border-white/8 pb-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-cyan-400/18 bg-cyan-400/10 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">
                        {(selectedInbox.matchedCustomerName || selectedInbox.fromName || selectedInbox.fromEmail || '?').trim().charAt(0) || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ticket detail</div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">{buildTicketCode(selectedInbox.uid)}</span>
                          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getTicketTier(selectedInbox.serviceScore).classes}`}>
                            {getTicketTier(selectedInbox.serviceScore).label}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getTicketState(selectedInbox, replyContext).classes}`}>
                            {getTicketState(selectedInbox, replyContext).label}
                          </span>
                        </div>
                        <div className="mt-3 text-[1.65rem] font-semibold leading-tight text-white break-words">
                          {selectedInbox.matchedCustomerName || selectedInbox.fromName || 'Unknown customer'}
                        </div>
                        <div className="mt-2 text-sm text-slate-300 break-all">
                          {selectedInbox.matchedCustomerEmail || selectedInbox.fromEmail}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <button className="btn-xs" onClick={() => startReplyDraft(selectedInbox)}>
                        <Reply size={13} />
                        Open reply lane
                      </button>
                      <button className="btn-xs-outline" onClick={() => void markInboxItemRead(selectedInbox.uid)} disabled={inboxActionUid === selectedInbox.uid}>
                        {inboxActionUid === selectedInbox.uid ? 'Saving...' : 'Clear ticket'}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Arrived</div>
                      <div className="mt-2 text-sm leading-6 text-slate-200">{formatInboxDate(selectedInbox.date)}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">{formatRelativeTime(selectedInbox.date)}</div>
                    </div>
                    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Reply address</div>
                      <div className="mt-2 text-sm leading-6 text-slate-200 break-all">{selectedInbox.fromEmail}</div>
                    </div>
                    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">CRM status</div>
                      <div className="mt-2 text-sm leading-6 text-slate-200">{selectedInbox.matchedCustomerEmail ? 'Matched customer' : 'Inbox only sender'}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{selectedInboxCustomer ? getCustomerStatus(selectedInboxCustomer) : 'Unknown plan state'}</div>
                    </div>
                    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Plan snapshot</div>
                      <div className="mt-2 text-sm leading-6 text-slate-200">{selectedInboxCustomer?.plan || 'No plan'}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {selectedInboxCustomer?.streams ? `${selectedInboxCustomer.streams} stream${selectedInboxCustomer.streams === 1 ? '' : 's'}` : 'Streams not loaded'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(6,14,32,0.84),rgba(4,8,18,0.96))] p-5 shadow-[0_24px_80px_rgba(8,15,42,0.28)]">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Subject</div>
                    <div className="mt-2 text-xl font-semibold leading-tight text-white break-words">{selectedInbox.subject || '(No subject)'}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {selectedInbox.matchedCustomerName ? 'Known customer' : 'New sender'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {replyContext?.uid === selectedInbox.uid ? 'Reply armed in lane' : 'Ready to reply'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-cyan-400/12 bg-[linear-gradient(180deg,rgba(10,22,42,0.84),rgba(7,14,28,0.92))] p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">Latest message</div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{buildTicketCode(selectedInbox.uid)}</div>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-black/15 p-4 text-[15px] leading-7 text-slate-200 whitespace-pre-wrap break-words">
                      {selectedInboxSections.latest || 'No plain text body found.'}
                    </div>
                  </div>

                  {selectedInboxSections.quoted ? (
                    <div className="rounded-[24px] border border-white/8 bg-black/15 p-5">
                      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">Earlier thread</div>
                      <div className="max-h-[18rem] overflow-y-auto rounded-[20px] border border-white/8 bg-[rgba(6,12,28,0.72)] p-4 text-sm leading-7 text-slate-400 whitespace-pre-wrap break-words">
                        {selectedInboxSections.quoted}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside ref={composerRef} className="ticket-panel">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Reply lane</div>
              <h3 className="mt-2 text-xl font-semibold text-white">Compose response</h3>
              <p className="mt-1 text-sm text-slate-400">Direct reply for one ticket or a controlled outbound send to selected customers.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{selectedCount} recipients</div>
          </div>
          <div className="space-y-4 p-5">
            {replyContext ? (
              <div className="reply-focus-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200">Reply armed</div>
                    <div className="mt-2 text-sm font-semibold text-white">{replyContext.matchedCustomerName || replyContext.fromEmail}</div>
                    <div className="mt-1 text-xs text-cyan-100/80">{replyContext.subject || '(No subject)'}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">This ticket auto-clears after a successful reply.</div>
                  </div>
                  <button className="btn-xs-outline" onClick={clearReplyMode}>Clear</button>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] p-4 text-sm text-slate-400">
                Open any ticket with <span className="text-cyan-200">Reply</span> to prefill the composer, or keep using the selected customer audience below for outbound updates.
              </div>
            )}
            <div>
              <label className="label">Recipients</label>
              <div className="input flex min-h-[3.25rem] items-center text-sm text-slate-300">{selectedCount === 0 ? 'No recipients selected' : `${selectedCount} recipient${selectedCount !== 1 ? 's' : ''} selected`}</div>
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input" placeholder="Important update..." value={subject} onChange={(event) => setSubject(event.target.value)} spellCheck />
            </div>
            <div className="flex flex-1 flex-col">
              <label className="label">Message</label>
              <textarea ref={messageRef} className="input min-h-[16rem] resize-y font-mono text-sm" placeholder="Write your message here..." value={body} onChange={(event) => setBody(event.target.value)} spellCheck />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="label">Attachments</label>
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Images only | 4MB max | up to 3</span>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-xs-outline cursor-pointer">
                    <ImagePlus size={14} />
                    Add image
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
                      const files = Array.from(event.target.files || [])
                      event.currentTarget.value = ''
                      if (files.length) addAttachments(files)
                    }} />
                  </label>
                  {attachments.length ? <div className="text-xs text-slate-400">{attachments.length} attachment{attachments.length !== 1 ? 's' : ''} ready</div> : <div className="text-xs text-slate-500">No images attached yet.</div>}
                </div>
                {attachmentError ? <div className="mt-2 text-xs text-rose-300">{attachmentError} <button className="text-cyan-200 hover:text-cyan-100" onClick={() => setAttachmentError('')}>clear</button></div> : null}
                {attachmentPreviews.length ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {attachmentPreviews.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="group relative overflow-hidden rounded-[18px] border border-cyan-400/15 bg-[rgba(8,14,32,0.7)] p-2">
                        <img src={item.url} alt={item.name} className="h-28 w-full rounded-[14px] object-cover" />
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{item.name}</div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{formatBytes(item.size)}</div>
                          </div>
                          <button className="inline-flex items-center gap-1 text-xs text-rose-200/90 hover:text-rose-100" onClick={() => removeAttachment(index)}>
                            <X size={12} />
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-white/8 pt-4">
              {msg ? <div className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('could not') ? 'text-rose-300' : 'text-emerald-300'}`}>{msg}</div> : null}
              <button className="btn w-full" onClick={() => void send()} disabled={sending || !subject || !body || selectedCount === 0}>
                <SendHorizonal size={15} />
                {sending ? 'Sending...' : replyContext ? 'Send reply' : 'Send email'}
              </button>
            </div>
          </div>
        </aside>
      </div>
      <section className="ticket-panel mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Audience studio</div>
            <h3 className="mt-2 text-xl font-semibold text-white">Customer selection</h3>
            <p className="mt-1 text-sm text-slate-400">Use this tray for targeted outbound email while keeping the live ticket desk separate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-xs-outline" onClick={() => exportCustomerEmails('txt')} disabled={loading || customers.length === 0}>
              <Download size={13} />
              Export TXT
            </button>
            <button className="btn-xs-outline" onClick={() => exportCustomerEmails('csv')} disabled={loading || customers.length === 0}>
              <Download size={13} />
              Export CSV
            </button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{selectedCount} selected</div>
          </div>
        </div>
        <div className="grid gap-6 p-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <input className="input" placeholder="Search customers..." value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {(['all', 'active', 'inactive', 'due_soon', 'overdue'] as const).map((value) => (
                <button key={value} onClick={() => setCustomerFilter(value)} className={`btn-xs-outline ${customerFilter === value ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100' : ''}`}>
                  {value.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-xs-outline" onClick={selectDueSoon2Months}>Due soon</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(1, 1)}>1 stream</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(2, 2)}>2 streams</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(3)}>3+ streams</button>
              <button className="btn-xs-outline border-rose-400/30 text-rose-300" onClick={() => setSelected({})}>Clear all</button>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                <Users size={14} />
                Selection summary
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{selectedCount}</div>
              <div className="mt-1 text-sm text-slate-400">Recipients currently loaded into the reply lane.</div>
              <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={selectAllCustomers} onChange={toggleAll} className="checkbox checkbox-xs checkbox-info" />
                Select all visible ({filteredCustomers.length})
              </label>
            </div>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-white/8 bg-black/10">
            <div className="grid grid-cols-[1.4fr_1fr_auto] gap-3 border-b border-white/8 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
              <div>Customer</div>
              <div>Status</div>
              <div>Pick</div>
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {loading ? <div className="p-4 text-sm text-slate-500">Loading customers...</div> : null}
              {!loading && filteredCustomers.length === 0 ? <div className="p-4 text-sm text-slate-500">No customers found.</div> : null}
              {!loading ? filteredCustomers.map((customer) => (
                <button key={customer.id} type="button" onClick={() => toggle(customer.email)} className={`grid w-full grid-cols-[1.4fr_1fr_auto] items-center gap-3 border-b border-white/6 px-4 py-3 text-left transition-colors last:border-b-0 ${selected[customer.email] ? 'bg-cyan-400/10' : 'hover:bg-white/5'}`}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{customer.full_name}</div>
                    <div className="mt-1 truncate text-xs text-slate-400">{customer.email}</div>
                  </div>
                  <div className="text-xs text-slate-400">{getCustomerStatus(customer)}</div>
                  <div className="flex justify-end">
                    <input type="checkbox" checked={Boolean(selected[customer.email])} onChange={() => undefined} className="checkbox checkbox-xs checkbox-info" />
                  </div>
                </button>
              )) : null}
            </div>
          </div>
        </div>
      </section>

      {showPlexPreview && plexPreview ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="glass max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-[30px] border border-cyan-400/20 bg-slate-950/85 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-white">Plex Sync Preview</div>
              <button className="btn-xs-outline" onClick={() => setShowPlexPreview(false)} disabled={confirmingSync}>Close</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              <div className="panel p-2"><div className="text-slate-400">Total</div><div className="font-semibold text-white">{plexPreview.totals.total}</div></div>
              <div className="panel p-2"><div className="text-slate-400">Linked</div><div className="font-semibold text-emerald-300">{plexPreview.totals.linked}</div></div>
              <div className="panel p-2"><div className="text-slate-400">Email mismatch</div><div className="font-semibold text-amber-300">{plexPreview.totals.mismatched}</div></div>
              <div className="panel p-2"><div className="text-slate-400">Not in CRM</div><div className="font-semibold text-rose-300">{plexPreview.totals.not_in_crm}</div></div>
              <div className="panel p-2"><div className="text-slate-400">Missing email</div><div className="font-semibold text-slate-200">{plexPreview.totals.missing_plex_email}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={`btn-xs-outline ${plexFilter === 'all' ? 'border-cyan-400/35 text-cyan-100' : ''}`} onClick={() => setPlexFilter('all')}>All</button>
              <button className={`btn-xs-outline ${plexFilter === 'mismatch' ? 'border-amber-400/35 text-amber-200' : ''}`} onClick={() => setPlexFilter('mismatch')}>Email mismatch</button>
              <button className={`btn-xs-outline ${plexFilter === 'not_in_crm' ? 'border-rose-400/35 text-rose-200' : ''}`} onClick={() => setPlexFilter('not_in_crm')}>Not in CRM</button>
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="checkbox checkbox-xs checkbox-info" checked={includeNotInCrm} onChange={(event) => setIncludeNotInCrm(event.target.checked)} />
                Include not-in-CRM
              </label>
            </div>
            <div className="mt-3 max-h-[48vh] overflow-y-auto rounded-[22px] border border-white/8">
              <div className="grid grid-cols-12 gap-2 border-b border-white/8 bg-white/5 px-3 py-2 text-[11px] text-slate-400">
                <div className="col-span-2">Status</div>
                <div className="col-span-3">Plex Username</div>
                <div className="col-span-3">Plex Email</div>
                <div className="col-span-4">Customer Email</div>
              </div>
              {previewRows.map((row, index) => (
                <div key={`${row.plex_email}:${row.plex_username}:${index}`} className="grid grid-cols-12 gap-2 border-b border-white/6 px-3 py-2 text-xs last:border-b-0">
                  <div className="col-span-2">
                    {row.status === 'linked' ? <span className="text-emerald-300">Linked</span> : null}
                    {row.status === 'email_mismatch' ? <span className="text-amber-300">Mismatch</span> : null}
                    {row.status === 'not_in_crm' ? <span className="text-rose-300">Not In CRM</span> : null}
                    {row.status === 'missing_plex_email' ? <span className="text-slate-400">Missing Email</span> : null}
                  </div>
                  <div className="col-span-3 truncate text-slate-200">{row.plex_username || '-'}</div>
                  <div className="col-span-3 truncate text-slate-200">{row.plex_email || '-'}</div>
                  <div className="col-span-4 truncate text-slate-200">{row.customer_email || (row.status === 'not_in_crm' ? '-' : '')}{row.status === 'email_mismatch' && row.linked_by ? <span className="ml-2 text-[10px] text-slate-500">({row.linked_by})</span> : null}</div>
                </div>
              ))}
              {previewRows.length === 0 ? <div className="p-4 text-sm text-slate-400">No rows</div> : null}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-xs-outline" onClick={() => setShowPlexPreview(false)} disabled={confirmingSync}>Cancel</button>
              <button className="btn-xs" onClick={() => void confirmPlexSyncSelection()} disabled={confirmingSync}>
                {confirmingSync ? 'Confirming...' : 'Confirm & Select'}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
