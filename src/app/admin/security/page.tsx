'use client'

import { useEffect, useMemo, useState } from 'react'

type BannedCustomer = {
  email: string
  name: string
  banned_at: string
  reason: string
  warning_count: number
}

type SecurityTrackedIp = {
  ip: string
  seen_count: number
  first_seen_at: string | null
  last_seen_at: string | null
  last_source: string | null
  user_agent: string | null
  country: string | null
  region: string | null
  city: string | null
  postal_code: string | null
  location_label: string
  blocked: boolean
}

type SecurityTrackedCustomer = {
  email: string
  name: string
  last_seen_at: string | null
  last_ip: string | null
  unique_ip_count: number
  total_events: number
  ips: SecurityTrackedIp[]
}

type SecurityRecentEvent = {
  action: string
  email: string
  name: string
  created_at: string
  ip: string
  source: string | null
  user_agent: string | null
  location_label: string
  blocked: boolean
}

type SecuritySummary = {
  tracked_customers: number
  unique_ips: number
  blocked_ips: number
  banned_customers: number
  recent_events: number
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

function sourceLabel(value: string | null | undefined) {
  const source = String(value || '').trim()
  if (!source) return 'Unknown'
  return source
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function AdminSecurityPage() {
  const [trackedCustomers, setTrackedCustomers] = useState<SecurityTrackedCustomer[]>([])
  const [recentEvents, setRecentEvents] = useState<SecurityRecentEvent[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const [bannedCustomers, setBannedCustomers] = useState<BannedCustomer[]>([])
  const [summary, setSummary] = useState<SecuritySummary>({
    tracked_customers: 0,
    unique_ips: 0,
    blocked_ips: 0,
    banned_customers: 0,
    recent_events: 0,
  })
  const [blockInput, setBlockInput] = useState('')
  const [msg, setMsg] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [query, setQuery] = useState('')

  async function load() {
    try {
      const r = await fetch('/api/admin/security/ips', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to load security data')
        return
      }
      setBlocked(Array.isArray(j.blocked_ips) ? j.blocked_ips : [])
      setBannedCustomers(Array.isArray(j.banned_customers) ? j.banned_customers : [])
      setTrackedCustomers(Array.isArray(j.tracked_customers) ? j.tracked_customers : [])
      setRecentEvents(Array.isArray(j.recent_ip_events) ? j.recent_ip_events : [])
      setSummary(j.summary || {
        tracked_customers: 0,
        unique_ips: 0,
        blocked_ips: 0,
        banned_customers: 0,
        recent_events: 0,
      })
      setMsg('')
    } catch {
      setMsg('Failed to load security data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function block(ip: string) {
    const cleanIp = String(ip || '').trim()
    if (!cleanIp) return
    setBusyKey(`block:${cleanIp}`)
    setMsg('')
    try {
      const r = await fetch('/api/admin/security/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: cleanIp }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to block IP')
        return
      }
      setBlocked(Array.isArray(j.blocked_ips) ? j.blocked_ips : [])
      setBlockInput('')
      await load()
    } catch (e: any) {
      setMsg(e?.message || 'Failed to block IP')
    } finally {
      setBusyKey('')
    }
  }

  async function unblock(ip: string) {
    const cleanIp = String(ip || '').trim()
    if (!cleanIp) return
    setBusyKey(`unblock:${cleanIp}`)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/security/block?ip=${encodeURIComponent(cleanIp)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to unblock IP')
        return
      }
      setBlocked(Array.isArray(j.blocked_ips) ? j.blocked_ips : [])
      await load()
    } catch (e: any) {
      setMsg(e?.message || 'Failed to unblock IP')
    } finally {
      setBusyKey('')
    }
  }

  async function unban(email: string) {
    setBusyKey(`unban:${email}`)
    setMsg('')
    try {
      const r = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban', customerEmail: email }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to unban customer')
        return
      }
      await load()
    } catch (e: any) {
      setMsg(e?.message || 'Failed to unban customer')
    } finally {
      setBusyKey('')
    }
  }

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return trackedCustomers
    return trackedCustomers.filter((customer) => {
      const haystack = `${customer.name} ${customer.email} ${customer.last_ip || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [query, trackedCustomers])

  const trackedEmailSet = useMemo(() => {
    return new Set(
      trackedCustomers.map((customer) => String(customer.email || '').trim().toLowerCase()).filter(Boolean)
    )
  }, [trackedCustomers])

  return (
    <main className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold gradient-text">Security</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Customer IP activity, approximate location, block controls, and ban status. Location comes from Vercel request headers and is approximate only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={load}>
            Refresh
          </button>
          <a href="/admin" className="btn-outline">
            Back to Admin
          </a>
        </div>
      </div>

      {msg ? <div className="glass mb-4 rounded-2xl p-3 text-sm text-rose-300">{msg}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Tracked Customers" value={summary.tracked_customers} />
        <SummaryCard title="Unique IPs" value={summary.unique_ips} />
        <SummaryCard title="Blocked IPs" value={summary.blocked_ips} />
        <SummaryCard title="Active Bans" value={summary.banned_customers} />
        <SummaryCard title="Recent Events" value={summary.recent_events} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="card-solid rounded-2xl border border-cyan-500/20 p-4 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="card-title">Tracked Customers</h3>
                <div className="mt-1 text-xs text-slate-500">Seen on login, registration, portal loads, payments, and live Plex session activity.</div>
              </div>
              <input
                className="input w-full lg:w-72"
                placeholder="Search customer or IP"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="mt-4 space-y-4">
              {filteredCustomers.length === 0 ? <div className="text-sm text-slate-400">No customer IP activity recorded yet.</div> : null}
              {filteredCustomers.map((customer) => (
                <div key={customer.email} className="rounded-[24px] border border-slate-700/70 bg-slate-950/30 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">{customer.name}</div>
                      <div className="mt-1 text-sm text-slate-400">{customer.email}</div>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                      <span className="rounded-full border border-white/8 px-3 py-1">Last seen: {formatDateTime(customer.last_seen_at)}</span>
                      <span className="rounded-full border border-white/8 px-3 py-1">IPs: {customer.unique_ip_count}</span>
                      <span className="rounded-full border border-white/8 px-3 py-1">Events: {customer.total_events}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {customer.ips.map((entry) => (
                      <div key={`${customer.email}:${entry.ip}`} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-100">{entry.ip}</div>
                            <div className="mt-1 text-xs text-slate-400">{entry.location_label}</div>
                            {entry.user_agent ? <div className="mt-2 text-[11px] text-slate-500 break-all">{entry.user_agent}</div> : null}
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            <span className="rounded-full border border-white/8 px-3 py-1 text-[11px] text-slate-300">Seen {entry.seen_count} times</span>
                            <span className="rounded-full border border-white/8 px-3 py-1 text-[11px] text-slate-300">{sourceLabel(entry.last_source)}</span>
                            {entry.blocked ? (
                              <button className="btn-xs-outline" onClick={() => unblock(entry.ip)} disabled={busyKey === `unblock:${entry.ip}`}>
                                {busyKey === `unblock:${entry.ip}` ? '...' : 'Unblock'}
                              </button>
                            ) : (
                              <button className="btn-xs-outline" onClick={() => block(entry.ip)} disabled={busyKey === `block:${entry.ip}`}>
                                {busyKey === `block:${entry.ip}` ? '...' : 'Block'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                          <div>First seen: {formatDateTime(entry.first_seen_at)}</div>
                          <div>Last seen: {formatDateTime(entry.last_seen_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-solid rounded-2xl border border-cyan-500/20 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="card-title">Recent IP Events</h3>
              <div className="text-xs text-slate-500">Latest {recentEvents.length}</div>
            </div>
            <div className="mt-4 space-y-3">
              {recentEvents.length === 0 ? <div className="text-sm text-slate-400">No recent events yet.</div> : null}
              {recentEvents.map((event) => (
                <div key={`${event.email}:${event.created_at}:${event.ip}:${event.source || 'unknown'}`} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{event.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{event.email}</div>
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(event.created_at)}</div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                    <div>IP: {event.ip}</div>
                    <div>Source: {sourceLabel(event.source)}</div>
                    <div>Location: {event.location_label}</div>
                    <div>Status: {event.blocked ? 'Blocked' : 'Seen'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-solid rounded-2xl border border-cyan-500/20 p-4 sm:p-6">
            <h3 className="card-title">Blocked IPs</h3>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input className="input flex-1" placeholder="IP to block" value={blockInput} onChange={(e) => setBlockInput(e.target.value)} />
              <button className="btn" onClick={() => block(blockInput)} disabled={!blockInput.trim() || busyKey === `block:${blockInput.trim()}`}>
                Add
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {blocked.map((ip) => (
                <div key={ip} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  <span>{ip}</span>
                  <button className="btn-xs-outline" onClick={() => unblock(ip)} disabled={busyKey === `unblock:${ip}`}>
                    {busyKey === `unblock:${ip}` ? '...' : 'Remove'}
                  </button>
                </div>
              ))}
              {blocked.length === 0 ? <div className="text-sm text-slate-400">No blocked IPs.</div> : null}
            </div>
          </div>

          <div className="card-solid rounded-2xl border border-rose-500/20 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="card-title">Banned Customers</h3>
              <div className="text-xs text-slate-500">{bannedCustomers.length} active</div>
            </div>
            <div className="mt-4 space-y-3">
              {bannedCustomers.length === 0 ? <div className="text-sm text-slate-400">No customer bans are active.</div> : null}
              {bannedCustomers.map((customer) => (
                <div key={customer.email} className="rounded-[22px] border border-rose-500/15 bg-rose-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{customer.name}</div>
                      <div className="mt-1 text-sm text-slate-400">{customer.email}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-xs uppercase tracking-[0.24em] text-rose-200">
                          Warnings: {Math.min(customer.warning_count || 0, 3)}/3
                        </span>
                        {!trackedEmailSet.has(String(customer.email || '').trim().toLowerCase()) ? (
                          <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-200">
                            Email-only ban
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="btn-xs-outline"
                      onClick={() => unban(customer.email)}
                      disabled={busyKey === `unban:${customer.email}`}
                    >
                      {busyKey === `unban:${customer.email}` ? 'Unbanning...' : 'Unban'}
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">{customer.reason || 'Terms of service breach'}</div>
                  <div className="mt-2 text-xs text-slate-500">Banned: {formatDateTime(customer.banned_at)}</div>
                  {!trackedEmailSet.has(String(customer.email || '').trim().toLowerCase()) ? (
                    <div className="mt-3 rounded-[16px] border border-amber-400/12 bg-amber-500/8 px-3 py-2 text-xs text-amber-100">
                      This ban is active from the customer email record, but no tracked IP or portal activity has been seen for this email yet.
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="card-solid rounded-2xl border border-cyan-500/20 p-4 sm:p-6">
            <h3 className="card-title">What This Tracks</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Portal activity now records customer login, registration, portal visits, payment page visits, and live Plex session IPs.</p>
              <p>Location is approximate only. You can usually get city, region, and country, but not an exact street address.</p>
              <p>IP blocks are operator controls. Customer bans remain the stronger account-level action because they directly stop portal access and playback.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="card-solid rounded-2xl border border-cyan-500/15 p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
    </div>
  )
}
