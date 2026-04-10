import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { CustomerCreateSchema, formatZodError } from '@/lib/validation'
import { calculateNextDue } from '@/lib/pricing'
import { getVisibleCustomerNotes, mergeCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { buildReferralCode, REFERRAL_LINK_LIMIT } from '@/lib/referrals'
import { getActivePlexUsernameMap } from '@/lib/plex'
import { isSystemCustomerEmail } from '@/lib/systemCustomers'

function mem(){
  const g = globalThis as any
  if (!g.__customers) {
    g.__customers = []
  }
  return g.__customers as any[]
}

export async function GET(){
  if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const svc = (url && key) ? createClient(url, key) : null
  if (!supabase && !svc) return NextResponse.json(mem())
  const client = (svc || supabase)!
  const { data, error } = await client.from('customers').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const visibleCustomers = (data || []).filter((row: any) => !isSystemCustomerEmail(row?.email))
  const livePlexUsernames = await getActivePlexUsernameMap().catch(() => new Map<string, string>())
  const referralCounts = new Map<string, number>()
  for (const row of visibleCustomers) {
    const email = String((row as any).email || '').trim().toLowerCase()
    if (!email) continue
    referralCounts.set(email, 0)
  }
  for (const row of visibleCustomers) {
    const parsedNotes = parseCustomerNotes((row as any).notes)
    const referredBy = String(parsedNotes.referredBy || '').trim().toUpperCase()
    if (!referredBy) continue
    const referrer = visibleCustomers.find((candidate: any) => buildReferralCode(String(candidate.email || '').trim().toLowerCase()) === referredBy)
    const referrerEmail = String(referrer?.email || '').trim().toLowerCase()
    if (!referrerEmail) continue
    referralCounts.set(referrerEmail, Number(referralCounts.get(referrerEmail) || 0) + 1)
  }
  const mapped = visibleCustomers.map((c: any) => {
    const plan: any = (c.plan ?? c.subscription_type)
    const rawNext = c.next_due_date ?? c.next_payment_date
    const d = rawNext ? new Date(rawNext) : null
    const year = d ? d.getFullYear() : 0
    const start = c.start_date ? new Date(c.start_date) : new Date()
    const safeNext = plan
      ? ((!d || isNaN(d.getTime()) || year < 2000 || year > 2100) ? calculateNextDue(plan, start).toISOString() : rawNext)
      : (rawNext || null)
    const parsedNotes = parseCustomerNotes(c.notes)
    const livePlexUsername = livePlexUsernames.get(String(c.email || '').trim().toLowerCase()) || ''
    const savedPlexUsername = parsedNotes.plexUsername || undefined
    const resolvedPlexUsername = livePlexUsername || savedPlexUsername
    const plexUsernameSource = livePlexUsername ? 'live' : savedPlexUsername ? 'saved' : null
    return {
      id: c.id,
      full_name: c.full_name ?? c.name,
      email: c.email,
      plan,
      streams: c.streams,
      start_date: c.start_date,
      next_due_date: safeNext,
      notes: getVisibleCustomerNotes(c.notes),
      plex_username: resolvedPlexUsername,
      plex_username_source: plexUsernameSource,
      timezone: parsedNotes.timezone || undefined,
      status: c.status ?? c.subscription_status,
      downloads: parsedNotes.downloads,
      terminate_at_plan_end: parsedNotes.terminateAtPlanEnd,
      termination_scheduled_at: parsedNotes.terminationScheduledAt,
      referral_code: buildReferralCode(String(c.email || '')),
      referral_credit: Number(parsedNotes.referralCredit || 0),
      referred_by: parsedNotes.referredBy || null,
      referral_count: Number(referralCounts.get(String(c.email || '').trim().toLowerCase()) || 0),
      referral_slots_used: Number(referralCounts.get(String(c.email || '').trim().toLowerCase()) || 0),
      referral_slots_max: REFERRAL_LINK_LIMIT,
    }
  })
  return NextResponse.json(mapped)
}

export async function POST(request: Request){
  if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const normalize = (v: any)=>{
    if (v === null || v === undefined) return v
    if (typeof v !== 'string') return v
    const s = v.trim()
    if (s === '') return undefined
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
      const [dd, mm, yyyy] = s.split('/').map(Number)
      const d = new Date(yyyy, mm-1, dd)
      return isNaN(d.getTime()) ? v : d.toISOString()
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s).toISOString()
    return v
  }
  const input: any = { ...body }
  if (input.start_date !== undefined) input.start_date = normalize(input.start_date)
  if (input.next_due_date !== undefined) input.next_due_date = normalize(input.next_due_date)
  const parsed = CustomerCreateSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  const payload = parsed.data
  if (!supabase){
    const list = mem()
    if (list.some(x=> x.email === payload.email)) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
    const id = (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2)
    const item = { id, ...input }
    list.push(item)
    return NextResponse.json(item)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const svc = (url && key) ? createClient(url, key) : null
  const client = (svc || supabase)!
  const { data: existing } = await client.from('customers').select('id').eq('email', payload.email).limit(1)
  if (existing && existing.length) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
  const plex = payload.plex_username?.trim()
  const tz = payload.timezone?.trim()
  const dbPayload = {
    name: payload.full_name,
    email: payload.email,
    subscription_type: payload.plan,
    streams: payload.streams,
    start_date: payload.start_date,
    next_payment_date: payload.next_due_date,
    notes: mergeCustomerNotes({
      existing: '',
      visibleNotes: payload.notes?.trim(),
      plexUsername: plex,
      timezone: tz,
      downloads: Boolean(payload.downloads),
    })
  }
  const { data, error } = await client.from('customers').insert(dbPayload).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data?.[0]
  const mapped = row ? ({
    id: row.id,
    full_name: row.full_name ?? row.name,
    email: row.email,
    plan: (row.plan ?? row.subscription_type),
    streams: row.streams,
    start_date: row.start_date,
    next_due_date: row.next_due_date ?? row.next_payment_date,
    notes: getVisibleCustomerNotes(row.notes),
    plex_username: parseCustomerNotes(row.notes).plexUsername || undefined,
    plex_username_source: parseCustomerNotes(row.notes).plexUsername ? 'saved' : null,
    timezone: parseCustomerNotes(row.notes).timezone || undefined,
    status: row.status ?? row.subscription_status,
    downloads: parseCustomerNotes(row.notes).downloads,
    terminate_at_plan_end: parseCustomerNotes(row.notes).terminateAtPlanEnd,
    termination_scheduled_at: parseCustomerNotes(row.notes).terminationScheduledAt,
    referral_code: buildReferralCode(String(row.email || '')),
    referral_credit: Number(parseCustomerNotes(row.notes).referralCredit || 0),
    referred_by: parseCustomerNotes(row.notes).referredBy || null,
    referral_count: 0,
    referral_slots_used: 0,
    referral_slots_max: REFERRAL_LINK_LIMIT,
  }) : null
  return NextResponse.json(mapped)
}
