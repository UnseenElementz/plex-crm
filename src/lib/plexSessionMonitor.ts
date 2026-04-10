import { createClient } from '@supabase/supabase-js'
import { fetchPlexDashboard } from '@/lib/plexDashboard'
import { countWarnings, getSecurityOverview, parsePlexUsername } from '@/lib/moderation'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { getAllPlexUsers } from '@/lib/plex'
import { lookupIpGeo } from '@/lib/ipGeo'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function envString(key: string) {
  return String(process.env[key] || '').trim()
}

function isVideoTranscodingSession(item: { videoDecision?: string | null }) {
  return String(item.videoDecision || '').toLowerCase().includes('transcode')
}

function resolveGeoLookupIp(item: { ip?: string | null; remotePublicAddress?: string | null; location?: string | null }) {
  const directIp = String(item.ip || '').trim()
  const remoteIp = String(item.remotePublicAddress || '').trim()
  if (String(item.location || '').trim().toLowerCase() === 'wan' && remoteIp) return remoteIp
  return directIp || remoteIp
}

export async function scanPlexSessions() {
  const s = svc()
  if (!s) throw new Error('Supabase not configured')

  const { data: settings, error: settingsError } = await s
    .from('admin_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (settingsError) {
    console.error('Plex settings load error:', settingsError)
  }

  const token = String(settings?.plex_token || envString('PLEX_TOKEN') || '').trim()
  const url = String(settings?.plex_server_url || envString('PLEX_SERVER_URL') || 'https://plex.tv').trim() || 'https://plex.tv'
  if (!token) throw new Error('Plex token not configured')

  const [dashboard, customers] = await Promise.all([
    fetchPlexDashboard(url, token),
    s.from('customers').select('email,name,streams,notes,subscription_status'),
  ])

  const sessions = dashboard.sessions
  const customerMap = new Map<string, { email: string; name: string; streams: number; transcodeNoticeSentAt: string | null }>()
  const plexUserMap = new Map<string, { id: string; email: string; username: string; title: string }>()

  try {
    const plexUsers = await getAllPlexUsers(token)
    for (const row of plexUsers) {
      const id = String(row.id || '').trim()
      const email = String(row.email || '').trim().toLowerCase()
      const username = String(row.username || '').trim().toLowerCase()
      const title = String(row.title || '').trim().toLowerCase()
      const entry = { id, email, username, title }
      if (id) plexUserMap.set(id, entry)
      if (email) plexUserMap.set(email, entry)
      if (username) plexUserMap.set(username, entry)
      if (title) plexUserMap.set(title, entry)
    }
  } catch {}

  for (const row of customers.data || []) {
    const email = String((row as any).email || '').trim().toLowerCase()
    if (!email) continue
    const parsedNotes = parseCustomerNotes((row as any).notes || '')
    const entry = {
      email,
      name: String((row as any).name || '').trim(),
      streams: Number((row as any).streams || 1) || 1,
      transcodeNoticeSentAt: parsedNotes.transcodeNoticeSentAt || null,
    }
    customerMap.set(email, entry)
    const plexUsername = parsedNotes.plexUsername.toLowerCase() || parsePlexUsername((row as any).notes).toLowerCase()
    if (plexUsername) customerMap.set(plexUsername, entry)

    const livePlexUser = plexUserMap.get(email)
    if (livePlexUser) {
      if (livePlexUser.id) customerMap.set(livePlexUser.id.toLowerCase(), entry)
      if (livePlexUser.username) customerMap.set(livePlexUser.username, entry)
      if (livePlexUser.title) customerMap.set(livePlexUser.title, entry)
    }
  }

  const grouped = new Map<string, number>()
  const downloadGrouped = new Map<string, number>()
  for (const session of sessions) {
    const key = String(session.user || '').trim().toLowerCase()
    grouped.set(key, (grouped.get(key) || 0) + 1)
    if (session.isDownload) {
      downloadGrouped.set(key, (downloadGrouped.get(key) || 0) + 1)
    }
  }

  const securityOverview = await getSecurityOverview()
  const blockedIps: string[] = Array.isArray(securityOverview.blockedIps)
    ? securityOverview.blockedIps.map((value) => String(value))
    : []

  const items = sessions.map((session) => {
    const key = String(session.user || '').trim().toLowerCase()
    const userId = String(session.userId || '').trim()
    const plexUser = plexUserMap.get(key) || (userId ? plexUserMap.get(userId) : undefined)
    const customer =
      customerMap.get(key) ||
      (userId ? customerMap.get(userId.toLowerCase()) : undefined) ||
      (plexUser?.email ? customerMap.get(plexUser.email) : undefined)
    const activeStreams = grouped.get(key) || 1
    const activeDownloads = downloadGrouped.get(key) || 0
    const allowedStreams = customer?.streams || 1
    const resolvedEmail =
      customer?.email ||
      (plexUser?.email && plexUser.email.includes('@') ? plexUser.email : '') ||
      (key.includes('@') ? key : '')
    const resolvedName =
      customer?.name ||
      String(plexUser?.title || plexUser?.username || '').trim() ||
      null

    return {
      ...session,
      customer_name: resolvedName,
      customer_email: resolvedEmail || null,
      allowed_streams: allowedStreams,
      active_streams: activeStreams,
      over_limit: activeStreams > allowedStreams,
      download_count: activeDownloads,
      over_download_limit: session.isDownload ? activeDownloads > 2 : false,
      ip_blocked: Boolean(session.ip && blockedIps.includes(session.ip)),
    }
  })

  const geoMap = new Map<string, Awaited<ReturnType<typeof lookupIpGeo>>>()
  const publicIps = Array.from(
    new Set(
      items
        .map((item) => resolveGeoLookupIp(item))
        .filter((value) => value && value !== 'unknown')
    )
  ).slice(0, 24)

  await Promise.all(
    publicIps.map(async (ip) => {
      geoMap.set(ip, await lookupIpGeo(ip))
    })
  )

  const ipLogs =
    settings?.ip_logs && typeof settings.ip_logs === 'object'
      ? { ...(settings.ip_logs as Record<string, string[]>) }
      : {}

  for (const item of items) {
    const email = String(item.customer_email || '').trim().toLowerCase()
    const ip = String(item.ip || '').trim()
    if (!email || !ip || !email.includes('@')) continue
    const existing = Array.isArray(ipLogs[email]) ? ipLogs[email].map((value) => String(value)) : []
    if (!existing.includes(ip)) {
      ipLogs[email] = [ip, ...existing].slice(0, 20)
    }
  }

  const currentIpLogs = settings?.ip_logs && typeof settings.ip_logs === 'object'
    ? JSON.stringify(settings.ip_logs)
    : ''
  const nextIpLogs = JSON.stringify(ipLogs)

  const updates: any[] = []
  if (
    settings &&
    Object.prototype.hasOwnProperty.call(settings, 'ip_logs') &&
    currentIpLogs !== nextIpLogs
  ) {
    updates.push(s.from('admin_settings').update({ ip_logs: ipLogs }).eq('id', 1))
  }

  updates.push(
    items.length
      ? s.from('plex_audit_logs').upsert(
          items.map((item) => ({
            id: `session:${item.sessionKey}:${new Date().toISOString().slice(0, 16)}`,
            action: 'session_seen',
            email: item.customer_email,
            share_id: item.sessionKey,
            details: {
              title: item.title,
              type: item.type,
              user: item.user,
              customer_name: item.customer_name,
              customer_email: item.customer_email,
              player: item.player,
              product: item.product,
              device: item.device,
              platform: item.platform,
              state: item.state,
              ip: item.ip,
              location: item.location,
              bandwidth_kbps: item.bandwidthKbps,
              started_at: item.startedAt,
              transcode_decision: item.transcodeDecision,
              video_decision: item.videoDecision,
              audio_decision: item.audioDecision,
              subtitle_decision: item.subtitleDecision,
              resolution: item.mediaVideoResolution,
              media_bitrate: item.mediaBitrate,
              container: item.mediaContainer,
              video_codec: item.mediaVideoCodec,
              audio_codec: item.mediaAudioCodec,
              transcode_speed: item.transcodeSpeed,
              transcode_progress: item.transcodeProgress,
              allowed_streams: item.allowed_streams,
              active_streams: item.active_streams,
              over_limit: item.over_limit,
              activity_context: item.activityContext,
              is_download: item.isDownload,
              download_count: item.download_count,
              over_download_limit: item.over_download_limit,
            },
          })),
          { onConflict: 'id' }
        )
      : Promise.resolve()
  )

  await Promise.allSettled(updates)

  const { data: historyRows } = await s
    .from('plex_audit_logs')
    .select('id,created_at,email,details')
    .eq('action', 'session_seen')
    .order('created_at', { ascending: false })
    .limit(24)

  const history = (historyRows || []).map((row: any) => ({
    id: String(row.id || ''),
    created_at: row.created_at,
    email: row.email || row.details?.customer_email || null,
    customer_name: row.details?.customer_name || null,
    title: row.details?.title || 'Unknown',
    player: row.details?.player || '',
    product: row.details?.product || '',
    state: row.details?.state || '',
    ip: row.details?.ip || '',
    started_at: row.details?.started_at || null,
    over_limit: Boolean(row.details?.over_limit),
    is_download: Boolean(row.details?.is_download),
    download_count: Number(row.details?.download_count || 0),
    over_download_limit: Boolean(row.details?.over_download_limit),
  }))

  const customerEmails = Array.from(new Set(items.map((item) => String(item.customer_email || '').trim().toLowerCase()).filter((value) => value.includes('@'))))

  const warningCounts = new Map<string, number>()
  await Promise.all(
    customerEmails.map(async (email) => {
      warningCounts.set(email, await countWarnings(email))
    })
  )

  const transcodeNoticeMap = new Map<string, string>()
  if (customerEmails.length) {
    const { data: transcodeNoticeRows } = await s
      .from('plex_audit_logs')
      .select('email,created_at')
      .eq('action', 'customer_transcode_warning')
      .in('email', customerEmails)
      .order('created_at', { ascending: false })

    for (const row of transcodeNoticeRows || []) {
      const email = String((row as any).email || '').trim().toLowerCase()
      const createdAt = String((row as any).created_at || '').trim()
      if (!email || !createdAt || transcodeNoticeMap.has(email)) continue
      transcodeNoticeMap.set(email, createdAt)
    }
  }

  const finalItems = items.map((item) => ({
    ...item,
    warning_count: warningCounts.get(String(item.customer_email || '').trim().toLowerCase()) || 0,
    transcode_notice_sent:
      transcodeNoticeMap.has(String(item.customer_email || '').trim().toLowerCase()) ||
      Boolean(customerMap.get(String(item.customer_email || '').trim().toLowerCase())?.transcodeNoticeSentAt),
    transcode_notice_sent_at:
      transcodeNoticeMap.get(String(item.customer_email || '').trim().toLowerCase()) ||
      customerMap.get(String(item.customer_email || '').trim().toLowerCase())?.transcodeNoticeSentAt ||
      null,
    ip_geo_label: geoMap.get(resolveGeoLookupIp(item))?.label || null,
    ip_geo_city: geoMap.get(resolveGeoLookupIp(item))?.city || null,
    ip_geo_region: geoMap.get(resolveGeoLookupIp(item))?.region || null,
    ip_geo_country: geoMap.get(resolveGeoLookupIp(item))?.country || null,
    ip_geo_postal_code: geoMap.get(resolveGeoLookupIp(item))?.postalCode || null,
    ip_geo_latitude: geoMap.get(resolveGeoLookupIp(item))?.latitude || null,
    ip_geo_longitude: geoMap.get(resolveGeoLookupIp(item))?.longitude || null,
  }))

  const latestResource = dashboard.resources[dashboard.resources.length - 1] || null
  const latestBandwidth = dashboard.bandwidth[dashboard.bandwidth.length - 1] || null
  const summary = {
    activeSessions: finalItems.length,
    transcodingSessions: finalItems.filter((item) => isVideoTranscodingSession(item)).length,
    overLimitSessions: finalItems.filter((item) => item.over_limit).length,
    activeDownloads: finalItems.filter((item) => item.isDownload).length,
    overDownloadSessions: finalItems.filter((item) => item.over_download_limit).length,
    remoteSessions: finalItems.filter((item) => item.location === 'wan').length,
    localSessions: finalItems.filter((item) => item.location === 'lan').length,
    currentBandwidthMbps: finalItems.reduce((sum, item) => sum + (Number(item.bandwidthKbps || 0) / 1000), 0),
    hostCpuUtilization: latestResource?.hostCpuUtilization ?? 0,
    processCpuUtilization: latestResource?.processCpuUtilization ?? 0,
    hostMemoryUtilization: latestResource?.hostMemoryUtilization ?? 0,
    processMemoryUtilization: latestResource?.processMemoryUtilization ?? 0,
    remoteBandwidthMbps: latestBandwidth?.remoteMbps ?? 0,
    localBandwidthMbps: latestBandwidth?.localMbps ?? 0,
  }

  return {
    items: finalItems,
    history,
    total: finalItems.length,
    flagged: finalItems.filter((item) => item.over_limit || item.over_download_limit).length,
    summary,
    resources: dashboard.resources,
    bandwidth: dashboard.bandwidth,
    server: dashboard.server,
    fetched_at: new Date().toISOString(),
  }
}
