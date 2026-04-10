'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, Mail, Users, Wifi, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSupabase } from '@/lib/supabaseClient'

type PulseRole = 'admin' | 'customer'

type PulseIdentity = {
  role: PulseRole
  email: string
}

type AdminPulse = {
  role: 'admin'
  counts: {
    onlineNow: number
    waitingChats: number
    activeChats: number
    unreadMail: number
    checkoutStarts: number
    activeStreams: number
    flaggedStreams: number
    transcoding: number
  }
  onlineUsers: Array<{
    id: string
    name: string
    email: string
    source: string
    seenAt: string
  }>
  alerts: Array<{
    id: string
    kind: 'chat' | 'mail' | 'plex' | 'site' | 'checkout'
    level: 'info' | 'warn' | 'critical'
    title: string
    body: string
    href: string
    createdAt: string | null
  }>
}

type CustomerPulse = {
  role: 'customer'
  account: {
    name: string
    email: string
    status: string
    nextDueDate: string | null
    plan: string | null
  }
  support: {
    availability: string
  }
  chatMessages: Array<{
    id: string
    conversationId: string
    content: string
    timestamp: string | null
  }>
  serviceUpdates: Array<{
    id: string
    title: string
    createdAt: string | null
  }>
}

type PulseSummary = AdminPulse | CustomerPulse

const ADMIN_PULSE_REFRESH_MS = 2000
const CUSTOMER_PULSE_REFRESH_MS = 1500
const PULSE_SOUND_COOLDOWN_MS = 900

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function getSeenChatKey(email: string) {
  return `pulse_seen_chat:${normalizeEmail(email)}`
}

function getSeenChatIds(email: string) {
  try {
    const raw = window.localStorage.getItem(getSeenChatKey(email))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || '')) : [])
  } catch {
    return new Set<string>()
  }
}

function saveSeenChatIds(email: string, ids: string[]) {
  try {
    window.localStorage.setItem(getSeenChatKey(email), JSON.stringify(Array.from(new Set(ids)).slice(-40)))
  } catch {}
}

function previewText(value: string, limit = 68) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Open the live workspace.'
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

function formatAge(value: string | null | undefined) {
  if (!value) return 'now'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 'now'
  const diff = Math.max(0, Date.now() - time)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
}

function canPlayAdminAlertSound(alert: AdminPulse['alerts'][number] | null | undefined) {
  if (!alert) return false
  if (alert.kind === 'chat' || alert.kind === 'mail') return true
  if (alert.kind !== 'plex') return false
  return alert.level === 'critical'
}

function canPlayCustomerAlertSound(kind: 'chat' | 'update') {
  return kind === 'chat'
}

