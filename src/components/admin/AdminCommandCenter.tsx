'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Cpu, Mail, MonitorPlay, Search, Users, Wifi } from 'lucide-react'
import { getStatus } from '@/lib/pricing'
import AdminDashboard from './AdminDashboard'

type Customer = {
  id: string
  full_name: string
  email: string
  plan?: string
  streams?: number
  next_due_date?: string
  status?: string
  plex_username?: string
}

type InboxMessage = {
  id: string
  uid: number
  fromEmail: string
  fromName: string
  subject: string
  date: string | null
  preview: string
  matchedCustomerEmail: string | null
  matchedCustomerName: string | null
  serviceScore: number
}

type Conversation = {
  id: string
  status: 'active' | 'waiting' | 'closed'
  updated_at: string
  metadata?: {
    email?: string
    full_name?: string
  } | null
}

type PlexSession = {
  sessionKey: string
  title: string
  player: string
  product: string
  customer_name: string | null
  customer_email: string | null
  active_streams: number
  allowed_streams: number
  over_limit: boolean
  isTranscoding: boolean
  bandwidthKbps: number
  state: string
}

type PlexSummary = {
  activeSessions: number
  transcodingSessions: number
  overLimitSessions: number
  remoteSessions: number
  hostCpuUtilization: number
  processMemoryUtilization: number
}

const ADMIN_COMMAND_CENTER_REFRESH_MS = 2000
const ADMIN_COMMAND_CENTER_DUE_WINDOW_MONTHS = 2

