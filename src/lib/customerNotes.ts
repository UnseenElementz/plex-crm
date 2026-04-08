export type ReferralRewardHistoryEntry = {
  email: string
  at: string
  amount: number
}

export type CustomerNoteState = {
  raw: string
  plainNotes: string
  visibleNotes: string
  plexUsername: string
  timezone: string
  downloads: boolean
  banned: boolean
  bannedAt: string | null
  referredBy: string
  referralClaimedAt: string | null
  referralRewardedAt: string | null
  referralRewardedTo: string
  referralCredit: number
  referralRewardHistory: ReferralRewardHistoryEntry[]
  paymentOrders: string[]
}

const MANAGED_LABELS = [
  'Plex',
  'Timezone',
  'Downloads',
  'Access',
  'Banned At',
  'Referred By',
  'Referral Claimed At',
  'Referral Rewarded At',
  'Referral Rewarded To',
  'Referral Credit',
  'Referral Reward History',
  'Payment Order History',
]

function normalizeAmount(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Number(parsed.toFixed(2))
}

function parseRewardHistory(value: string) {
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, at, amount] = entry.split('|').map((part) => String(part || '').trim())
      if (!email) return null
      return {
        email: email.toLowerCase(),
        at,
        amount: normalizeAmount(amount),
      } satisfies ReferralRewardHistoryEntry
    })
    .filter(Boolean) as ReferralRewardHistoryEntry[]
}

function formatRewardHistory(entries: ReferralRewardHistoryEntry[]) {
  return entries
    .filter((entry) => entry.email)
    .slice(-25)
    .map((entry) => `${entry.email}|${entry.at}|${normalizeAmount(entry.amount).toFixed(2)}`)
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
    plainNotes: '',
    visibleNotes: '',
    plexUsername: '',
    timezone: '',
    downloads: false,
    banned: false,
    bannedAt: null,
    referredBy: '',
    referralClaimedAt: null,
    referralRewardedAt: null,
    referralRewardedTo: '',
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
      case 'downloads':
        state.downloads = content.toLowerCase() === 'yes'
        break
      case 'access':
        state.banned = content.toLowerCase() === 'banned'
        break
      case 'banned at':
        state.bannedAt = content || null
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
  state.plainNotes = state.visibleNotes
  return state
}

export function buildCustomerNotes(input: {
  plainNotes?: string
  plexUsername?: string
  timezone?: string
  downloads?: boolean
}) {
  return mergeCustomerNotes({
    visibleNotes: input.plainNotes,
    plexUsername: input.plexUsername,
    timezone: input.timezone,
    downloads: input.downloads,
  })
}

export function mergeCustomerNotes(input: {
  existing?: unknown
  visibleNotes?: string
  plexUsername?: string
  timezone?: string
  downloads?: boolean
  banned?: boolean
  bannedAt?: string | null
  referredBy?: string
  referralClaimedAt?: string | null
  referralRewardedAt?: string | null
  referralRewardedTo?: string
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
    downloads: input.downloads !== undefined ? Boolean(input.downloads) : current.downloads,
    banned: input.banned !== undefined ? Boolean(input.banned) : current.banned,
    bannedAt: input.bannedAt !== undefined ? input.bannedAt : current.bannedAt,
    referredBy: input.referredBy !== undefined ? String(input.referredBy || '').trim().toUpperCase() : current.referredBy,
    referralClaimedAt: input.referralClaimedAt !== undefined ? input.referralClaimedAt : current.referralClaimedAt,
    referralRewardedAt: input.referralRewardedAt !== undefined ? input.referralRewardedAt : current.referralRewardedAt,
    referralRewardedTo: input.referralRewardedTo !== undefined ? String(input.referralRewardedTo || '').trim().toLowerCase() : current.referralRewardedTo,
    referralCredit: input.referralCredit !== undefined ? normalizeAmount(input.referralCredit) : current.referralCredit,
    referralRewardHistory: input.referralRewardHistory !== undefined ? input.referralRewardHistory : current.referralRewardHistory,
    paymentOrders: input.paymentOrders !== undefined ? parsePaymentOrders(input.paymentOrders.join(',')) : current.paymentOrders,
  }

  const lines = [
    next.visibleNotes || undefined,
    next.plexUsername ? `Plex: ${next.plexUsername}` : undefined,
    next.timezone ? `Timezone: ${next.timezone}` : undefined,
    next.downloads ? 'Downloads: Yes' : undefined,
    next.banned ? 'Access: Banned' : undefined,
    next.banned ? `Banned At: ${next.bannedAt || new Date().toISOString()}` : undefined,
    next.referredBy ? `Referred By: ${next.referredBy}` : undefined,
    next.referralClaimedAt ? `Referral Claimed At: ${next.referralClaimedAt}` : undefined,
    next.referralRewardedAt ? `Referral Rewarded At: ${next.referralRewardedAt}` : undefined,
    next.referralRewardedTo ? `Referral Rewarded To: ${next.referralRewardedTo}` : undefined,
    next.referralCredit > 0 ? `Referral Credit: ${next.referralCredit.toFixed(2)}` : undefined,
    next.referralRewardHistory.length ? `Referral Reward History: ${formatRewardHistory(next.referralRewardHistory)}` : undefined,
    next.paymentOrders.length ? `Payment Order History: ${parsePaymentOrders(next.paymentOrders.join(',')).join(',')}` : undefined,
  ].filter(Boolean)

  return lines.join('\n').trim()
}

export function getVisibleCustomerNotes(value: unknown) {
  return parseCustomerNotes(value).visibleNotes
}
