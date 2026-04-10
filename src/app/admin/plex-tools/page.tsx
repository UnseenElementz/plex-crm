'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

type ShareRow = {
  server_name: string
  server_machine_id: string
  email: string
  username: string
  customer_name?: string | null
  share_id: string
  plex_user_id: string
  all_libraries: boolean | null
  allow_sync: boolean | null
  allow_tuners: boolean | null
  allow_channels: boolean | null
  allow_camera_upload: boolean | null
  allow_subtitle_admin: boolean | null
  filter_all: string | null
  filter_movies: string | null
  filter_television: string | null
  accepted_at: string | null
  invited_at: string | null
  raw: Record<string, string>
}

type Customer = {
  email: string
  full_name: string
  plan?: string
  streams?: number
  status?: string
  downloads?: boolean
}

type LibraryRow = {
  id: number
  title: string
  type: string
  is_shared?: boolean
}

type SessionRow = {
  sessionKey: string
  title: string
  primaryTitle: string
  secondaryTitle: string
  type: string
  activityContext?: string
  user: string
  userId: string
  player: string
  product: string
  state: string
  ip: string
  remotePublicAddress: string
  startedAt: string | null
  location: string
  bandwidthKbps: number
  transcodeDecision: string
  videoDecision: string
  audioDecision: string
  subtitleDecision: string
  device: string
  platform: string
  platformVersion: string
  version: string
  local: boolean
  relayed: boolean
  secure: boolean
  mediaBitrate: number
  mediaContainer: string
  mediaVideoCodec: string
  mediaAudioCodec: string
  mediaAudioChannels: number
  mediaVideoResolution: string
  mediaWidth: number
  mediaHeight: number
  mediaProtocol: string
  durationMs: number
  viewOffsetMs: number
  progressPercent: number
  thumbPath: string
  artPath: string
  librarySectionTitle: string
  grandparentTitle: string
  parentTitle: string
  partDecision: string
  isTranscoding: boolean
  transcodeSpeed: number
  transcodeProgress: number
  transcodeHardwareDecoding: string
  transcodeHardwareEncoding: string
  transcodeHardwareFullPipeline: boolean
  customer_name: string | null
  customer_email: string | null
  allowed_streams: number
  active_streams: number
  over_limit: boolean
  isDownload?: boolean
  download_count?: number
  over_download_limit?: boolean
  ip_blocked?: boolean
  warning_count?: number
  transcode_notice_sent?: boolean
  transcode_notice_sent_at?: string | null
  ip_geo_label?: string | null
  ip_geo_city?: string | null
  ip_geo_region?: string | null
  ip_geo_country?: string | null
  ip_geo_postal_code?: string | null
  ip_geo_latitude?: string | null
  ip_geo_longitude?: string | null
}

type ResourcePoint = {
  at: number
  hostCpuUtilization: number
  processCpuUtilization: number
  hostMemoryUtilization: number
  processMemoryUtilization: number
}

type BandwidthPoint = {
  at: number
  localMbps: number
  remoteMbps: number
  totalMbps: number
}

type SessionSummary = {
  activeSessions: number
  transcodingSessions: number
  overLimitSessions: number
  activeDownloads: number
  overDownloadSessions: number
  remoteSessions: number
  localSessions: number
  currentBandwidthMbps: number
  hostCpuUtilization: number
  processCpuUtilization: number
  hostMemoryUtilization: number
  processMemoryUtilization: number
  remoteBandwidthMbps: number
  localBandwidthMbps: number
}

type SessionViewFilter = 'all' | 'transcoding' | 'over_streamers' | 'downloads'
type NoticePickerState = {
  action: 'download' | 'transcode'
  session: SessionRow
} | null

type KillStreamState = {
  session: SessionRow
  reason: string
} | null

const LIVE_PLEX_REFRESH_MS = 2000