export default function GlobalPulse() {
  const pathname = usePathname() || '/'
  const [identity, setIdentity] = useState<PulseIdentity | null>(null)
  const [summary, setSummary] = useState<PulseSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const notifiedIdsRef = useRef<Set<string>>(new Set())
  const seededRef = useRef(false)
  const audioReadyRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastSoundAtRef = useRef(0)
  const isAdminRoute = pathname.startsWith('/admin')
  const isCustomerRoute = pathname.startsWith('/customer')

  useEffect(() => {
    function armAudio() {
      audioReadyRef.current = true
    }

    window.addEventListener('pointerdown', armAudio, { passive: true })
    window.addEventListener('keydown', armAudio)
    return () => {
      window.removeEventListener('pointerdown', armAudio)
      window.removeEventListener('keydown', armAudio)
    }
  }, [])

  function playPulseSound() {
    if (!audioReadyRef.current) return
    if (Date.now() - lastSoundAtRef.current < PULSE_SOUND_COOLDOWN_MS) return
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const context = audioContextRef.current && audioContextRef.current.state !== 'closed' ? audioContextRef.current : new Ctx()
      audioContextRef.current = context
      if (context.state === 'suspended') {
        void context.resume().catch(() => null)
      }
      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, now)
      oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.09)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.23)
      lastSoundAtRef.current = Date.now()
    } catch {}
  }

  useEffect(() => {
    let alive = true
    let retryTimer: number | null = null
    const supabase = getSupabase()

    async function hydrateIdentity() {
      const adminAlias = normalizeEmail(process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local')
      let adminSessionOk = false
      try {
        const sessionCheck = await fetch('/api/admin/auth/session', { cache: 'no-store' })
        adminSessionOk = sessionCheck.ok
        if (sessionCheck.ok && alive && (isAdminRoute || !isCustomerRoute)) {
          setIdentity({ role: 'admin', email: adminAlias })
          return
        }
      } catch {}

      if (!supabase) {
        if (alive) setLoading(false)
        return
      }

      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
      const userEmail = normalizeEmail(data.user?.email)
      if (!userEmail) {
        if (alive) {
          setLoading(false)
          if ((isAdminRoute || isCustomerRoute) && retryTimer == null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null
              void hydrateIdentity()
            }, 900)
          }
        }
        return
      }

      if (userEmail === adminAlias && !isCustomerRoute) {
        if (alive) setIdentity({ role: 'admin', email: userEmail })
        return
      }

      let profile: { role?: string } | null = null
      try {
        const response = await supabase.from('profiles').select('role').eq('email', userEmail).maybeSingle()
        profile = (response?.data as { role?: string } | null) || null
      } catch {}

      const roleFromProfile = String((profile as any)?.role || 'customer').trim().toLowerCase() === 'admin' ? 'admin' : 'customer'
      if (!adminSessionOk && roleFromProfile === 'admin' && !isCustomerRoute) {
        try {
          const sessionBootstrap = await fetch('/api/admin/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail }),
          })
          adminSessionOk = sessionBootstrap.ok
        } catch {}
      }

      if (isAdminRoute && roleFromProfile !== 'admin' && userEmail !== adminAlias && !adminSessionOk) {
        if (alive) {
          setIdentity(null)
          setSummary(null)
          setLoading(false)
        }
        return
      }

      const role = isCustomerRoute ? 'customer' : adminSessionOk || roleFromProfile === 'admin' ? 'admin' : roleFromProfile
      if (alive) setIdentity({ role, email: userEmail })
    }

    setLoading(true)
    setOpen(false)
    setIdentity(null)
    setSummary(null)
    seededRef.current = false
    notifiedIdsRef.current = new Set()
    void hydrateIdentity()

    const authSubscription = supabase?.auth.onAuthStateChange(() => {
      if (!alive) return
      setLoading(true)
      void hydrateIdentity()
    })

    return () => {
      alive = false
      if (retryTimer) window.clearTimeout(retryTimer)
      authSubscription?.data.subscription.unsubscribe()
    }
  }, [isAdminRoute, isCustomerRoute, pathname])

  useEffect(() => {
    if (!identity) {
      setLoading(false)
      return
    }

    const currentIdentity = identity
    let alive = true
    let timer: number | null = null

    async function fetchSummary() {
      try {
        const supabase = getSupabase()
        const token = (await supabase?.auth.getSession().catch(() => ({ data: { session: null } })))?.data.session?.access_token

        const res = await fetch(`/api/live-pulse/${currentIdentity.role}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json().catch(() => null)
        if (!alive || !res.ok || !data) return

        const nextIds =
          currentIdentity.role === 'admin'
            ? [
                ...(data.alerts || []).map((alert: any) => String(alert?.id || '')),
                ...(data.onlineUsers || []).map((user: any) => `visit:${normalizeEmail(user?.email)}`),
              ]
            : [
                ...(data.chatMessages || []).map((message: any) => `chat:${String(message?.id || '')}`),
                ...(data.serviceUpdates || []).map((update: any) => `update:${String(update?.id || '')}`),
              ]

        if (!seededRef.current) {
          notifiedIdsRef.current = new Set(nextIds)
          seededRef.current = true
        } else {
          for (const id of nextIds) {
            if (!id || notifiedIdsRef.current.has(id)) continue
            notifiedIdsRef.current.add(id)
            if (currentIdentity.role === 'admin') {
              const alert = (data.alerts || []).find((entry: any) => String(entry?.id || '') === id)
              if (alert) {
                if (canPlayAdminAlertSound(alert)) playPulseSound()
                toast(`${alert.title}: ${previewText(alert.body, 52)}`)
              } else if (id.startsWith('visit:')) {
                const email = id.replace(/^visit:/, '')
                const user = (data.onlineUsers || []).find((entry: any) => normalizeEmail(entry?.email) === email)
                if (user) toast(`${user.name || user.email} is on the website`)
              }
            } else if (id.startsWith('chat:')) {
              const message = (data.chatMessages || []).find((entry: any) => `chat:${String(entry?.id || '')}` === id)
              if (message) {
                if (canPlayCustomerAlertSound('chat')) playPulseSound()
                toast(`New support reply: ${previewText(message.content, 56)}`)
              }
            } else if (id.startsWith('update:')) {
              const update = (data.serviceUpdates || []).find((entry: any) => `update:${String(entry?.id || '')}` === id)
              if (update) toast(`Service announcement: ${previewText(update.title, 56)}`)
            }
          }
        }

        setSummary(data)
      } finally {
        if (alive) setLoading(false)
      }
    }

    async function trackPresence() {
      try {
        await fetch('/api/security/ip-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentIdentity.email,
            source: currentIdentity.role === 'admin' ? 'admin-shell' : 'customer-shell',
          }),
        })
      } catch {}
    }

    void fetchSummary()
    void trackPresence()

    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchSummary()
        void trackPresence()
      }
    }, currentIdentity.role === 'admin' ? ADMIN_PULSE_REFRESH_MS : CUSTOMER_PULSE_REFRESH_MS)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchSummary()
        void trackPresence()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [identity])

  const customerUnseen = useMemo(() => {
    if (!summary || summary.role !== 'customer' || typeof window === 'undefined') return { chats: 0, update: false }
    const seenChatIds = getSeenChatIds(identity?.email || '')
    const chats = summary.chatMessages.filter((message) => !seenChatIds.has(message.id)).length
    const latestUpdate = summary.serviceUpdates[0]
    const seenUpdate = latestUpdate ? window.localStorage.getItem(`svc_updates_seen:${summary.account.email}`) : null
    const update = Boolean(latestUpdate && String(seenUpdate || '') !== String(latestUpdate.id || latestUpdate.createdAt || ''))
    return { chats, update }
  }, [identity?.email, summary])

  useEffect(() => {
    if (!open || !summary || summary.role !== 'customer') return
    saveSeenChatIds(
      summary.account.email,
      summary.chatMessages.map((message) => message.id)
    )
  }, [open, summary])

  const shouldRenderShell = isAdminRoute || isCustomerRoute
  if (!identity || !summary) {
    if (!shouldRenderShell) return null
    return (
      <div className="pointer-events-none fixed bottom-5 left-4 z-50 sm:left-5">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="glass-strong flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border px-3.5 py-3 text-left shadow-[0_18px_60px_rgba(8,145,178,0.24)]"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/22 bg-cyan-400/10 text-cyan-200">
              <Bell size={16} />
              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">
                {isAdminRoute ? 'Site Pulse' : 'Live Notice'}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">
                {loading ? 'Connecting live notifications...' : 'Live notifications unavailable'}
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
              ...
            </div>
          </button>
        </div>
      </div>
    )
  }

  const adminSummary = summary?.role === 'admin' ? summary : null
  const customerSummary = summary?.role === 'customer' ? summary : null
  const totalBadges = adminSummary
    ? adminSummary.counts.onlineNow + adminSummary.counts.waitingChats + adminSummary.counts.unreadMail + adminSummary.counts.checkoutStarts + adminSummary.counts.flaggedStreams + adminSummary.counts.transcoding
    : customerSummary
      ? customerUnseen.chats + (customerUnseen.update ? 1 : 0)
      : 0

  return (
    <div className="pointer-events-none fixed bottom-5 left-4 z-50 sm:left-5">
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`glass-strong flex items-center gap-3 rounded-full border px-3.5 py-3 text-left shadow-[0_18px_60px_rgba(8,145,178,0.24)] ${
            open ? 'w-[22rem] sm:w-[25rem]' : 'max-w-[calc(100vw-2rem)]'
          }`}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/22 bg-cyan-400/10 text-cyan-200">
            <Bell size={16} />
            <span className={`absolute right-0 top-0 h-2.5 w-2.5 rounded-full ${totalBadges > 0 ? 'bg-cyan-300' : 'bg-emerald-300'}`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">
              {identity.role === 'admin' ? 'Site Pulse' : 'Live Notice'}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-white">
              {identity.role === 'admin'
                ? `${adminSummary?.counts.onlineNow || 0} on site, ${adminSummary?.counts.checkoutStarts || 0} checkout, ${adminSummary?.counts.flaggedStreams || 0} flagged`
                : customerSummary?.support.availability === 'off'
                  ? 'Support messages stay queued while offline'
                  : `${customerUnseen.chats} chat replies, ${customerUnseen.update ? 1 : 0} service notice`}
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
            {totalBadges}
          </div>
        </button>

        {open ? (
          <div className="glass-strong mt-3 w-[22rem] overflow-hidden rounded-[28px] border border-cyan-400/16 p-4 shadow-[0_28px_90px_rgba(2,132,199,0.24)] sm:w-[25rem]">
            {adminSummary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Online</div>
                    <div className="mt-2 text-lg font-semibold text-white">{adminSummary.counts.onlineNow}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Checkout</div>
                    <div className="mt-2 text-lg font-semibold text-white">{adminSummary.counts.checkoutStarts}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Mail</div>
                    <div className="mt-2 text-lg font-semibold text-white">{adminSummary.counts.unreadMail}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Chat</div>
                    <div className="mt-2 text-lg font-semibold text-white">{adminSummary.counts.waitingChats}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Plex</div>
                    <div className="mt-2 text-lg font-semibold text-white">{adminSummary.counts.flaggedStreams + adminSummary.counts.transcoding}</div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <Users size={12} className="text-cyan-300" />
                    Currently on the website
                  </div>
                  <div className="space-y-2">
                    {adminSummary.onlineUsers.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                        No fresh website activity in the last few minutes.
                      </div>
                    ) : (
                      adminSummary.onlineUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{user.name || user.email}</div>
                            <div className="mt-1 text-xs text-slate-400">{user.source.replace(/-/g, ' ')}</div>
                          </div>
                          <div className="text-xs text-slate-500">{formatAge(user.seenAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <Zap size={12} className="text-cyan-300" />
                    Live alerts
                  </div>
                  <div className="space-y-2">
                    {adminSummary.alerts.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                        No pressure signals right now.
                      </div>
                    ) : (
                      adminSummary.alerts.slice(0, 6).map((alert) => (
                        <Link
                          key={alert.id}
                          href={alert.href}
                          className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 hover:border-cyan-400/25 hover:bg-cyan-400/[0.06]"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{alert.title}</div>
                            <div className="mt-1 truncate text-xs text-slate-400">{previewText(alert.body, 60)}</div>
                          </div>
                          <ChevronRight size={15} className="shrink-0 text-slate-500" />
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : customerSummary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Chat</div>
                    <div className="mt-2 text-lg font-semibold text-white">{customerUnseen.chats}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Updates</div>
                    <div className="mt-2 text-lg font-semibold text-white">{customerUnseen.update ? 1 : 0}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Status</div>
                    <div className="mt-2 text-sm font-semibold text-white">{customerSummary.account.status}</div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-cyan-400/14 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(15,23,42,0.18))] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">Support channel</div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {customerSummary.support.availability === 'off' ? 'Messages are queued right now' : 'Live chat notices stay active'}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    Admin replies and service announcements now surface here across the customer area.
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <Wifi size={12} className="text-cyan-300" />
                    Recent chat replies
                  </div>
                  <div className="space-y-2">
                    {customerSummary.chatMessages.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                        No new replies from support yet.
                      </div>
                    ) : (
                      customerSummary.chatMessages.slice(0, 4).map((message) => (
                        <Link
                          key={message.id}
                          href="/customer"
                          className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 hover:border-cyan-400/25 hover:bg-cyan-400/[0.06]"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">Support replied</div>
                            <div className="mt-1 truncate text-xs text-slate-400">{previewText(message.content, 60)}</div>
                          </div>
                          <div className="text-xs text-slate-500">{formatAge(message.timestamp)}</div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <Mail size={12} className="text-cyan-300" />
                    Service announcements
                  </div>
                  <div className="space-y-2">
                    {customerSummary.serviceUpdates.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                        No new announcements right now.
                      </div>
                    ) : (
                      customerSummary.serviceUpdates.slice(0, 3).map((update) => (
                        <Link
                          key={update.id}
                          href="/customer/service-updates"
                          className="flex items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 hover:border-cyan-400/25 hover:bg-cyan-400/[0.06]"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{update.title}</div>
                            <div className="mt-1 text-xs text-slate-400">Open full service update history</div>
                          </div>
                          <div className="text-xs text-slate-500">{formatAge(update.createdAt)}</div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
