export type ReferralRewardHistoryEntry = {
  email: string
  at: string
  amount: number
  reference?: string
}

export type WarningHistoryEntry = {
  at: string
  ip: string
  user: string
  reason: string
}

export type CustomerNoteState = {
  raw: string
  visibleNotes: string
  plexUsername: string
  timezone: string
  joinAccessMode: string
  joinAccessGrantedAt: string | null
  downloads: boolean
  lastPortalSeenAt: string | null
  lastPortalSource: string
  terminateAtPlanEnd: boolean
  terminationScheduledAt: string | null
  transcodeNoticeSentAt: string | null
  warningCount: number
  warningHistory: WarningHistoryEntry[]
  banned: boolean
  bannedAt: string | null
  banReason: string
  referredBy: string
  referralClaimedAt: string | null
  referralRewardedAt: string | null
  referralRewardedTo: string
  referralSignupCreditGrantedAt: string | null
  referralCredit: number
  referralRewardHistory: ReferralRewardHistoryEntry[]
  paymentOrders: string[]
}

const MANAGED_LABELS = [
  'Plex',
  'Timezone',
  'Join Access Mode',
  'Join Access Granted At',
  'Downloads',
  'Last Portal Seen At',
  'Last Portal Source',
  'Terminate At Plan End',
  'Termination Scheduled At',
  'Transcode Notice Sent At',
  'Warning Count',
  'Warning History',
  'Access',
  'Banned At',
  'Ban Reason',
  'Referred By',
  'Referral Claimed At',
  'Referral Rewarded At',
  'Referral Rewarded To',
  'Referral Signup Credit Granted At',
  'Referral Credit',
  'Referral Reward History',
  'Payment Order History',
]

function normalizeAmount(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Number(parsed.toFixed(2))
}

function normalizeCount(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.max(0, Math.floor(parsed))
}

function parseRewardHistory(value: string) {
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, at, amount, reference] = entry.split('|').map((part) => String(part || '').trim())
      if (!email) return null
      return {
        email: email.toLowerCase(),
        at,
        amount: normalizeAmount(amount),
        reference: reference || undefined,
      } satisfies ReferralRewardHistoryEntry
    })
    .filter(Boolean) as ReferralRewardHistoryEntry[]
}

function parseWarningHistory(value: string) {
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [at, ip, user, reason] = entry.split('|').map((part) => String(part || '').trim())
      if (!at) return null
      return {
        at,
        ip,
        user,
        reason,
      } satisfies WarningHistoryEntry
    })
    .filter(Boolean) as WarningHistoryEntry[]
}

function formatRewardHistory(entries: ReferralRewardHistoryEntry[]) {
  return entries
    .filter((entry) => entry.email)
    .slice(-25)
    .map((entry) => `${entry.email}|${entry.at}|${normalizeAmount(entry.amount).toFixed(2)}${entry.reference ? `|${String(entry.reference).trim()}` : ''}`)
    .join(';')
}

function formatWarningHistory(entries: WarningHistoryEntry[]) {
  return entries
    .filter((entry) => entry.at)
    .slice(-12)
    .map((entry) => [entry.at, entry.ip, entry.user, entry.reason].map((part) => String(part || '').trim()).join('|'))
    .join(';')
}

function parsePaymentOrders(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  ).slice(-12)
}

export function isManagedCustomerNoteLine(line: string) {
  const trimmed = String(line || '').trim()
  return MANAGED_LABELS.some((label) => trimmed.toLowerCase().startsWith(`${label.toLowerCase()}:`))
}

