import crypto from 'crypto'
import { differenceInCalendarDays } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import { addAuditLog, syncCustomerDownloads } from '@/lib/moderation'
import { mergeCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { removePlexSharesByEmail } from '@/lib/plex'
import { COMMUNITY_STORAGE_CUSTOMER_EMAIL, COMMUNITY_STORAGE_CUSTOMER_NAME } from '@/lib/systemCustomers'

const COMMUNITY_OVERDUE_REMOVAL_ACTION = 'community_overdue_removed'
const COMMUNITY_PLAN_END_TERMINATION_ACTION = 'community_plan_end_terminated'

export const COMMUNITY_ACCESS_CODE_PREFIX = 'JOIN'
export const COMMUNITY_OVERDUE_GRACE_DAYS = 7

type CommunityAccessCodeRecord = {
  id: string
  code: string
  label: string
  lockedEmail: string | null
  createdAt: string | null
  createdBy: string | null
  usedAt: string | null
  usedByEmail: string | null
  disabled: boolean
}

type CommunityAccessCodeStatus =
  | {
      ok: true
      code: string
      label: string
      lockedEmail: string | null
      message: string
    }
  | {
      ok: false
      reason: 'not_found' | 'used' | 'disabled' | 'locked_email'
      message: string
    }

type CommunityStorageState = {
  accessCodes: CommunityAccessCodeRecord[]
  overdueRemovals: Array<{
    email: string
    dueDate: string
    createdAt: string
    overdueDays: number
    removedShares: number
    failures: number
  }>
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function generateCommunityCode() {
  return `${COMMUNITY_ACCESS_CODE_PREFIX}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

function getDefaultCommunityStorageState(): CommunityStorageState {
  return {
    accessCodes: [],
    overdueRemovals: [],
  }
}

function parseCommunityStorageState(value: unknown): CommunityStorageState {
  const raw = String(value || '').trim()
  if (!raw) return getDefaultCommunityStorageState()

  try {
    const parsed = JSON.parse(raw)
    const accessCodes = Array.isArray(parsed?.accessCodes) ? parsed.accessCodes.map(mapAccessCodeRecord).filter(Boolean) as CommunityAccessCodeRecord[] : []
    const overdueRemovals = Array.isArray(parsed?.overdueRemovals)
      ? parsed.overdueRemovals
          .map((entry: any) => ({
            email: normalizeEmail(entry?.email),
            dueDate: String(entry?.dueDate || '').trim(),
            createdAt: String(entry?.createdAt || '').trim(),
            overdueDays: Math.max(0, Number(entry?.overdueDays || 0)),
            removedShares: Math.max(0, Number(entry?.removedShares || 0)),
            failures: Math.max(0, Number(entry?.failures || 0)),
          }))
          .filter((entry: CommunityStorageState['overdueRemovals'][number]) => entry.email && entry.dueDate)
      : []

    return {
      accessCodes,
      overdueRemovals,
    }
  } catch {
    return getDefaultCommunityStorageState()
  }
}

function stringifyCommunityStorageState(state: CommunityStorageState) {
  return JSON.stringify({
    accessCodes: state.accessCodes.map((record) => ({
      id: record.id,
      code: record.code,
      label: record.label,
      lockedEmail: record.lockedEmail,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
      usedAt: record.usedAt,
      usedByEmail: record.usedByEmail,
      disabled: record.disabled,
    })),
    overdueRemovals: state.overdueRemovals,
  })
}

function mapAccessCodeRecord(row: any): CommunityAccessCodeRecord | null {
  const code = normalizeCode(row?.code)
  if (!code) return null

  return {
    id: String(row?.id || code),
    code,
    label: String(row?.label || '').trim(),
    lockedEmail: normalizeEmail(row?.lockedEmail || row?.locked_email) || null,
    createdAt: String(row?.createdAt || row?.created_at || '').trim() || null,
    createdBy: String(row?.createdBy || row?.created_by || '').trim() || null,
    usedAt: String(row?.usedAt || row?.used_at || '').trim() || null,
    usedByEmail: normalizeEmail(row?.usedByEmail || row?.used_by_email) || null,
    disabled: Boolean(row?.disabled),
  }
}

async function getCommunityStorageRecord() {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('customers')
    .select('id,notes')
    .eq('email', COMMUNITY_STORAGE_CUSTOMER_EMAIL)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (data?.id) {
    return {
      id: String(data.id),
      notes: String(data.notes || ''),
      state: parseCommunityStorageState(data.notes),
    }
  }

  const initialNotes = stringifyCommunityStorageState(getDefaultCommunityStorageState())
  const now = new Date().toISOString()
  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert({
      name: COMMUNITY_STORAGE_CUSTOMER_NAME,
      email: COMMUNITY_STORAGE_CUSTOMER_EMAIL,
      subscription_type: 'yearly',
      streams: 1,
      start_date: now,
      next_payment_date: now,
      subscription_status: 'inactive',
      notes: initialNotes,
    })
    .select('id,notes')
    .single()

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message || 'Failed to initialize community access storage')
  }

  return {
    id: String(inserted.id),
    notes: String(inserted.notes || initialNotes),
    state: parseCommunityStorageState(inserted.notes || initialNotes),
  }
}

async function saveCommunityStorageState(customerId: string, state: CommunityStorageState) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('customers')
    .update({ notes: stringifyCommunityStorageState(state) })
    .eq('id', customerId)

  if (error) throw new Error(error.message)
}

async function listCommunityAccessCodeRecords() {
  const storage = await getCommunityStorageRecord()
  return storage.state.accessCodes
}

export async function createCommunityAccessCode(input?: {
  email?: string | null
  label?: string | null
  createdBy?: string | null
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const existingCodes = new Set((await listCommunityAccessCodeRecords()).map((record) => record.code))
  let code = generateCommunityCode()
  while (existingCodes.has(code)) {
    code = generateCommunityCode()
  }

  const lockedEmail = normalizeEmail(input?.email) || null
  const label = String(input?.label || '').trim()
  const createdBy = String(input?.createdBy || '').trim() || null
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  const storage = await getCommunityStorageRecord()
  storage.state.accessCodes.unshift({
    id,
    code,
    label,
    lockedEmail,
    createdAt,
    createdBy,
    usedAt: null,
    usedByEmail: null,
    disabled: false,
  })
  await saveCommunityStorageState(storage.id, storage.state)

  return {
    id,
    code,
    label,
    lockedEmail,
    createdBy,
  }
}

export async function getCommunityAccessCodeStatus(input: {
  code?: string | null
  email?: string | null
}): Promise<CommunityAccessCodeStatus> {
  const normalizedCode = normalizeCode(input.code)
  const normalizedEmail = normalizeEmail(input.email)
  if (!normalizedCode) {
    return { ok: false, reason: 'not_found', message: 'That access code was not found.' }
  }

  const records = await listCommunityAccessCodeRecords()
  const record = records.find((entry) => entry.code === normalizedCode) || null

  if (!record) {
    return { ok: false, reason: 'not_found', message: 'That access code was not found.' }
  }
  if (record.disabled) {
    return { ok: false, reason: 'disabled', message: 'That access code is no longer active.' }
  }
  if (record.usedAt) {
    return { ok: false, reason: 'used', message: 'That access code has already been used.' }
  }
  if (record.lockedEmail && normalizedEmail && record.lockedEmail !== normalizedEmail) {
    return { ok: false, reason: 'locked_email', message: 'That access code is locked to a different email address.' }
  }

  return {
    ok: true,
    code: record.code,
    label: record.label,
    lockedEmail: record.lockedEmail,
    message: record.lockedEmail && !normalizedEmail
      ? `Private access code ready. Finish signup with ${record.lockedEmail}.`
      : 'One-time community access code ready. This unlocks signup only and does not add referral credit.',
  }
}

export async function consumeCommunityAccessCode(input: {
  code?: string | null
  email?: string | null
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const status = await getCommunityAccessCodeStatus(input)
  if (!status.ok) throw new Error(status.message)

  const records = await listCommunityAccessCodeRecords()
  const record = records.find((entry) => entry.code === status.code)
  if (!record) throw new Error('That access code was not found.')

  const usedAt = new Date().toISOString()
  const usedByEmail = normalizeEmail(input.email) || null
  const storage = await getCommunityStorageRecord()
  storage.state.accessCodes = storage.state.accessCodes.map((entry) =>
    entry.id === record.id
      ? {
          ...entry,
          usedAt,
          usedByEmail,
        }
      : entry
  )
  await saveCommunityStorageState(storage.id, storage.state)

  return {
    code: record.code,
    usedAt,
    usedByEmail,
  }
}

export async function removeOverdueCustomersFromCommunity() {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { data: settings, error: settingsError } = await supabase
    .from('admin_settings')
    .select('plex_token')
    .eq('id', 1)
    .maybeSingle()

  if (settingsError) throw new Error(settingsError.message)

  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id,name,email,notes,next_payment_date,subscription_status')

  if (customersError) throw new Error(customersError.message)

  const storage = await getCommunityStorageRecord()

  const removalRefs = new Set(
    storage.state.overdueRemovals
      .map((entry) => {
        const email = normalizeEmail(entry.email)
        const dueDate = String(entry.dueDate || '').trim()
        return email && dueDate ? `${email}::${dueDate}` : ''
      })
      .filter(Boolean)
  )

  const now = new Date()
  const token = String(settings?.plex_token || '').trim()
  const candidates = (customers || []).filter((customer: any) => {
    const email = normalizeEmail(customer?.email)
    const dueDate = String(customer?.next_payment_date || '').trim()
    if (!email || !dueDate) return false
    const due = new Date(dueDate)
    if (Number.isNaN(due.getTime())) return false
    const parsedNotes = parseCustomerNotes(customer?.notes || '')
    if (parsedNotes.terminateAtPlanEnd) {
      return due.getTime() <= now.getTime()
    }
    return differenceInCalendarDays(now, due) >= COMMUNITY_OVERDUE_GRACE_DAYS
  })

  const processed: Array<{
    email: string
    overdueDays: number
    dueDate: string
    removedShares: number
    failures: number
  }> = []
  const skipped: string[] = []

  for (const customer of candidates) {
    const email = normalizeEmail(customer.email)
    const dueDate = String(customer.next_payment_date || '').trim()
    const ref = `${email}::${dueDate}`
    if (removalRefs.has(ref)) {
      skipped.push(email)
      continue
    }

    const overdueDays = differenceInCalendarDays(now, new Date(dueDate))
    const parsedNotes = parseCustomerNotes(customer?.notes || '')
    const terminationReason = parsedNotes.terminateAtPlanEnd ? 'scheduled_plan_end' : 'overdue_7_days'
    const plexResult = token ? await removePlexSharesByEmail(token, email) : { removed: [], failures: [{ server_machine_id: '', error: 'Plex token not configured' }] }

    const nextNotes = mergeCustomerNotes({
      existing: customer?.notes || '',
      downloads: false,
      terminateAtPlanEnd: false,
      terminationScheduledAt: null,
    })

    await supabase
      .from('customers')
      .update({ subscription_status: 'inactive', notes: nextNotes })
      .eq('id', customer.id)

    await syncCustomerDownloads(email, false)

    await addAuditLog({
      action: parsedNotes.terminateAtPlanEnd ? COMMUNITY_PLAN_END_TERMINATION_ACTION : COMMUNITY_OVERDUE_REMOVAL_ACTION,
      email,
      details: {
        due_date: dueDate,
        overdue_days: overdueDays,
        removed_share_count: plexResult.removed.length,
        failure_count: plexResult.failures.length,
        reason: terminationReason,
      },
    })

    storage.state.overdueRemovals.push({
      email,
      dueDate,
      createdAt: new Date().toISOString(),
      overdueDays,
      removedShares: plexResult.removed.length,
      failures: plexResult.failures.length,
    })

    await saveCommunityStorageState(storage.id, storage.state)

    processed.push({
      email,
      overdueDays,
      dueDate,
      removedShares: plexResult.removed.length,
      failures: plexResult.failures.length,
    })
  }

  return {
    ok: true,
    checked: candidates.length,
    processed,
    skipped,
  }
}
