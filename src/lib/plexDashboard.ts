import { getPreferredServerUri } from '@/lib/plex'

type AttrMap = Record<string, string>

export type PlexDashboardResourcePoint = {
  at: number
  hostCpuUtilization: number
  processCpuUtilization: number
  hostMemoryUtilization: number
  processMemoryUtilization: number
}

export type PlexDashboardBandwidthPoint = {
  at: number
  localMbps: number
  remoteMbps: number
  totalMbps: number
}

export type PlexDashboardSession = {
  sessionKey: string
  title: string
  primaryTitle: string
  secondaryTitle: string
  type: string
  activityContext: string
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
  playerMachineIdentifier: string
  device: string
  platform: string
  platformVersion: string
  profile: string
  version: string
  local: boolean
  relayed: boolean
  secure: boolean
  mediaId: string
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
  isDownload: boolean
}

export type PlexDashboardSnapshot = {
  server: {
    baseUrl: string
    machineIdentifier: string
    version: string
  }
  sessions: PlexDashboardSession[]
  resources: PlexDashboardResourcePoint[]
  bandwidth: PlexDashboardBandwidthPoint[]
}

const preferredServerCache = new Map<string, { value: string; expiresAt: number }>()

function plexHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    Accept: 'application/xml',
    'X-Plex-Client-Identifier': 'plex-crm-dashboard',
    'X-Plex-Product': 'Plex CRM Dashboard',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
  } as Record<string, string>
}

function parseAttrs(input: string) {
  const attrs: AttrMap = {}
  for (const match of input.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2])
  }
  return attrs
}

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function toNumber(value: string | undefined) {
  const num = Number(value || '')
  return Number.isFinite(num) ? num : 0
}

function toBooleanBit(value: string | undefined) {
  return value === '1' || value === 'true'
}

function toIsoFromUnix(value: string | undefined) {
  const raw = Number(value || '')
  return Number.isFinite(raw) && raw > 0 ? new Date(raw * 1000).toISOString() : null
}

function computeProgress(viewOffsetMs: number, durationMs: number) {
  if (!durationMs) return 0
  return Math.max(0, Math.min(100, (viewOffsetMs / durationMs) * 100))
}

async function resolveBaseUrl(serverUrl: string, token: string) {
  const clean = String(serverUrl || '').trim().replace(/\/+$/, '')
  if (clean && !clean.includes('plex.tv')) return clean

  const cacheKey = token.slice(0, 12)
  const cached = preferredServerCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const discovered = await getPreferredServerUri(token)
  const resolved = String(discovered || clean || 'https://plex.tv').trim().replace(/\/+$/, '') || 'https://plex.tv'
  preferredServerCache.set(cacheKey, { value: resolved, expiresAt: Date.now() + 5 * 60 * 1000 })
  return resolved
}

function parseIdentity(xml: string) {
  const match = xml.match(/<MediaContainer\s+([^>]+)>/)
  const attrs = parseAttrs(match?.[1] || '')
  return {
    machineIdentifier: attrs.machineIdentifier || '',
    version: attrs.version || '',
  }
}

function parseSessions(xml: string): PlexDashboardSession[] {
  const blocks = xml.split('</Video>')
  const sessions: PlexDashboardSession[] = []

  for (const block of blocks) {
    if (!block.includes('<Video')) continue

    const video = parseAttrs(block.match(/<Video\s+([^>]+)>/)?.[1] || '')
    const user = parseAttrs(block.match(/<User\s+([^>]+)\/>/)?.[1] || '')
    const player = parseAttrs(block.match(/<Player\s+([^>]+)\/>/)?.[1] || '')
    const session = parseAttrs(block.match(/<Session\s+([^>]+)\/>/)?.[1] || '')
    const media = parseAttrs(block.match(/<Media\s+([^>]+)>/)?.[1] || '')
    const part = parseAttrs(block.match(/<Part\s+([^>]+)>/)?.[1] || '')
    const transcode = parseAttrs(block.match(/<TranscodeSession\s+([^>]+)\/>/)?.[1] || '')

    const durationMs = toNumber(video.duration || media.duration || part.duration)
    const viewOffsetMs = toNumber(video.viewOffset)
    const startedAt = toIsoFromUnix(session.startedAt)
    const primaryTitle = video.grandparentTitle || video.title || 'Unknown'
    const secondaryParts = [video.parentTitle, video.title].filter(Boolean)
    const secondaryTitle = secondaryParts.join(' / ')
    const titleParts = [primaryTitle, secondaryTitle].filter(Boolean)
    const title = titleParts.join(' / ') || 'Unknown'
    const activityContext = transcode.context || session.type || player.state || ''
    const downloadSignal = [activityContext, player.title, player.product, player.platform, video.type, part.decision]
      .join(' ')
      .toLowerCase()
    const isDownload = /\b(sync|download)\b/.test(downloadSignal)

    sessions.push({
      sessionKey: session.id || video.sessionKey || player.playbackId || `${user.title || 'user'}-${video.ratingKey || video.title || 'session'}`,
      title,
      primaryTitle,
      secondaryTitle,
      type: video.type || 'video',
      activityContext,
      user: user.title || user.username || '',
      userId: player.userID || '',
      player: player.title || player.device || '',
      product: player.product || '',
      state: player.state || '',
      ip: player.address || '',
      remotePublicAddress: player.remotePublicAddress || player.address || '',
      startedAt,
      location: session.location || (toBooleanBit(player.local) ? 'lan' : 'wan'),
      bandwidthKbps: toNumber(session.bandwidth),
      transcodeDecision: transcode.key ? 'transcode' : (part.decision || 'direct play'),
      videoDecision: transcode.videoDecision || (part.decision || 'direct play'),
      audioDecision: transcode.audioDecision || (part.decision || 'direct play'),
      subtitleDecision: transcode.subtitleDecision || 'direct play',
      playerMachineIdentifier: player.machineIdentifier || '',
      device: player.device || '',
      platform: player.platform || '',
      platformVersion: player.platformVersion || '',
      profile: player.profile || '',
      version: player.version || '',
      local: toBooleanBit(player.local),
      relayed: toBooleanBit(player.relayed),
      secure: toBooleanBit(player.secure),
      mediaId: media.id || '',
      mediaBitrate: toNumber(media.bitrate || part.bitrate),
      mediaContainer: media.container || part.container || transcode.container || '',
      mediaVideoCodec: media.videoCodec || transcode.videoCodec || '',
      mediaAudioCodec: media.audioCodec || transcode.audioCodec || '',
      mediaAudioChannels: toNumber(media.audioChannels || transcode.audioChannels),
      mediaVideoResolution: media.videoResolution || '',
      mediaWidth: toNumber(media.width || transcode.width),
      mediaHeight: toNumber(media.height || transcode.height),
      mediaProtocol: media.protocol || part.protocol || transcode.protocol || '',
      durationMs,
      viewOffsetMs,
      progressPercent: computeProgress(viewOffsetMs, durationMs),
      thumbPath: video.grandparentThumb || video.parentThumb || video.thumb || '',
      artPath: video.art || video.grandparentArt || video.parentArt || '',
      librarySectionTitle: video.librarySectionTitle || '',
      grandparentTitle: video.grandparentTitle || '',
      parentTitle: video.parentTitle || '',
      partDecision: part.decision || '',
      isTranscoding: Boolean(transcode.key),
      transcodeSpeed: toNumber(transcode.speed),
      transcodeProgress: toNumber(transcode.progress),
      transcodeHardwareDecoding: transcode.transcodeHwDecodingTitle || '',
      transcodeHardwareEncoding: transcode.transcodeHwEncodingTitle || '',
      transcodeHardwareFullPipeline: toBooleanBit(transcode.transcodeHwFullPipeline),
      isDownload,
    })
  }

  return sessions
}