export function parseCustomerNotes(value: unknown): CustomerNoteState {
  const raw = String(value || '')
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const visibleLines: string[] = []
  const state: CustomerNoteState = {
    raw,
    visibleNotes: '',
    plexUsername: '',
    timezone: '',
    joinAccessMode: '',
    joinAccessGrantedAt: null,
    downloads: false,
    lastPortalSeenAt: null,
    lastPortalSource: '',
    terminateAtPlanEnd: false,
    terminationScheduledAt: null,
    transcodeNoticeSentAt: null,
    warningCount: 0,
    warningHistory: [],
    banned: false,
    bannedAt: null,
    banReason: '',
    referredBy: '',
    referralClaimedAt: null,
    referralRewardedAt: null,
    referralRewardedTo: '',
    referralSignupCreditGrantedAt: null,
    referralCredit: 0,
    referralRewardHistory: [],
    paymentOrders: [],
  }

  for (const line of lines) {
    const splitIndex = line.indexOf(':')
    const label = splitIndex >= 0 ? line.slice(0, splitIndex).trim().toLowerCase() : ''
    const content = splitIndex >= 0 ? line.slice(splitIndex + 1).trim() : ''

    switch (label) {
      case 'plex':
        state.plexUsername = content
        break
      case 'timezone':
        state.timezone = content
        break
      case 'join access mode':
        state.joinAccessMode = content
        break
      case 'join access granted at':
        state.joinAccessGrantedAt = content || null
        break
      case 'downloads':
        state.downloads = content.toLowerCase() === 'yes'
        break
      case 'last portal seen at':
        state.lastPortalSeenAt = content || null
        break
      case 'last portal source':
        state.lastPortalSource = content || ''
        break
      case 'terminate at plan end':
        state.terminateAtPlanEnd = content.toLowerCase() === 'yes'
        break
      case 'termination scheduled at':
        state.terminationScheduledAt = content || null
        break
      case 'transcode notice sent at':
        state.transcodeNoticeSentAt = content || null
        break
      case 'warning count':
        state.warningCount = normalizeCount(content)
        break
      case 'warning history':
        state.warningHistory = parseWarningHistory(content)
        break
      case 'access':
        state.banned = content.toLowerCase() === 'banned'
        break
      case 'banned at':
        state.bannedAt = content || null
        break
      case 'ban reason':
        state.banReason = content || ''
        break
      case 'referred by':
        state.referredBy = content.toUpperCase()
        break
      case 'referral claimed at':
        state.referralClaimedAt = content || null
        break
      case 'referral rewarded at':
        state.referralRewardedAt = content || null
        break
      case 'referral rewarded to':
        state.referralRewardedTo = content.toLowerCase()
        break
      case 'referral signup credit granted at':
        state.referralSignupCreditGrantedAt = content || null
        break
      case 'referral credit':
        state.referralCredit = normalizeAmount(content.replace(/gbp/gi, '').replace(/[^0-9.]+/g, ''))
        break
      case 'referral reward history':
        state.referralRewardHistory = parseRewardHistory(content)
        break
      case 'payment order history':
        state.paymentOrders = parsePaymentOrders(content)
        break
      default:
        visibleLines.push(line)
        break
    }
  }

  state.visibleNotes = visibleLines.join('\n').trim()
  return state
}