function formatRelative(value: string | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMbpsFromKbps(value: number) {
  const mbps = Number(value || 0) / 1000
  return `${mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function getCommandCenterRenewalState(nextDueRaw?: string, status?: string) {
  if (!nextDueRaw || status === 'inactive') return null
  const nextDue = new Date(nextDueRaw)
  if (Number.isNaN(nextDue.getTime())) return null

  const today = startOfLocalDay(new Date())
  const dueDate = startOfLocalDay(nextDue)
  const windowEnd = startOfLocalDay(new Date(today))
  windowEnd.setMonth(windowEnd.getMonth() + ADMIN_COMMAND_CENTER_DUE_WINDOW_MONTHS)

  if (dueDate < today) return { label: 'Overdue' as const, dueDate }
  if (dueDate.getTime() === today.getTime()) return { label: 'Due Today' as const, dueDate }
  if (dueDate <= windowEnd) return { label: 'Due Soon' as const, dueDate }
  return { label: 'Active' as const, dueDate }
}

export default function AdminCommandCenter() {
  const loadedOnceRef = useRef(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [inbox, setInbox] = useState<InboxMessage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [plexSessions, setPlexSessions] = useState<PlexSession[]>([])
  const [plexSummary, setPlexSummary] = useState<PlexSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        if (active) {
          setError('')
          if (!loadedOnceRef.current) setLoading(true)
        }

        const [customersRes, inboxRes, conversationsRes, plexRes] = await Promise.all([
          fetch('/api/customers', { cache: 'no-store' }),
          fetch('/api/admin/email/inbox?serviceOnly=true&unreadOnly=true&limit=6', { cache: 'no-store' }),
          fetch('/api/chat/conversations', { cache: 'no-store' }),
          fetch('/api/admin/plex/sessions', { cache: 'no-store' }),
        ])

        const [customersData, inboxData, conversationsData, plexData] = await Promise.all([
          customersRes.json().catch(() => []),
          inboxRes.json().catch(() => ({})),
          conversationsRes.json().catch(() => []),
          plexRes.json().catch(() => ({})),
        ])

        if (!active) return

        setCustomers(Array.isArray(customersData) ? customersData : [])
        setInbox(Array.isArray(inboxData?.messages) ? inboxData.messages : [])
        setConversations(Array.isArray(conversationsData) ? conversationsData : [])
        setPlexSessions(Array.isArray(plexData?.items) ? plexData.items.slice(0, 6) : [])
        setPlexSummary(plexData?.summary || null)
        loadedOnceRef.current = true

        if (!customersRes.ok || !conversationsRes.ok || !plexRes.ok) {
          setError(
            String(
              (customersData as any)?.error ||
                inboxData?.error ||
                (conversationsData as any)?.error ||
                plexData?.error ||
                'Some live admin data could not be loaded.'
            )
          )
        }
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load command center data.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, ADMIN_COMMAND_CENTER_REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const queueStats = useMemo(() => {
    const waiting = conversations.filter((conversation) => conversation.status === 'waiting').length
    const activeCount = conversations.filter((conversation) => conversation.status === 'active').length
    return { waiting, active: activeCount }
  }, [conversations])

  const dueSummary = useMemo(() => {
    const today = startOfLocalDay(new Date())
    const windowEnd = startOfLocalDay(new Date(today))
    windowEnd.setMonth(windowEnd.getMonth() + ADMIN_COMMAND_CENTER_DUE_WINDOW_MONTHS)
    let dueSoon = 0
    let overdue = 0
    for (const customer of customers) {
      const rawDueDate = String(customer.next_due_date || '').trim()
      const customerStatus = String(customer.status || '').trim().toLowerCase()
      if (!rawDueDate || customerStatus === 'inactive') continue
      const dueDate = startOfLocalDay(new Date(rawDueDate))
      if (Number.isNaN(dueDate.getTime())) continue
      if (dueDate < today) overdue += 1
      else if (dueDate <= windowEnd) dueSoon += 1
    }
    return { dueSoon, overdue }
  }, [customers])

  const upcomingRenewals = useMemo(() => {
    return customers
      .map((customer) => {
        const renewal = getCommandCenterRenewalState(customer.next_due_date, customer.status)
        if (!customer.next_due_date || !renewal) return null
        if (renewal.label !== 'Due Soon' && renewal.label !== 'Due Today' && renewal.label !== 'Overdue') return null
        return {
          ...customer,
          renewalLabel: renewal.label,
          dueDate: renewal.dueDate,
        }
      })
      .filter((customer): customer is Customer & { renewalLabel: 'Due Soon' | 'Due Today' | 'Overdue'; dueDate: Date } => Boolean(customer))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 8)
  }, [customers])

  const filteredCustomers = useMemo(() => {
    const clean = query.trim().toLowerCase()
    const list = clean
      ? customers.filter((customer) =>
          `${customer.full_name || ''} ${customer.email || ''} ${customer.plex_username || ''}`.toLowerCase().includes(clean)
        )
      : customers

    return list.slice(0, clean ? 8 : 6)
  }, [customers, query])

  const statCards = [
    {
      label: 'Waiting Chat',
      value: String(queueStats.waiting),
      note: `${queueStats.active} live now`,
      icon: Wifi,
    },
    {
      label: 'Unread Mail',
      value: String(inbox.length),
      note: 'customer replies',
      icon: Mail,
    },
    {
      label: 'Active Streams',
      value: String(plexSummary?.activeSessions || 0),
      note: `${plexSummary?.transcodingSessions || 0} transcoding`,
      icon: MonitorPlay,
    },
    {
      label: 'Due Soon',
      value: String(dueSummary.dueSoon),
      note: `${dueSummary.overdue} overdue`,
      icon: Users,
    },
  ]

  return (
    <div className="space-y-6">
      <section className="panel-strong panel-lift overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow">Admin Command Center</div>
            <h1 className="mt-4 text-3xl font-semibold text-white sm:text-[2.3rem]">Operations, customers, mail, and Plex on one working page.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This page is now the merged daily workflow: live support stays here, with Plex load, unread mail, due renewals, and customer lookup above it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/customers" className="btn-outline">
              Customers
            </Link>
            <Link href="/admin/email" className="btn-outline">
              Mail
            </Link>
            <Link href="/admin/plex-tools" className="btn-outline">
              Plex Tools
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="panel panel-lift p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{card.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{card.note}</div>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                    <Icon size={18} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Plex Load</div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Cpu size={17} className="text-cyan-300" />
              {Number(plexSummary?.hostCpuUtilization || 0).toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-400">Host CPU right now</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Plex Memory</div>
            <div className="mt-2 text-lg font-semibold text-white">{Number(plexSummary?.processMemoryUtilization || 0).toFixed(1)}%</div>
            <div className="mt-1 text-xs text-slate-400">Plex process memory use</div>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-[22px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div> : null}
        {loading ? <div className="mt-4 text-sm text-slate-500">Loading live command center data...</div> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="panel panel-lift p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">Customer quick lookup</div>
                <div className="mt-1 text-sm text-slate-400">Search by name, email, or Plex username, then jump straight into the right area.</div>
              </div>
              <div className="relative w-full sm:max-w-md">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input pl-11"
                  placeholder="Search customer, email, Plex username..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {filteredCustomers.length === 0 ? <div className="text-sm text-slate-500">No customer matches.</div> : null}
              {filteredCustomers.map((customer) => {
                const status = customer.plan && customer.next_due_date ? (customer.status === 'inactive' ? 'Inactive' : getStatus(new Date(customer.next_due_date))) : 'Registered'
                return (
                  <div key={customer.id} className="panel p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{customer.full_name || customer.email}</div>
                        <div className="mt-1 truncate text-sm text-slate-400">{customer.email}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          <span>{customer.plan || 'Registered'}</span>
                          <span>{customer.streams || 1} stream{Number(customer.streams || 1) === 1 ? '' : 's'}</span>
                          <span>{status}</span>
                          {customer.plex_username ? <span>Plex {customer.plex_username}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/customers`} className="btn-xs-outline">
                          CRM
                        </Link>
                        <Link href={`/admin/plex-tools?email=${encodeURIComponent(customer.email || '')}`} className="btn-xs-outline">
                          Plex
                        </Link>
                        <Link href="/admin/email" className="btn-xs">
                          Email
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel panel-lift p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Live Plex activity</div>
                <div className="mt-1 text-sm text-slate-400">Top live sessions with immediate signal on transcodes and stream-limit pressure.</div>
              </div>
              <Link href="/admin/plex-tools" className="btn-xs-outline">
                Full Plex view
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {plexSessions.length === 0 ? <div className="text-sm text-slate-500">No active Plex sessions right now.</div> : null}
              {plexSessions.map((session) => (
                <div key={session.sessionKey} className="panel p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{session.customer_name || session.customer_email || 'Unknown viewer'}</div>
                      <div className="mt-1 truncate text-sm text-slate-300">{session.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <span>{session.player || session.product || 'Player unknown'}</span>
                        <span>{session.state || 'Active'}</span>
                        <span>{formatMbpsFromKbps(session.bandwidthKbps || 0)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session.isTranscoding ? <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Transcoding</span> : null}
                      {session.over_limit ? <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">{session.active_streams}/{session.allowed_streams}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel panel-lift p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Unread customer mail</div>
                <div className="mt-1 text-sm text-slate-400">Recent matched unread replies, kept here so you do not need to jump away first.</div>
              </div>
              <Link href="/admin/email" className="btn-xs-outline">
                Open mail
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {inbox.length === 0 ? <div className="text-sm text-slate-500">No unread customer replies right now.</div> : null}
              {inbox.map((mail) => (
                <div key={mail.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{mail.matchedCustomerName || mail.fromName || mail.fromEmail}</div>
                      <div className="mt-1 truncate text-sm text-slate-300">{mail.subject || '(No subject)'}</div>
                      <div className="mt-2 text-xs leading-6 text-slate-400">{mail.preview}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500">{formatRelative(mail.date || undefined)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel panel-lift p-5">
            <div className="text-lg font-semibold text-white">Priority queue</div>
            <div className="mt-4 grid gap-3">
              <div className="panel p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                    <Wifi size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{queueStats.waiting} waiting chats</div>
                    <div className="mt-1 text-xs text-slate-400">Customers waiting for the first reply.</div>
                  </div>
                </div>
              </div>
              <div className="panel p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-rose-300">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{plexSummary?.overLimitSessions || 0} over-limit streams</div>
                    <div className="mt-1 text-xs text-slate-400">Accounts currently over their stream allowance.</div>
                  </div>
                </div>
              </div>
              <div className="panel p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-amber-300">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{dueSummary.dueSoon} renewals due in the next 2 months</div>
                    <div className="mt-1 text-xs text-slate-400">{dueSummary.overdue} already overdue.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel panel-lift p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Upcoming renewals</div>
                <div className="mt-1 text-sm text-slate-400">Anyone due today, overdue, or due within the next 2 months.</div>
              </div>
              <Link href="/admin/customers" className="btn-xs-outline">
                Open accounts
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {upcomingRenewals.length === 0 ? <div className="text-sm text-slate-500">No renewals in the next 2 months.</div> : null}
              {upcomingRenewals.map((customer) => (
                <div key={customer.id} className="panel p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{customer.full_name || customer.email}</div>
                      <div className="mt-1 truncate text-sm text-slate-400">{customer.email}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <span>{customer.plan || 'Registered'}</span>
                        <span>{customer.streams || 1} stream{Number(customer.streams || 1) === 1 ? '' : 's'}</span>
                        {customer.plex_username ? <span>Plex {customer.plex_username}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          customer.renewalLabel === 'Overdue'
                            ? 'border border-rose-400/20 bg-rose-500/10 text-rose-200'
                            : customer.renewalLabel === 'Due Today'
                              ? 'border border-amber-400/20 bg-amber-500/10 text-amber-200'
                              : 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200'
                        }`}
                      >
                        {customer.renewalLabel}
                      </span>
                      <div className="text-xs text-slate-400">Due {formatRelative(customer.next_due_date)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel panel-lift p-5">
            <div className="text-lg font-semibold text-white">Operator shortcuts</div>
            <div className="mt-4 grid gap-2">
              <Link href="/admin/email" className="btn-outline justify-between">
                Reply to unread mail
                <ArrowRight size={15} />
              </Link>
              <Link href="/admin/customers" className="btn-outline justify-between">
                Manage renewals and customer records
                <ArrowRight size={15} />
              </Link>
              <Link href="/admin/plex-tools" className="btn-outline justify-between">
                Open full Plex controls
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-white">Live support workspace</div>
            <div className="mt-1 text-sm text-slate-400">Support stays here underneath the operator strip so the whole admin workflow lives on one page.</div>
          </div>
        </div>
        <AdminDashboard />
      </section>
    </div>
  )
}