function parseResources(xml: string): PlexDashboardResourcePoint[] {
  return [...xml.matchAll(/<StatisticsResources\s+([^>]+)\/>/g)]
    .map((match) => parseAttrs(match[1]))
    .map((attrs) => ({
      at: toNumber(attrs.at),
      hostCpuUtilization: toNumber(attrs.hostCpuUtilization),
      processCpuUtilization: toNumber(attrs.processCpuUtilization),
      hostMemoryUtilization: toNumber(attrs.hostMemoryUtilization),
      processMemoryUtilization: toNumber(attrs.processMemoryUtilization),
    }))
    .filter((item) => item.at > 0)
    .sort((a, b) => a.at - b.at)
}

function parseBandwidth(xml: string): PlexDashboardBandwidthPoint[] {
  const grouped = new Map<number, { localBytes: number; remoteBytes: number }>()

  for (const match of xml.matchAll(/<StatisticsBandwidth\s+([^>]+)\/>/g)) {
    const attrs = parseAttrs(match[1])
    const at = toNumber(attrs.at)
    if (!at) continue
    const bytes = toNumber(attrs.bytes)
    const entry = grouped.get(at) || { localBytes: 0, remoteBytes: 0 }
    if (attrs.lan === '1') entry.localBytes += bytes
    else entry.remoteBytes += bytes
    grouped.set(at, entry)
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-48)
    .map(([at, entry]) => {
      const localMbps = (entry.localBytes * 8) / 1_000_000
      const remoteMbps = (entry.remoteBytes * 8) / 1_000_000
      return {
        at,
        localMbps,
        remoteMbps,
        totalMbps: localMbps + remoteMbps,
      }
    })
}

export async function fetchPlexDashboard(serverUrl: string, token: string): Promise<PlexDashboardSnapshot> {
  const baseUrl = await resolveBaseUrl(serverUrl, token)
  const headers = plexHeaders(token)

  const [identityRes, sessionsRes, resourcesRes, bandwidthRes] = await Promise.all([
    fetch(`${baseUrl}/identity`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/status/sessions`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/statistics/resources?timespan=6`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/statistics/bandwidth?timespan=6`, { headers, cache: 'no-store' }),
  ])

  if (!sessionsRes.ok) {
    throw new Error(`Plex sessions fetch failed: ${sessionsRes.status}`)
  }

  const [identityXml, sessionsXml, resourcesXml, bandwidthXml] = await Promise.all([
    identityRes.ok ? identityRes.text() : Promise.resolve('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0"></MediaContainer>'),
    sessionsRes.text(),
    resourcesRes.ok ? resourcesRes.text() : Promise.resolve('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0"></MediaContainer>'),
    bandwidthRes.ok ? bandwidthRes.text() : Promise.resolve('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0"></MediaContainer>'),
  ])

  const identity = parseIdentity(identityXml)

  return {
    server: {
      baseUrl,
      machineIdentifier: identity.machineIdentifier,
      version: identity.version,
    },
    sessions: parseSessions(sessionsXml),
    resources: parseResources(resourcesXml),
    bandwidth: parseBandwidth(bandwidthXml),
  }
}