export function mergeCustomerNotes(input: {
  existing?: unknown
  visibleNotes?: string
  plexUsername?: string
  timezone?: string
  joinAccessMode?: string
  joinAccessGrantedAt?: string | null
  downloads?: boolean
  lastPortalSeenAt?: string | null
  lastPortalSource?: string
  terminateAtPlanEnd?: boolean
  terminationScheduledAt?: string | null
  transcodeNoticeSentAt?: string | null
  warningCount?: number
  warningHistory?: WarningHistoryEntry[]
  banned?: boolean
  bannedAt?: string | null
  banReason?: string
  referredBy?: string
  referralClaimedAt?: string | null
  referralRewardedAt?: string | null
  referralRewardedTo?: string
  referralSignupCreditGrantedAt?: string | null
  referralCredit?: number
  referralRewardHistory?: ReferralRewardHistoryEntry[]
  paymentOrders?: string[]
}) {
  const current = parseCustomerNotes(input.existing)

  const next: CustomerNoteState = {
    ...current,
    visibleNotes: input.visibleNotes !== undefined ? String(input.visibleNotes || '').trim() : current.visibleNotes,
    plexUsername: input.plexUsername !== undefined ? String(input.plexUsername || '').trim() : current.plexUsername,
    timezone: input.timezone !== undefined ? String(input.timezone || '').trim() : current.timezone,
    joinAccessMode: input.joinAccessMode !== undefined ? String(input.joinAccessMode || '').trim() : current.joinAccessMode,
    joinAccessGrantedAt: input.joinAccessGrantedAt !== undefined ? input.joinAccessGrantedAt : current.joinAccessGrantedAt,
    downloads: input.downloads !== undefined ? Boolean(input.downloads) : current.downloads,
    lastPortalSeenAt: input.lastPortalSeenAt !== undefined ? input.lastPortalSeenAt : current.lastPortalSeenAt,
    lastPortalSource: input.lastPortalSource !== undefined ? String(input.lastPortalSource || '').trim() : current.lastPortalSource,
    terminateAtPlanEnd: input.terminateAtPlanEnd !== undefined ? Boolean(input.terminateAtPlanEnd) : current.terminateAtPlanEnd,
    terminationScheduledAt: input.terminationScheduledAt !== undefined ? input.terminationScheduledAt : current.terminationScheduledAt,
    transcodeNoticeSentAt: input.transcodeNoticeSentAt !== undefined ? input.transcodeNoticeSentAt : current.transcodeNoticeSentAt,
    warningCount: input.warningCount !== undefined ? normalizeCount(input.warningCount) : current.warningCount,
    warningHistory: input.warningHistory !== undefined ? input.warningHistory : current.warningHistory,
    banned: input.banned !== undefined ? Boolean(input.banned) : current.banned,
    bannedAt: input.bannedAt !== undefined ? input.bannedAt : current.bannedAt,
    banReason: input.banReason !== undefined ? String(input.banReason || '').trim() : current.banReason,
    referredBy: input.referredBy !== undefined ? String(input.referredBy || '').trim().toUpperCase() : current.referredBy,
    referralClaimedAt: input.referralClaimedAt !== undefined ? input.referralClaimedAt : current.referralClaimedAt,
    referralRewardedAt: input.referralRewardedAt !== undefined ? input.referralRewardedAt : current.referralRewardedAt,
    referralRewardedTo: input.referralRewardedTo !== undefined ? String(input.referralRewardedTo || '').trim().toLowerCase() : current.referralRewardedTo,
    referralSignupCreditGrantedAt:
      input.referralSignupCreditGrantedAt !== undefined ? input.referralSignupCreditGrantedAt : current.referralSignupCreditGrantedAt,
    referralCredit: input.referralCredit !== undefined ? normalizeAmount(input.referralCredit) : current.referralCredit,
    referralRewardHistory: input.referralRewardHistory !== undefined ? input.referralRewardHistory : current.referralRewardHistory,
    paymentOrders: input.paymentOrders !== undefined ? parsePaymentOrders(input.paymentOrders.join(',')) : current.paymentOrders,
  }

  const lines = [
    next.visibleNotes || undefined,
    next.plexUsername ? `Plex: ${next.plexUsername}` : undefined,
    next.timezone ? `Timezone: ${next.timezone}` : undefined,
    next.joinAccessMode ? `Join Access Mode: ${next.joinAccessMode}` : undefined,
    next.joinAccessGrantedAt ? `Join Access Granted At: ${next.joinAccessGrantedAt}` : undefined,
    next.downloads ? 'Downloads: Yes' : undefined,
    next.lastPortalSeenAt ? `Last Portal Seen At: ${next.lastPortalSeenAt}` : undefined,
    next.lastPortalSource ? `Last Portal Source: ${next.lastPortalSource}` : undefined,
    next.terminateAtPlanEnd ? 'Terminate At Plan End: Yes' : undefined,
    next.terminationScheduledAt ? `Termination Scheduled At: ${next.terminationScheduledAt}` : undefined,
    next.transcodeNoticeSentAt ? `Transcode Notice Sent At: ${next.transcodeNoticeSentAt}` : undefined,
    next.warningCount > 0 ? `Warning Count: ${next.warningCount}` : undefined,
    next.warningHistory.length ? `Warning History: ${formatWarningHistory(next.warningHistory)}` : undefined,
    next.banned ? 'Access: Banned' : undefined,
    next.banned ? `Banned At: ${next.bannedAt || new Date().toISOString()}` : undefined,
    next.banned && next.banReason ? `Ban Reason: ${next.banReason}` : undefined,
    next.referredBy ? `Referred By: ${next.referredBy}` : undefined,
    next.referralClaimedAt ? `Referral Claimed At: ${next.referralClaimedAt}` : undefined,
    next.referralRewardedAt ? `Referral Rewarded At: ${next.referralRewardedAt}` : undefined,
    next.referralRewardedTo ? `Referral Rewarded To: ${next.referralRewardedTo}` : undefined,
    next.referralSignupCreditGrantedAt ? `Referral Signup Credit Granted At: ${next.referralSignupCreditGrantedAt}` : undefined,
    next.referralCredit > 0 ? `Referral Credit: ${next.referralCredit.toFixed(2)}` : undefined,
    next.referralRewardHistory.length ? `Referral Reward History: ${formatRewardHistory(next.referralRewardHistory)}` : undefined,
    next.paymentOrders.length ? `Payment Order History: ${parsePaymentOrders(next.paymentOrders.join(',')).join(',')}` : undefined,
  ].filter(Boolean)

  return lines.join('\n').trim()
}

export function getVisibleCustomerNotes(value: unknown) {
  return parseCustomerNotes(value).visibleNotes
}