function formatMbps(value: number) {
  if (!value) return '0 Mbps'
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} Mbps`
}

function formatKbps(value: number) {
  if (!value) return '0 Mbps'
  return formatMbps(value / 1000)
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatDuration(ms: number) {
  if (!ms) return '0m'
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatClock(at: number) {
  if (!at) return ''
  return new Date(at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function isVideoTranscoding(session: SessionRow) {
  return String(session.videoDecision || '').toLowerCase().includes('transcode')
}

function buildSessionGeoSummary(session: SessionRow) {
  const place = [session.ip_geo_city, session.ip_geo_region, session.ip_geo_country].filter(Boolean).join(', ')
  const postal = String(session.ip_geo_postal_code || '').trim()
  if (place && postal) return `${place} ${postal}`
  if (place) return place
  return ''
}

function buildSessionGeoFallback(session: SessionRow) {
  if (buildSessionGeoSummary(session)) return ''
  if (session.location !== 'wan') return 'Local session on a private network'
  if (session.remotePublicAddress || session.ip) return 'Approx location unavailable for this IP'
  return 'No network location available'
}

function buildSessionIpLine(session: SessionRow) {
  const directIp = String(session.ip || '').trim()
  const publicIp = String(session.remotePublicAddress || '').trim()
  if (session.location === 'wan' && publicIp) return publicIp
  return directIp || publicIp || '-'
}

function formatAudioChannelLabel(channels: number) {
  if (!channels) return ''
  if (channels === 1) return 'Mono'
  if (channels === 2) return 'Stereo'
  if (channels === 6) return '5.1'
  if (channels === 8) return '7.1'
  return `${channels}ch`
}

function getDownloadsMismatchBadge(row: ShareRow, customer?: Customer) {
  const customerDownloads = customer?.downloads === true
  const plexDownloads = row.allow_sync === true
  if (plexDownloads && !customerDownloads) {
    return {
      label: 'Manual Plex DL',
      className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
      title: 'Downloads are enabled in Plex, but the CRM record is still off.',
    }
  }
  if (!plexDownloads && customerDownloads) {
    return {
      label: 'Plex refused DL',
      className: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
      title: 'CRM wanted downloads on, but Plex kept them disabled.',
    }
  }
  return null
}

function buildSessionMediaTags(session: SessionRow) {
  return [
    String(session.mediaContainer || '').trim().toUpperCase(),
    String(session.mediaVideoResolution || '').trim(),
    String(session.mediaVideoCodec || '').trim().toUpperCase(),
    [String(session.mediaAudioCodec || '').trim().toUpperCase(), formatAudioChannelLabel(Number(session.mediaAudioChannels || 0))]
      .filter(Boolean)
      .join(' '),
  ].filter(Boolean)
}

function hasCustomerEmail(session: SessionRow) {
  const email = String(session.customer_email || '').trim().toLowerCase()
  return Boolean(email && email.includes('@'))
}

function getCustomerDisplayName(customer: Customer) {
  return String(customer.full_name || customer.email || '').trim()
}

function buildPlexArtworkUrl(path?: string | null) {
  const clean = String(path || '').trim()
  if (!clean) return ''
  return `/api/admin/plex/art?path=${encodeURIComponent(clean)}`
}

function PlexMoneyBackdrop() {
  return (
    <div aria-hidden="true" className="plex-money-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <div className="plex-money-haze plex-money-haze--left" />
      <div className="plex-money-haze plex-money-haze--right" />
      <div className="plex-money-lattice" />
      <div className="plex-money-orbit plex-money-orbit--one" />
      <div className="plex-money-orbit plex-money-orbit--two" />
      <div className="plex-money-grid" />
      <div className="plex-money-sigil plex-money-sigil--one" />
      <div className="plex-money-sigil plex-money-sigil--two" />
      <div className="plex-money-triangle plex-money-triangle--one" />
      <div className="plex-money-triangle plex-money-triangle--two" />
      <div className="plex-money-constellation plex-money-constellation--one" />
      <div className="plex-money-constellation plex-money-constellation--two" />
      <div className="plex-money-glyph plex-money-glyph--pound">£</div>
      <div className="plex-money-glyph plex-money-glyph--euro">€</div>
      <div className="plex-money-glyph plex-money-glyph--yen">¥</div>
      <div className="plex-money-glyph plex-money-glyph--bitcoin">₿</div>
    </div>
  )
}

function StatChart({
  title,
  subtitle,
  points,
  series,
  formatter,
}: {
  title: string
  subtitle: string
  points: Array<Record<string, number>>
  series: Array<{ key: string; label: string; color: string }>
  formatter: (value: number) => string
}) {
  if (!points.length) {
    return (
      <div className="glass p-4 rounded-xl border border-slate-800">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        <div className="mt-4 text-xs text-slate-500">No live data yet.</div>
      </div>
    )
  }

  const values = points.flatMap((point) => series.map((item) => Number(point[item.key] || 0)))
  const max = Math.max(1, ...values)

  function polylineFor(key: string) {
    return points
      .map((point, index) => {
        const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100
        const value = Number(point[key] || 0)
        const y = 44 - (value / max) * 40
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className="glass p-4 rounded-xl border border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          <div>Latest</div>
          {series.map((item) => (
            <div key={item.key} style={{ color: item.color }}>
              {item.label}: {formatter(Number(points[points.length - 1]?.[item.key] || 0))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 h-40 rounded-xl border border-white/5 bg-slate-950/60 p-3">
        <svg viewBox="0 0 100 48" className="h-full w-full overflow-visible">
          {[0, 1, 2, 3].map((idx) => {
            const y = 4 + idx * 13
            return <line key={idx} x1="0" y1={y} x2="100" y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />
          })}
          {series.map((item) => (
            <polyline
              key={item.key}
              fill="none"
              stroke={item.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylineFor(item.key)}
            />
          ))}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
        {series.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div className="ml-auto">{formatClock(Number(points[points.length - 1]?.at || 0))}</div>
      </div>
    </div>
  )
}

function PlexToolsInner() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ShareRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [manage, setManage] = useState<ShareRow | null>(null)
  const [libs, setLibs] = useState<LibraryRow[]>([])
  const [libsLoading, setLibsLoading] = useState(false)
  const [libsError, setLibsError] = useState('')
  const [inviteLibraries, setInviteLibraries] = useState<LibraryRow[]>([])
  const [selectedLibs, setSelectedLibs] = useState<Record<number, boolean>>({})
  const [allowSync, setAllowSync] = useState<boolean>(false)
  const [filters, setFilters] = useState<{ filter_all: string; filter_movies: string; filter_television: string }>({
    filter_all: '',
    filter_movies: '',
    filter_television: ''
  })
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLibs, setInviteLibs] = useState<Record<number, boolean>>({})
  const [inviteAllowSync, setInviteAllowSync] = useState(false)
  const [removeEmail, setRemoveEmail] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [syncingShareKey, setSyncingShareKey] = useState('')
  const [downloadsPathNotice, setDownloadsPathNotice] = useState('')
  const [prefillEmail, setPrefillEmail] = useState('')
  const [autoOpened, setAutoOpened] = useState(false)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')
  const [resourcePoints, setResourcePoints] = useState<ResourcePoint[]>([])
  const [bandwidthPoints, setBandwidthPoints] = useState<BandwidthPoint[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [serverVersion, setServerVersion] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [liveRefresh, setLiveRefresh] = useState(true)
  const [blockingIp, setBlockingIp] = useState('')
  const [moderatingKey, setModeratingKey] = useState('')
  const [sessionViewFilter, setSessionViewFilter] = useState<SessionViewFilter>('all')
  const [noticePicker, setNoticePicker] = useState<NoticePickerState>(null)
  const [noticePickerQuery, setNoticePickerQuery] = useState('')
  const [killStreamState, setKillStreamState] = useState<KillStreamState>(null)
  const sessionsRequestInFlight = useRef(false)
  const manageDialogRef = useRef<HTMLDivElement | null>(null)
  const noticePickerDialogRef = useRef<HTMLDivElement | null>(null)
  const killStreamDialogRef = useRef<HTMLDivElement | null>(null)

  async function loadSessions() {
    if (sessionsRequestInFlight.current) return
    sessionsRequestInFlight.current = true
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const res = await fetch('/api/admin/plex/sessions', { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSessionsError(data?.error || 'Failed to load Plex sessions')
        setSessions([])
        setResourcePoints([])
        setBandwidthPoints([])
        setSessionSummary(null)
        return
      }
      setSessions(Array.isArray(data?.items) ? data.items : [])
      setResourcePoints(Array.isArray(data?.resources) ? data.resources : [])
      setBandwidthPoints(Array.isArray(data?.bandwidth) ? data.bandwidth : [])
      setSessionSummary(data?.summary || null)
      setServerVersion(String(data?.server?.version || ''))
      setLastUpdatedAt(String(data?.fetched_at || new Date().toISOString()))
    } catch (e: any) {
      setSessionsError(e?.message || 'Failed to load Plex sessions')
      setSessions([])
      setResourcePoints([])
      setBandwidthPoints([])
      setSessionSummary(null)
    } finally {
      sessionsRequestInFlight.current = false
      setSessionsLoading(false)
    }
  }

  async function blockIp(ip: string) {
    const cleanIp = String(ip || '').trim()
    if (!cleanIp) return
    if (!confirm(`Block IP ${cleanIp}?`)) return
    setBlockingIp(cleanIp)
    try {
      const res = await fetch('/api/admin/security/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: cleanIp })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to block IP')
        return
      }
      toast.success(`Blocked ${cleanIp}`)
      setSessions((current) => current.map((item) => (item.ip === cleanIp ? { ...item, ip_blocked: true } : item)))
    } catch (e: any) {
      toast.error(e?.message || 'Failed to block IP')
    } finally {
      setBlockingIp('')
    }
  }

  async function moderateSession(action: 'warn' | 'ban', session: SessionRow) {
    const targetKey = `${action}:${session.sessionKey}`
    const targetLabel = session.customer_name || session.customer_email || session.user || 'this customer'
    const shouldContinue = action === 'warn'
      ? confirm(`Send a warning to ${targetLabel}, log the strike, and stop their active streams?`)
      : confirm(`Ban ${targetLabel}, stop their active streams, and block their portal access?`)
    if (!shouldContinue) return

    const relatedSessions = sessions.filter((item) => {
      if (session.customer_email && item.customer_email) {
        return item.customer_email === session.customer_email
      }
      return item.user === session.user
    })

    setModeratingKey(targetKey)
    try {
      const res = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          customerEmail: session.customer_email,
          user: session.user,
          ip: session.ip,
          sessionKeys: relatedSessions.map((item) => item.sessionKey),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Failed to ${action} customer`)
        return
      }

      if (action === 'ban' && session.customer_email) {
        await fetch('/api/admin/plex-tools/shares/remove-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: session.customer_email }),
        }).catch(() => null)
      }

      if (action === 'warn') {
        toast.success(`Warning sent (${data?.warning_label || 'logged'})`)
      } else {
        toast.success('Customer banned and access removed')
      }

      await Promise.all([loadSessions(), load()])
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action} customer`)
    } finally {
      setModeratingKey('')
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/plex-tools/shares', { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to load Plex shares')
        return
      }
      setRows(Array.isArray(data?.items) ? data.items : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load Plex shares')
    } finally {
      setLoading(false)
    }
  }

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers', { cache: 'no-store' as any })
      if (!res.ok) return
      const data = await res.json().catch(() => [])
      setCustomers(Array.isArray(data) ? data : [])
    } catch {}
  }

  async function syncShareDownloadsFromPlex(row: ShareRow) {
    const key = `${row.server_machine_id}:${row.share_id || row.email}`
    setSyncingShareKey(key)
    try {
      const res = await fetch('/api/admin/plex-tools/shares/sync-downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_machine_id: row.server_machine_id,
          share_id: row.share_id,
          email: row.email,
          plex_user_id: row.plex_user_id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Sync from Plex failed')
        return
      }
      setRows((current) =>
        current.map((item) =>
          item.server_machine_id === row.server_machine_id && item.share_id === row.share_id
            ? { ...item, allow_sync: Boolean(data?.allow_sync) }
            : item
        )
      )
      setCustomers((current) =>
        current.map((item) =>
          String(item.email || '').toLowerCase() === String(data?.email || row.email || '').toLowerCase()
            ? { ...item, downloads: Boolean(data?.allow_sync) }
            : item
        )
      )
      toast.success(`Synced from Plex: downloads ${data?.allow_sync ? 'on' : 'off'}`)
    } catch (e: any) {
      toast.error(e?.message || 'Sync from Plex failed')
    } finally {
      setSyncingShareKey('')
    }
  }

  async function loadLibrariesForShare(r: ShareRow): Promise<number[]> {
    setLibs([])
    setSelectedLibs({})
    setLibsLoading(true)
    setLibsError('')
    try {
      const qs = new URLSearchParams()
      if (r.email) qs.set('email', r.email)
      if (r.username) qs.set('username', r.username)
      if (r.server_machine_id) qs.set('machineIdentifier', r.server_machine_id)
      const res = await fetch(`/api/admin/plex/libraries?${qs.toString()}`, { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLibsError(data?.error || 'Failed to load libraries')
        return []
      }
      const list: LibraryRow[] = Array.isArray(data?.libraries) ? data.libraries : []
      setLibs(list)
      const sharedIds: number[] = Array.isArray(data?.shared) ? data.shared.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n)) : []
      const next: Record<number, boolean> = {}
      list.forEach((l) => {
        if (l?.id === undefined) return
        const id = Number(l.id)
        next[id] = sharedIds.includes(id)
      })
      setSelectedLibs(next)
      return sharedIds
    } catch (e: any) {
      setLibsError(e?.message || 'Failed to load libraries')
    } finally {
      setLibsLoading(false)
    }
    return []
  }

  function openNoticePicker(action: 'download' | 'transcode', session: SessionRow) {
    const defaultQuery = String(session.customer_name || session.customer_email || session.user || '').trim()
    setNoticePicker({ action, session })
    setNoticePickerQuery(defaultQuery)
  }

  function openKillStream(session: SessionRow) {
    const defaultReason = isVideoTranscoding(session)
      ? 'Your stream was stopped because it was video transcoding. Please set Plex quality to Original or Maximum before trying again.'
      : session.over_limit
        ? 'Your stream was stopped because your account went over its allowed stream limit.'
        : session.over_download_limit
          ? 'Your stream was stopped because your account went over the allowed download or playback limit.'
          : 'Your stream was stopped by the host operator. Please contact support if needed.'
    setKillStreamState({ session, reason: defaultReason })
  }

  async function submitKillStream() {
    const current = killStreamState
    if (!current) return
    const reason = String(current.reason || '').trim()
    if (!reason) {
      toast.error('Enter a reason first')
      return
    }

    const busyKey = `kill:${current.session.sessionKey}`
    setModeratingKey(busyKey)
    try {
      const res = await fetch('/api/admin/plex/kill-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: current.session.sessionKey,
          reason,
          email: current.session.customer_email,
          user: current.session.user,
          title: current.session.primaryTitle || current.session.title,
          ip: current.session.ip,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to stop stream')
        return
      }

      toast.success(data?.emailed ? 'Stream killed and message sent' : 'Stream killed')
      setKillStreamState(null)
      await loadSessions()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to stop stream')
    } finally {
      setModeratingKey('')
    }
  }

  async function sendSessionNotice(action: 'download' | 'transcode', session: SessionRow, selectedCustomer?: Customer | null) {
    const email = String(selectedCustomer?.email || session.customer_email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      openNoticePicker(action, session)
      return
    }

    const customerLabel =
      getCustomerDisplayName(selectedCustomer || { email, full_name: session.customer_name || '' }) ||
      session.user ||
      email
    const actionLabel = action === 'download' ? 'download limit warning' : 'video transcode guidance'
    const sentAtLabel =
      action === 'transcode' && session.transcode_notice_sent_at
        ? new Date(session.transcode_notice_sent_at).toLocaleString()
        : ''
    const confirmMessage =
      action === 'transcode' && session.transcode_notice_sent && sentAtLabel
        ? `You already sent a transcode email to ${customerLabel} on ${sentAtLabel}.\n\nDo you want to send it again?`
        : `Send ${actionLabel} to ${customerLabel}?`
    const shouldContinue = confirm(confirmMessage)
    if (!shouldContinue) return

    const busyKey = `${action}:${session.sessionKey}`
    setModeratingKey(busyKey)
    try {
      const route = action === 'download' ? '/api/warnings/download' : '/api/warnings/transcode'
      const payload =
        action === 'download'
          ? { email, user: session.user, ip: session.ip, downloadCount: session.download_count || 0 }
          : { email, user: session.user, ip: session.ip }

      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || `Failed to send ${actionLabel}`)
        return
      }

      if (action === 'transcode') {
        const sentAt = new Date().toISOString()
        setSessions((current) =>
          current.map((item) => {
            const sameCustomer =
              (email && item.customer_email && item.customer_email === email) ||
              (!item.customer_email && item.user === session.user)
            if (!sameCustomer) return item
            return {
              ...item,
              customer_email: item.customer_email || email,
              customer_name: item.customer_name || selectedCustomer?.full_name || session.customer_name,
              transcode_notice_sent: true,
              transcode_notice_sent_at: item.transcode_notice_sent_at || sentAt,
            }
          })
        )
      }

      toast.success(action === 'download' ? 'Download warning sent' : 'Transcode guidance sent')
      setNoticePicker(null)
      await loadSessions()
    } catch (e: any) {
      toast.error(e?.message || `Failed to send ${actionLabel}`)
    } finally {
      setModeratingKey('')
    }
  }

  async function loadLibrariesForInvite() {
    try {
      const res = await fetch('/api/admin/plex/libraries', { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      const list: LibraryRow[] = Array.isArray(data?.libraries) ? data.libraries : []
      setInviteLibraries(list)
      const next: Record<number, boolean> = {}
      list.forEach((l) => {
        if (l?.id !== undefined) next[Number(l.id)] = true
      })
      setInviteLibs(next)
    } catch {}
  }

  useEffect(() => {
    const manageEmail = String(searchParams?.get('manageEmail') || '').trim()
    const email = String(searchParams?.get('email') || '').trim()
    const targetEmail = manageEmail || email
    if (targetEmail) {
      setQuery(targetEmail)
      setInviteEmail(targetEmail)
      setRemoveEmail(targetEmail)
      setPrefillEmail(targetEmail)
    }
    load()
    loadCustomers()
    loadLibrariesForInvite()
    loadSessions()
  }, [])

  useEffect(() => {
    if (!liveRefresh) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadSessions()
      }
    }, LIVE_PLEX_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [liveRefresh])

  const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

  const customersByEmail = useMemo(() => {
    const m = new Map<string, Customer>()
    customers.forEach((c) => {
      const e = String(c.email || '').toLowerCase()
      if (e) m.set(e, c)
    })
    return m
  }, [customers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        r.email.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.server_name.toLowerCase().includes(q)
      )
    })
  }, [rows, query])

  const filteredSessions = useMemo(() => {
    switch (sessionViewFilter) {
      case 'transcoding':
        return sessions.filter((session) => isVideoTranscoding(session))
      case 'over_streamers':
        return sessions.filter((session) => session.over_limit)
      case 'downloads':
        return sessions.filter((session) => session.over_download_limit)
      default:
        return sessions
    }
  }, [sessionViewFilter, sessions])

  const noticePickerCustomers = useMemo(() => {
    const queryText = String(noticePickerQuery || '').trim().toLowerCase()
    const session = noticePicker?.session
    const suggestedTerms = [
      String(session?.customer_email || '').trim().toLowerCase(),
      String(session?.customer_name || '').trim().toLowerCase(),
      String(session?.user || '').trim().toLowerCase(),
    ].filter(Boolean)

    return customers
      .map((customer) => {
        const email = String(customer.email || '').trim().toLowerCase()
        const name = getCustomerDisplayName(customer).toLowerCase()
        const haystack = `${name} ${email}`.trim()
        let score = 0

        if (queryText) {
          if (email === queryText || name === queryText) score += 120
          else if (haystack.includes(queryText)) score += 60
        }

        for (const term of suggestedTerms) {
          if (email === term || name === term) score += 90
          else if (term && (email.includes(term) || name.includes(term) || term.includes(name))) score += 35
        }

        return { customer, haystack, score }
      })
      .filter((item) => item.score > 0 || !queryText)
      .sort((a, b) => b.score - a.score || a.haystack.localeCompare(b.haystack))
      .slice(0, 18)
      .map((item) => item.customer)
  }, [customers, noticePicker, noticePickerQuery])

  const inviteSelectedIds = useMemo(() => Object.entries(inviteLibs).filter(([, v]) => v).map(([k]) => Number(k)), [inviteLibs])

  async function openManage(r: ShareRow) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setManage(r)
    setDownloadsPathNotice('')
    setAllowSync(r.allow_sync === true)
    setFilters({
      filter_all: r.filter_all || '',
      filter_movies: r.filter_movies || '',
      filter_television: r.filter_television || ''
    })
    setLibs([])
    setSelectedLibs({})
    await loadLibrariesForShare(r)
  }

  useEffect(() => {
    const email = String(prefillEmail || '').trim().toLowerCase()
    if (!email || autoOpened || manage) return
    const matches = rows.filter((r) => String(r.email || '').toLowerCase() === email)
    if (matches.length >= 1) {
      setAutoOpened(true)
      void openManage(matches[0])
    }
  }, [prefillEmail, rows, autoOpened, manage])

  useEffect(() => {
    if (!manage) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => manageDialogRef.current?.focus(), 40)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) setManage(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [manage, saving])

  useEffect(() => {
    if (!noticePicker) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => noticePickerDialogRef.current?.focus(), 40)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !moderatingKey) setNoticePicker(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [noticePicker, moderatingKey])

  useEffect(() => {
    if (!killStreamState) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => killStreamDialogRef.current?.focus(), 40)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !moderatingKey) setKillStreamState(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [killStreamState, moderatingKey])

  async function saveManage() {
    if (!manage) return
    setSaving(true)
    try {
      const downloadsChanged = manage.allow_sync !== allowSync
      const libraryIds = Object.entries(selectedLibs).filter(([, v]) => v).map(([k]) => Number(k))
      const payload = {
        server_machine_id: manage.server_machine_id,
        share_id: manage.share_id,
        plex_user_id: manage.plex_user_id,
        email: manage.email,
        library_section_ids: libraryIds,
        settings: { allow_sync: allowSync },
        filters,
      }

      let res = await fetch('/api/admin/plex-tools/shares/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, force_recreate: false })
      })
      let data = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(`${data?.error || 'Update failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }

      await load()
      const appliedLibraries = await loadLibrariesForShare({
        ...manage,
        allow_sync: allowSync,
        filter_all: filters.filter_all,
        filter_movies: filters.filter_movies,
        filter_television: filters.filter_television,
      })
      const normalizedExpected = [...libraryIds].sort((a, b) => a - b).join(',')
      const normalizedApplied = [...appliedLibraries].sort((a, b) => a - b).join(',')
      if (normalizedExpected !== normalizedApplied) {
        toast.error('Plex kept different libraries than requested. Open Manage Share again and recheck.')
        return
      }

      setManage((current) => current ? ({
        ...current,
        allow_sync: allowSync,
        filter_all: filters.filter_all,
        filter_movies: filters.filter_movies,
        filter_television: filters.filter_television,
      }) : current)
      setDownloadsPathNotice(downloadsChanged && data?.downloads_update_path === 'plex_web' ? 'Plex Web path confirmed' : '')
      toast.success(res.status === 200 ? 'Updated and verified' : 'Updated')
      if (data?.warning) {
        toast(String(data.warning))
      }
    } catch (e: any) {
      toast.error(e?.message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function forceRecreateShare() {
    if (!manage) return
    if (!confirm(`Force recreate this share for ${manage.email || manage.username}? This will remove and re-add access to apply downloads/library settings.`)) return
    setSaving(true)
    try {
      const libraryIds = Object.entries(selectedLibs).filter(([, v]) => v).map(([k]) => Number(k))
      const res = await fetch('/api/admin/plex-tools/shares/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_machine_id: manage.server_machine_id,
          share_id: manage.share_id,
          plex_user_id: manage.plex_user_id,
          email: manage.email,
          library_section_ids: libraryIds,
          settings: { allow_sync: allowSync },
          filters,
          force_recreate: true
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${data?.error || 'Recreate failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }
      toast.success('Recreated and verified')
      setManage(null)
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Recreate failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeShare() {
    if (!manage) return
    if (!confirm(`Remove ${manage.email || manage.username} from ${manage.server_name}?`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plex-tools/shares/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_machine_id: manage.server_machine_id, share_id: manage.share_id, email: manage.email })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Remove failed')
        return
      }
      toast.success('Removed')
      setManage(null)
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Remove failed')
    } finally {
      setSaving(false)
    }
  }

  async function invite() {
    const email = inviteEmail.trim()
    if (!email) return
    if (!emailValid(email)) { toast.error('Invalid email'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plex/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, libraries: inviteSelectedIds, allow_sync: inviteAllowSync })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${data?.error || 'Share failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }
      toast.success('Shared')
      if (data?.warning) {
        toast(String(data.warning))
      }
      setInviteEmail('')
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Share failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeByEmail() {
    const email = removeEmail.trim()
    if (!email) return
    if (!emailValid(email)) { toast.error('Invalid email'); return }
    if (!confirm(`Remove ${email} from the server and revoke all libraries?`)) return
    setActionBusy(true)
    try{
      const res = await fetch('/api/admin/plex-tools/shares/remove-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok) {
        toast.error(data?.error || 'Remove failed')
        return
      }
      const removedCount = Array.isArray(data?.removed) ? data.removed.length : 0
      if (removedCount === 0) toast.error('No active share found for that email')
      else toast.success(`Removed (${removedCount})`)
      setRemoveEmail('')
      await load()
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="plex-tools-scene max-w-6xl mx-auto px-4">
      <PlexMoneyBackdrop />
      <div className="glass relative border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Hosting Tools</h1>
            <p className="text-slate-300 text-sm">Manage shares, watch live playback in real time, and track CPU, memory, bandwidth, transcoding, over-streaming, and download activity from one screen.</p>
          </div>
          <div className="flex gap-2">
            <a className="btn-outline" href="https://app.plex.tv/desktop/#!/settings/manage-library-access" target="_blank" rel="noreferrer">
              Manage Access
            </a>
            <button className="btn-outline" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn-outline" onClick={loadSessions} disabled={sessionsLoading}>
              {sessionsLoading ? 'Refreshing Activity...' : 'Refresh Activity'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <label className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-cyan-100">
            <input type="checkbox" checked={liveRefresh} onChange={(e) => setLiveRefresh(e.target.checked)} />
            <span>Live auto-refresh every {LIVE_PLEX_REFRESH_MS / 1000}s</span>
          </label>
          {serverVersion ? <div>Server version: <span className="text-slate-200">{serverVersion}</span></div> : null}
          {lastUpdatedAt ? <div>Last updated: <span className="text-slate-200">{new Date(lastUpdatedAt).toLocaleTimeString()}</span></div> : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => setSessionViewFilter('all')}
            className={`glass rounded-xl border p-4 text-left transition-colors ${sessionViewFilter === 'all' ? 'border-cyan-400/40 bg-cyan-400/5' : 'border-slate-800'}`}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active Streams</div>
            <div className="mt-2 text-3xl font-semibold text-white">{sessionSummary?.activeSessions ?? sessions.length}</div>
            <div className="mt-2 text-xs text-slate-400">Remote {sessionSummary?.remoteSessions ?? 0} • Local {sessionSummary?.localSessions ?? 0}</div>
          </button>
          <button
            type="button"
            onClick={() => setSessionViewFilter('transcoding')}
            className={`glass rounded-xl border p-4 text-left transition-colors ${sessionViewFilter === 'transcoding' ? 'border-amber-400/40 bg-amber-400/5' : 'border-slate-800'}`}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Transcoding</div>
            <div className="mt-2 text-3xl font-semibold text-amber-200">{sessionSummary?.transcodingSessions ?? 0}</div>
          </button>
          <button
            type="button"
            onClick={() => setSessionViewFilter('over_streamers')}
            className={`glass rounded-xl border p-4 text-left transition-colors ${sessionViewFilter === 'over_streamers' ? 'border-rose-400/40 bg-rose-400/5' : 'border-slate-800'}`}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Over Streamers</div>
            <div className="mt-2 text-3xl font-semibold text-rose-200">{sessionSummary?.overLimitSessions ?? 0}</div>
          </button>
          <div className="glass rounded-xl border border-slate-800 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Current Bandwidth</div>
            <div className="mt-2 text-3xl font-semibold text-cyan-200">{formatMbps(sessionSummary?.currentBandwidthMbps ?? 0)}</div>
            <div className="mt-2 text-xs text-slate-400">Remote {formatMbps(sessionSummary?.remoteBandwidthMbps ?? 0)} • Local {formatMbps(sessionSummary?.localBandwidthMbps ?? 0)}</div>
          </div>
          <button
            type="button"
            onClick={() => setSessionViewFilter('downloads')}
            className={`glass rounded-xl border p-4 text-left transition-colors ${sessionViewFilter === 'downloads' ? 'border-violet-400/40 bg-violet-400/5' : 'border-slate-800'}`}
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Downloads</div>
            <div className="mt-2 text-3xl font-semibold text-violet-200">{sessionSummary?.overDownloadSessions ?? 0}</div>
            <div className="mt-2 text-xs text-slate-400">Active downloads {sessionSummary?.activeDownloads ?? 0}</div>
          </button>
          <div className="glass rounded-xl border border-slate-800 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Server Load</div>
            <div className="mt-2 text-3xl font-semibold text-violet-200">{formatPercent(sessionSummary?.hostCpuUtilization ?? 0)}</div>
            <div className="mt-2 text-xs text-slate-400">Service CPU {formatPercent(sessionSummary?.processCpuUtilization ?? 0)} • Service RAM {formatPercent(sessionSummary?.processMemoryUtilization ?? 0)}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <StatChart
            title="Bandwidth"
            subtitle="Remote and local throughput from live server bandwidth history."
            points={bandwidthPoints as Array<Record<string, number>>}
            series={[
              { key: 'remoteMbps', label: 'Remote', color: '#38bdf8' },
              { key: 'localMbps', label: 'Local', color: '#f59e0b' },
            ]}
            formatter={formatMbps}
          />
          <StatChart
            title="CPU"
            subtitle="Host CPU versus Plex process CPU."
            points={resourcePoints as Array<Record<string, number>>}
            series={[
              { key: 'hostCpuUtilization', label: 'Host CPU', color: '#a78bfa' },
              { key: 'processCpuUtilization', label: 'Service CPU', color: '#22d3ee' },
            ]}
            formatter={formatPercent}
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <StatChart
            title="Memory"
            subtitle="Host memory versus Plex process memory."
            points={resourcePoints as Array<Record<string, number>>}
            series={[
              { key: 'hostMemoryUtilization', label: 'Host RAM', color: '#34d399' },
              { key: 'processMemoryUtilization', label: 'Service RAM', color: '#60a5fa' },
            ]}
            formatter={formatPercent}
          />
          <div className="glass rounded-xl border border-slate-800 p-4">
            <div className="text-sm font-semibold text-slate-200">Real-Time Notes</div>
            <div className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
              <div>This view now pulls live Plex session, CPU, RAM, and bandwidth data directly from your server.</div>
              <div>Any session with a transcode badge is actively using Plex transcoding, and hardware labels show when VAAPI or other hardware acceleration is active.</div>
              <div>Download sessions are flagged separately. If one customer runs more than two downloads at once, the session is marked over the download limit.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">Live Session Cards</div>
              <div className="mt-1 text-xs text-slate-500">Real-time playback, device, bitrate, transcode, and stream-limit visibility.</div>
              {sessionViewFilter !== 'all' ? (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>
                    Filter:
                    {' '}
                    <span className="text-slate-200">
                      {sessionViewFilter === 'transcoding'
                        ? 'Video transcoders'
                        : sessionViewFilter === 'over_streamers'
                          ? 'Over streamers'
                          : 'Over downloads'}
                    </span>
                  </span>
                  <button className="btn-xs-outline px-2 py-1" onClick={() => setSessionViewFilter('all')}>
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            <div className="text-xs text-slate-400">
              Sessions: <span className="text-slate-100 font-semibold">{filteredSessions.length}</span>
            </div>
          </div>
          {sessionsError && <div className="mt-3 text-xs text-rose-400">{sessionsError}</div>}
          <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {!sessionsLoading && filteredSessions.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">No active sessions right now.</div>
            ) : null}
            {filteredSessions.map((s) => (
              <div key={`card:${s.sessionKey}`} className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/90 shadow-[0_24px_64px_rgba(2,6,23,0.52)]">
                {buildPlexArtworkUrl(s.artPath || s.thumbPath) ? (
                  <div className="absolute inset-0 opacity-40">
                    <img
                      src={buildPlexArtworkUrl(s.artPath || s.thumbPath)}
                      alt=""
                      className="h-full w-full object-cover blur-[2px] saturate-[1.15]"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.35),rgba(2,6,23,0.92)_42%,rgba(2,6,23,0.98))]" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />

                <div className="relative p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs uppercase tracking-[0.26em] text-cyan-200/75">{s.customer_name || s.customer_email || s.user || 'Unknown user'}</div>
                      <div className="mt-1.5 line-clamp-2 text-[1.12rem] font-semibold leading-tight text-white sm:text-[1.38rem]">{s.primaryTitle || s.title}</div>
                      {s.secondaryTitle ? <div className="mt-1 line-clamp-1 text-sm text-slate-300/90">{s.secondaryTitle}</div> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{s.state || 'unknown'}</div>
                      <div className="mt-1.5 text-base font-semibold text-cyan-200">{formatKbps(s.bandwidthKbps)}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[96px_minmax(0,1fr)]">
                    <div className="w-full max-w-[96px] shrink-0">
                      <div className="relative aspect-[2/3] overflow-hidden rounded-[18px] border border-white/10 bg-slate-900/80 shadow-[0_16px_32px_rgba(15,23,42,0.38)]">
                        {buildPlexArtworkUrl(s.thumbPath) ? (
                          <img
                            src={buildPlexArtworkUrl(s.thumbPath)}
                            alt={s.title || 'Poster'}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-end bg-[linear-gradient(160deg,rgba(34,211,238,0.2),rgba(15,23,42,0.9))] p-3">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-200/80">{s.librarySectionTitle || 'Library'}</div>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/85 to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1 text-[9px] uppercase tracking-[0.18em]">
                          <span className={`rounded-full px-2 py-1 backdrop-blur ${s.isTranscoding ? 'bg-amber-500/20 text-amber-100' : 'bg-emerald-500/20 text-emerald-100'}`}>
                            {s.isTranscoding ? 'Transcode' : 'Direct'}
                          </span>
                          {s.over_limit ? <span className="rounded-full bg-rose-500/20 px-2 py-1 text-rose-100 backdrop-blur">Over</span> : null}
                          {s.isDownload ? (
                            <span className={`rounded-full px-2 py-1 backdrop-blur ${s.over_download_limit ? 'bg-rose-500/20 text-rose-100' : 'bg-violet-500/20 text-violet-100'}`}>
                              DL {s.download_count || 0}/2
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em]">
                        <span className={`rounded-full px-2 py-1 ${s.location === 'wan' ? 'bg-cyan-500/15 text-cyan-200' : 'bg-slate-500/15 text-slate-200'}`}>
                          {s.location === 'wan' ? 'Remote' : 'Local'}
                        </span>
                        {s.over_download_limit ? <span className="rounded-full bg-rose-500/15 px-2 py-1 text-rose-200">Over DL</span> : null}
                        {s.transcode_notice_sent ? <span className="rounded-full bg-sky-500/15 px-2 py-1 text-sky-200">TC Sent</span> : null}
                        {s.transcodeHardwareDecoding || s.transcodeHardwareEncoding ? <span className="rounded-full bg-violet-500/15 px-2 py-1 text-violet-200">HW</span> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {buildSessionMediaTags(s).map((tag) => (
                          <span key={`${s.sessionKey}:${tag}`} className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {s.transcode_notice_sent_at ? (
                        <div className="mt-2 text-[11px] text-sky-300/85">
                          Transcode email already sent on {new Date(s.transcode_notice_sent_at).toLocaleString()}
                        </div>
                      ) : null}

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${s.isTranscoding ? 'bg-amber-400' : 'bg-cyan-400'}`}
                          style={{ width: `${Math.max(4, Math.min(100, s.progressPercent || s.transcodeProgress || 0))}%` }}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Device</div>
                          <div className="mt-1">{s.player || s.device || '-'}</div>
                          <div className="text-slate-500">{s.product || s.platform || '-'}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Quality</div>
                          <div className="mt-1">{s.mediaVideoResolution || `${s.mediaWidth}x${s.mediaHeight}` || '-'}</div>
                          <div className="text-slate-500">{s.mediaVideoCodec || '-'} / {s.mediaAudioCodec || '-'}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Route</div>
                          <div className="mt-1">{s.videoDecision || '-'}</div>
                          <div className="text-slate-500">Audio {s.audioDecision || '-'}{s.subtitleDecision ? ` • Subs ${s.subtitleDecision}` : ''}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Usage</div>
                          <div className="mt-1">{s.active_streams}/{s.allowed_streams} streams</div>
                          <div className="text-slate-500">
                            {s.download_count
                              ? `${s.download_count}/2 downloads${s.over_download_limit ? ' over limit' : ' active'}`
                              : (s.startedAt ? `Started ${new Date(s.startedAt).toLocaleTimeString()}` : formatDuration(s.durationMs))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-[18px] border border-white/8 bg-black/20 p-2.5 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate">{buildSessionIpLine(s)}</span>
                          <span className="truncate text-right text-slate-400">{s.librarySectionTitle || '-'}</span>
                        </div>
                        {buildSessionGeoSummary(s) ? <div className="mt-1.5 text-slate-400">{buildSessionGeoSummary(s)}</div> : null}
                        {s.ip_geo_latitude && s.ip_geo_longitude ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
                            <span>
                              {Number(s.ip_geo_latitude).toFixed(4)}, {Number(s.ip_geo_longitude).toFixed(4)}
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${encodeURIComponent(`${s.ip_geo_latitude},${s.ip_geo_longitude}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-300/90 hover:text-cyan-200"
                            >
                              Map
                            </a>
                          </div>
                        ) : null}
                        {s.isTranscoding ? (
                          <div className="mt-2 text-slate-400">
                            Speed {s.transcodeSpeed ? `${s.transcodeSpeed.toFixed(1)}x` : '0x'}
                            {s.transcodeHardwareDecoding || s.transcodeHardwareEncoding
                              ? ` • ${s.transcodeHardwareDecoding || 'HW'}${s.transcodeHardwareEncoding ? ` -> ${s.transcodeHardwareEncoding}` : ''}`
                              : ''}
                          </div>
                        ) : (
                          <div className="mt-2 text-slate-400">Bitrate {s.mediaBitrate ? `${s.mediaBitrate} kbps` : '-'} • {s.mediaContainer || '-'}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                  {s.over_limit ? (
                    <button
                      className="btn-xs-outline border-amber-500/30 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
                      onClick={() => moderateSession('warn', s)}
                      disabled={moderatingKey === `warn:${s.sessionKey}`}
                    >
                      {moderatingKey === `warn:${s.sessionKey}` ? '...' : `Warn ${Math.min(Number(s.warning_count || 0) + 1, 3)}/3`}
                    </button>
                  ) : null}
                  {s.over_download_limit ? (
                    <button
                      className="btn-xs-outline border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-500/10"
                      onClick={() => sendSessionNotice('download', s)}
                      disabled={moderatingKey === `download:${s.sessionKey}`}
                    >
                      {moderatingKey === `download:${s.sessionKey}` ? '...' : 'Warn DL'}
                    </button>
                  ) : null}
                  {isVideoTranscoding(s) ? (
                    <button
                      className="btn-xs-outline border-sky-500/30 px-2 py-1 text-sky-200 hover:bg-sky-500/10"
                      onClick={() => sendSessionNotice('transcode', s)}
                      disabled={moderatingKey === `transcode:${s.sessionKey}`}
                    >
                      {s.transcode_notice_sent ? 'TC Sent' : moderatingKey === `transcode:${s.sessionKey}` ? '...' : 'Transcode'}
                    </button>
                  ) : null}
                  <button
                    className="btn-xs-outline border-orange-500/30 px-2 py-1 text-orange-200 hover:bg-orange-500/10"
                    onClick={() => openKillStream(s)}
                    disabled={moderatingKey === `kill:${s.sessionKey}`}
                  >
                    {moderatingKey === `kill:${s.sessionKey}` ? '...' : 'Kill stream'}
                  </button>
                  <button
                    className="btn-xs-outline border-rose-500/30 px-2 py-1 text-rose-200 hover:bg-rose-500/10"
                    onClick={() => moderateSession('ban', s)}
                    disabled={moderatingKey === `ban:${s.sessionKey}`}
                  >
                    {moderatingKey === `ban:${s.sessionKey}` ? '...' : 'Ban'}
                  </button>
                  <button
                    className="btn-xs-outline px-2 py-1"
                    onClick={() => blockIp(s.ip)}
                    disabled={!s.ip || Boolean(s.ip_blocked) || blockingIp === s.ip}
                  >
                    {s.ip_blocked ? 'IP Set' : blockingIp === s.ip ? '...' : 'Block IP'}
                  </button>
                </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-200">Live Activity Table</div>
              <div className="mt-1 text-xs text-slate-500">Compact operator view for warnings, bans, IP blocks, stream-limit checks, and over-downloading.</div>
            </div>
            <div className="text-xs text-slate-400">
              Live: <span className="text-slate-100 font-semibold">{filteredSessions.length}</span>
            </div>
          </div>
          {sessionsError && <div className="mt-3 text-xs text-rose-400">{sessionsError}</div>}
          <div className="mt-3 border border-slate-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-slate-400 bg-slate-900/50 border-b border-slate-800">
              <div className="col-span-2">Customer</div>
              <div className="col-span-3">Watching</div>
              <div className="col-span-2">Device</div>
              <div className="col-span-1">State</div>
              <div className="col-span-1">Use</div>
              <div className="col-span-1">IP</div>
              <div className="col-span-2">Action</div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {sessionsLoading && <div className="p-4 text-xs text-slate-500">Loading live activity...</div>}
              {!sessionsLoading && filteredSessions.length === 0 && <div className="p-4 text-xs text-slate-500">No active sessions.</div>}
              {filteredSessions.map((s) => (
                <div key={s.sessionKey} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-900/60">
                  <div className="col-span-2 truncate text-slate-200" title={s.customer_email || s.user}>
                    <div className="truncate">{s.customer_name || s.customer_email || s.user || '-'}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      Warn {Math.min(Number(s.warning_count || 0), 3)}/3
                    </div>
                    {s.transcode_notice_sent_at ? (
                      <div className="text-[10px] uppercase tracking-[0.18em] text-sky-300/80">
                        TC sent {new Date(s.transcode_notice_sent_at).toLocaleDateString()}
                      </div>
                    ) : null}
                  </div>
                  <div className="col-span-3 truncate text-slate-200" title={s.title}>
                    {s.title}
                  </div>
                  <div className="col-span-2 truncate text-slate-300" title={`${s.player} ${s.product}`.trim()}>
                    {s.player || s.product || '-'}
                  </div>
                  <div className={`col-span-1 capitalize ${s.isDownload ? 'text-violet-200' : isVideoTranscoding(s) ? 'text-amber-200' : 'text-slate-300'}`}>
                    {s.isDownload ? 'download' : isVideoTranscoding(s) ? 'v trans' : (s.state || '-')}
                  </div>
                  <div className={`col-span-1 ${(s.over_limit || s.over_download_limit) ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {s.download_count ? `${s.download_count}/2 DL` : `${s.active_streams}/${s.allowed_streams}`}
                  </div>
                  <div className="col-span-1 truncate text-slate-300" title={`${buildSessionIpLine(s)}${s.ip_blocked ? ' (blocked)' : ''}`}>
                    <div className="truncate">{buildSessionIpLine(s)}</div>
                    <div
                      className={`truncate text-[10px] uppercase tracking-[0.14em] ${buildSessionGeoSummary(s) ? 'text-slate-500' : 'text-slate-600'}`}
                      title={buildSessionGeoSummary(s) || buildSessionGeoFallback(s)}
                    >
                      {buildSessionGeoSummary(s) || buildSessionGeoFallback(s)}
                    </div>
                    {s.ip_blocked ? <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-rose-300">blocked</span> : null}
                  </div>
                  <div className="col-span-2 flex flex-wrap justify-end gap-1">
                    {s.over_limit ? (
                      <button
                        className="btn-xs-outline border-amber-500/30 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
                        onClick={() => moderateSession('warn', s)}
                        disabled={moderatingKey === `warn:${s.sessionKey}`}
                        title="Over-stream warning"
                      >
                        {moderatingKey === `warn:${s.sessionKey}` ? '...' : `Warn ${Math.min(Number(s.warning_count || 0) + 1, 3)}/3`}
                      </button>
                    ) : null}
                    {s.over_download_limit ? (
                      <button
                        className="btn-xs-outline border-violet-500/30 px-2 py-1 text-violet-200 hover:bg-violet-500/10"
                        onClick={() => sendSessionNotice('download', s)}
                        disabled={moderatingKey === `download:${s.sessionKey}`}
                        title={hasCustomerEmail(s) ? 'Over-download warning' : 'Pick the customer for this session first'}
                      >
                        {!hasCustomerEmail(s) ? 'Pick user' : moderatingKey === `download:${s.sessionKey}` ? '...' : 'Warn DL'}
                      </button>
                    ) : null}
                    {isVideoTranscoding(s) ? (
                      <button
                        className="btn-xs-outline border-sky-500/30 px-2 py-1 text-sky-200 hover:bg-sky-500/10"
                        onClick={() => sendSessionNotice('transcode', s)}
                        disabled={moderatingKey === `transcode:${s.sessionKey}`}
                        title={
                          !hasCustomerEmail(s)
                            ? 'Pick the customer for this session first'
                            : s.transcode_notice_sent_at
                              ? `Last sent ${new Date(s.transcode_notice_sent_at).toLocaleString()}`
                              : 'Send video quality guidance'
                        }
                      >
                        {!hasCustomerEmail(s)
                          ? 'Pick user'
                          : s.transcode_notice_sent
                            ? 'TC Sent'
                            : moderatingKey === `transcode:${s.sessionKey}`
                              ? '...'
                          : 'Transcode'}
                      </button>
                    ) : null}
                    <button
                      className="btn-xs-outline border-orange-500/30 px-2 py-1 text-orange-200 hover:bg-orange-500/10"
                      onClick={() => openKillStream(s)}
                      disabled={moderatingKey === `kill:${s.sessionKey}`}
                      title="Stop this live stream and send the reason"
                    >
                      {moderatingKey === `kill:${s.sessionKey}` ? '...' : 'Kill'}
                    </button>
                    <button
                      className="btn-xs-outline border-rose-500/30 px-2 py-1 text-rose-200 hover:bg-rose-500/10"
                      onClick={() => moderateSession('ban', s)}
                      disabled={moderatingKey === `ban:${s.sessionKey}`}
                    >
                      {moderatingKey === `ban:${s.sessionKey}` ? '...' : 'Ban'}
                    </button>
                    <button
                      className="btn-xs-outline px-2 py-1"
                      onClick={() => blockIp(s.ip)}
                      disabled={!s.ip || Boolean(s.ip_blocked) || blockingIp === s.ip}
                    >
                      {s.ip_blocked ? 'IP Set' : blockingIp === s.ip ? '...' : 'IP'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Add / Share User</div>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Email to share (invite)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="btn" onClick={invite} disabled={saving || !inviteEmail.trim()}>
              Share
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 items-center text-xs text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={inviteAllowSync} onChange={(e) => setInviteAllowSync(e.target.checked)} />
              Allow Downloads
            </label>
            <span className="text-slate-500">Libraries (defaults to all):</span>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {inviteLibraries.length === 0 && <div className="text-xs text-slate-500">Loading libraries...</div>}
            {Object.entries(inviteLibs).map(([idStr, v]) => {
              const id = Number(idStr)
              const l = (inviteLibraries || []).find((x) => Number((x as any).id) === id)
              const title = l?.title || `Library ${id}`
              return (
                <label key={idStr} className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={v} onChange={() => setInviteLibs((p) => ({ ...p, [id]: !p[id] }))} />
                  <span className="truncate" title={title}>{title}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Remove User (by email)</div>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Email to remove"
              value={removeEmail}
              onChange={(e) => setRemoveEmail(e.target.value)}
            />
            <button className="btn-outline" onClick={removeByEmail} disabled={actionBusy || !removeEmail.trim()}>
              {actionBusy ? 'Removing...' : 'Remove User'}
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500">Downloads must be disabled in Plex Web &quot;Manage Library Access&quot;.</div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Search email / username / server..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="glass px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 whitespace-nowrap">
            Total: <span className="text-slate-100 font-semibold">{rows.length}</span>
          </div>
        </div>

        {error && <div className="mt-4 text-rose-400 text-sm">{error}</div>}

        <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-slate-400 bg-slate-900/50 border-b border-slate-800">
            <div className="col-span-2">Server</div>
            <div className="col-span-3">Customer</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Libraries</div>
            <div className="col-span-1">DL</div>
            <div className="col-span-1"></div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {filtered.map((r, idx) => (
              <div key={`${r.server_machine_id}:${r.share_id || r.email}:${idx}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-900/60">
                {(() => {
                  const customer = customersByEmail.get(r.email.toLowerCase())
                  const downloadsBadge = getDownloadsMismatchBadge(r, customer)
                  const syncKey = `${r.server_machine_id}:${r.share_id || r.email}`
                  return (
                    <>
                <div className="col-span-2 truncate text-slate-200" title={r.server_name}>
                  {r.server_name}
                </div>
                <div className="col-span-3 truncate text-slate-200" title={(r.customer_name || customer?.full_name) || ''}>
                  {r.customer_name || customer?.full_name || '-'}
                </div>
                <div className="col-span-3 truncate text-slate-200" title={r.email}>
                  {r.email || '-'}
                  {r.username && <span className="ml-2 text-[10px] text-slate-500">{r.username}</span>}
                  {downloadsBadge ? (
                    <>
                      <span
                        className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${downloadsBadge.className}`}
                        title={downloadsBadge.title}
                      >
                        {downloadsBadge.label}
                      </span>
                      <button
                        type="button"
                        className="ml-2 inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/8 px-2 py-0.5 text-[10px] font-medium text-cyan-200 transition hover:bg-cyan-400/14 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => syncShareDownloadsFromPlex(r)}
                        disabled={syncingShareKey === syncKey}
                        title="Pull the live downloads state from Plex into the CRM"
                      >
                        {syncingShareKey === syncKey ? 'Syncing...' : 'Sync from Plex'}
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="col-span-2 text-slate-300">
                  {r.all_libraries === true ? (
                    <span className="text-emerald-300">All</span>
                  ) : r.all_libraries === false ? (
                    <span className="text-amber-300">Filtered</span>
                  ) : (
                    <span className="text-slate-500">Unknown</span>
                  )}
                </div>
                <div className="col-span-1 text-slate-300">
                  {r.allow_sync === true ? <span className="text-emerald-300">Yes</span> : r.allow_sync === false ? <span className="text-slate-500">No</span> : <span className="text-slate-500">-</span>}
                </div>
                <div className="col-span-1 flex justify-end gap-2">
                  <button
                    className="btn-xs-outline"
                    onClick={() => syncShareDownloadsFromPlex(r)}
                    disabled={syncingShareKey === syncKey}
                    title="Pull the live downloads state from Plex into the CRM"
                  >
                    {syncingShareKey === syncKey ? 'Syncing...' : 'Sync'}
                  </button>
                  <button className="btn-xs-outline" onClick={() => openManage(r)} disabled={!r.share_id}>
                    Manage
                  </button>
                </div>
                    </>
                  )
                })()}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-slate-500">
                {rows.length === 0 ? 'No active shares found.' : 'No matches.'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          &quot;Filtered&quot; means the user does not have access to all libraries and is on a limited share setup.
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Host Access Panel</div>
          <div className="mt-2 text-xs text-slate-500">
            Some share settings, especially downloads, are best confirmed from the host access panel.
          </div>
          <div className="mt-3">
            <a className="btn-outline" href="https://app.plex.tv/desktop/#!/settings/manage-library-access" target="_blank" rel="noreferrer">
              Open Manage Library Access
            </a>
          </div>
        </div>
      </div>
      {manage && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md" onClick={() => !saving && setManage(null)}>
              <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
                <div
                  ref={manageDialogRef}
                  role="dialog"
                  aria-modal="true"
                  tabIndex={-1}
                  className="glass relative flex w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] shadow-[0_40px_120px_rgba(2,6,23,0.72)] outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_70%)]" />
                  <div className="relative flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/70">Manage Access</div>
                      <div className="mt-2 text-2xl font-semibold text-white">Share Controls</div>
                      <div className="mt-2 truncate text-sm text-slate-400">
                        {manage.server_name} • {manage.email} {manage.username ? `(${manage.username})` : ''}
                      </div>
                    </div>
                    <button className="btn-xs-outline shrink-0" onClick={() => setManage(null)} disabled={saving}>Close</button>
                  </div>

                  <div className="relative grid gap-4 overflow-y-auto px-5 py-5 sm:px-6 lg:grid-cols-[1.12fr_0.88fr]">
                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-200">Library Access</div>
                            <div className="mt-1 text-xs text-slate-500">Pick exactly what this customer can see.</div>
                          </div>
                          {libs.length > 0 ? (
                            <button
                              className="text-xs text-cyan-300 transition-colors hover:text-cyan-200"
                              onClick={() => {
                                const allSelected = libs.every((l) => Boolean(selectedLibs[l.id]))
                                setSelectedLibs((prev) => {
                                  const next = { ...prev }
                                  libs.forEach((l) => { next[l.id] = !allSelected })
                                  return next
                                })
                              }}
                            >
                              {libs.every((l) => Boolean(selectedLibs[l.id])) ? 'Deselect all' : 'Select all'}
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-4 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                          {libsLoading && <div className="text-xs text-slate-500">Loading libraries...</div>}
                          {!libsLoading && libsError && <div className="text-xs text-rose-400">{libsError}</div>}
                          {!libsLoading && !libsError && libs.length === 0 && <div className="text-xs text-slate-500">No libraries found.</div>}
                          {libs.map((l) => (
                            <label key={l.id} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-black/10 px-3 py-3 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedLibs[l.id])}
                                onChange={() => setSelectedLibs((p) => ({ ...p, [l.id]: !p[l.id] }))}
                              />
                              <span className="min-w-0 flex-1 truncate" title={l.title}>{l.title}</span>
                              <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{l.type}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                        <div className="text-sm font-semibold text-slate-200">Access Options</div>
                        <div className="mt-1 text-xs text-slate-500">Downloads sync and access removal.</div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <label className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/8 px-3 py-2 text-xs text-cyan-100">
                            <input type="checkbox" checked={allowSync} onChange={(e) => setAllowSync(e.target.checked)} />
                            <span>Allow Downloads</span>
                          </label>
                          <button
                            className="btn-xs-outline border-cyan-400/25 text-cyan-200 hover:bg-cyan-400/10"
                            onClick={() => syncShareDownloadsFromPlex(manage)}
                            disabled={saving || syncingShareKey === `${manage.server_machine_id}:${manage.share_id || manage.email}`}
                            title="Pull the live downloads state from Plex into the CRM"
                          >
                            {syncingShareKey === `${manage.server_machine_id}:${manage.share_id || manage.email}` ? 'Syncing...' : 'Sync from Plex'}
                          </button>
                          <button className="btn-xs-outline border-rose-500/30 text-rose-300 hover:bg-rose-500/10" onClick={removeShare} disabled={saving}>
                            Remove User
                          </button>
                        </div>
                        {downloadsPathNotice ? (
                          <div className="mt-3 inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-200">
                            {downloadsPathNotice}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-slate-950/70 px-5 py-4 sm:px-6">
                    <button className="btn-xs-outline" onClick={() => setManage(null)} disabled={saving}>Cancel</button>
                    <button className="btn-xs-outline border-rose-500/30 text-rose-300 hover:bg-rose-500/10" onClick={forceRecreateShare} disabled={saving}>Force Recreate</button>
                    <button className="btn-xs" onClick={saveManage} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {noticePicker && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-md" onClick={() => !moderatingKey && setNoticePicker(null)}>
              <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
                <div
                  ref={noticePickerDialogRef}
                  role="dialog"
                  aria-modal="true"
                  tabIndex={-1}
                  className="glass relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-sky-400/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] shadow-[0_40px_120px_rgba(2,6,23,0.72)] outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_70%)]" />
                  <div className="relative flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-sky-200/70">Resolve Session</div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {noticePicker.action === 'download' ? 'Send Download Warning' : 'Send Transcode Guidance'}
                      </div>
                      <div className="mt-2 text-sm text-slate-400">
                        Pick the customer for <span className="text-slate-200">{noticePicker.session.user || 'this Plex session'}</span>
                      </div>
                      <div className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                        {noticePicker.session.primaryTitle || noticePicker.session.title || 'Active session'}
                      </div>
                    </div>
                    <button className="btn-xs-outline shrink-0" onClick={() => setNoticePicker(null)} disabled={Boolean(moderatingKey)}>Close</button>
                  </div>

                  <div className="relative px-5 py-5 sm:px-6">
                    <input
                      className="input"
                      placeholder="Search customer by name or email..."
                      value={noticePickerQuery}
                      onChange={(event) => setNoticePickerQuery(event.target.value)}
                    />

                    <div className="mt-3 rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                        <span>Choose the right account before sending the warning.</span>
                        <span>{noticePickerCustomers.length} match{noticePickerCustomers.length === 1 ? '' : 'es'}</span>
                      </div>

                      <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                        {noticePickerCustomers.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
                            No customer matched that search. Try email, full name, or the Plex username from the session card.
                          </div>
                        ) : (
                          noticePickerCustomers.map((customer) => {
                            const email = String(customer.email || '').trim().toLowerCase()
                            const isBusy = moderatingKey === `${noticePicker.action}:${noticePicker.session.sessionKey}`
                            return (
                              <button
                                key={email}
                                type="button"
                                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/10 px-4 py-3 text-left transition-colors hover:border-sky-400/30 hover:bg-sky-400/5"
                                onClick={() => sendSessionNotice(noticePicker.action, noticePicker.session, customer)}
                                disabled={isBusy}
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-100">{getCustomerDisplayName(customer) || email}</div>
                                  <div className="mt-1 truncate text-xs text-slate-400">{email}</div>
                                </div>
                                <div className="shrink-0 text-right text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                  <div>{String(customer.status || customer.plan || 'Customer')}</div>
                                  <div className="mt-1 text-sky-300">{isBusy ? 'Sending...' : 'Use account'}</div>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {killStreamState && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[115] bg-slate-950/85 backdrop-blur-md" onClick={() => !moderatingKey && setKillStreamState(null)}>
              <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
                <div
                  ref={killStreamDialogRef}
                  role="dialog"
                  aria-modal="true"
                  tabIndex={-1}
                  className="glass relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-orange-400/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] shadow-[0_40px_120px_rgba(2,6,23,0.72)] outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.12),transparent_70%)]" />
                  <div className="relative flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-orange-200/70">Kill Stream</div>
                      <div className="mt-2 text-2xl font-semibold text-white">Stop playback and send the reason</div>
                      <div className="mt-2 text-sm text-slate-400">
                        This will stop <span className="text-slate-200">{killStreamState.session.customer_name || killStreamState.session.customer_email || killStreamState.session.user || 'this user'}</span>
                        {' '}watching <span className="text-slate-200">{killStreamState.session.primaryTitle || killStreamState.session.title || 'their stream'}</span>.
                      </div>
                    </div>
                    <button className="btn-xs-outline shrink-0" onClick={() => setKillStreamState(null)} disabled={Boolean(moderatingKey)}>Close</button>
                  </div>

                  <div className="relative px-5 py-5 sm:px-6">
                    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Reason sent to customer</div>
                      <textarea
                        className="mt-3 min-h-[160px] w-full rounded-[20px] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-orange-400/40"
                        value={killStreamState.reason}
                        onChange={(event) => setKillStreamState((current) => (current ? { ...current, reason: event.target.value } : current))}
                        placeholder="Type the reason the stream was killed..."
                      />
                      <div className="mt-2 text-xs text-slate-500">
                        If this session is matched to a customer email, they will receive this same reason by email.
                      </div>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-slate-950/70 px-5 py-4 sm:px-6">
                    <button className="btn-xs-outline" onClick={() => setKillStreamState(null)} disabled={Boolean(moderatingKey)}>Cancel</button>
                    <button
                      className="btn-xs border-orange-500/30 bg-orange-500/90 text-white hover:bg-orange-400"
                      onClick={submitKillStream}
                      disabled={moderatingKey === `kill:${killStreamState.session.sessionKey}`}
                    >
                      {moderatingKey === `kill:${killStreamState.session.sessionKey}` ? 'Stopping...' : 'Kill stream'}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export default function PlexToolsPage() {
  return (
    <Suspense
      fallback={
        <div className="plex-tools-scene max-w-6xl mx-auto px-4">
          <PlexMoneyBackdrop />
          <div className="glass relative border border-slate-700/50 rounded-2xl p-6">
            <div className="text-slate-300 text-sm">Loading...</div>
          </div>
        </div>
      }
    >
      <PlexToolsInner />
    </Suspense>
  )
}
