import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { CustomerCreateSchema, formatZodError } from '@/lib/validation'
import { calculateNextDue } from '@/lib/pricing'

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
  const mapped = (data || []).map((c: any) => {
    const plan: any = ((c.notes || '').includes('Term: 3y')) ? 'three_year' : (c.plan ?? c.subscription_type)
    const rawNext = c.next_due_date ?? c.next_payment_date
    const d = rawNext ? new Date(rawNext) : null
    const year = d ? d.getFullYear() : 0
    const start = c.start_date ? new Date(c.start_date) : new Date()
    const safeNext = plan
      ? ((!d || isNaN(d.getTime()) || year < 2000 || year > 2100) ? calculateNextDue(plan, start).toISOString() : rawNext)
      : (rawNext || null)
    return {
      id: c.id,
      full_name: c.full_name ?? c.name,
      email: c.email,
      plan,
      streams: c.streams,
      start_date: c.start_date,
      next_due_date: safeNext,
      notes: c.notes,
      plex_username: (c.notes || '').match(/Plex:\s*(.+)/i)?.[1] || undefined,
      timezone: (c.notes || '').match(/Timezone:\s*(.+)/i)?.[1] || undefined,
      status: c.status ?? c.subscription_status,
      downloads: (c.notes || '').includes('Downloads: Yes')
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
    subscription_type: payload.plan === 'three_year' ? 'yearly' : payload.plan,
    streams: payload.streams,
    start_date: payload.start_date,
    next_payment_date: payload.next_due_date,
    notes: [
      payload.notes?.trim(),
      plex ? `Plex: ${plex}` : undefined,
      tz ? `Timezone: ${tz}` : undefined
    ].filter(Boolean).join('\n')
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
    notes: row.notes,
    plex_username: (row.notes || '').match(/Plex:\s*(.+)/i)?.[1] || undefined,
    timezone: (row.notes || '').match(/Timezone:\s*(.+)/i)?.[1] || undefined,
    status: row.status ?? row.subscription_status
  }) : null
  return NextResponse.json(mapped)
}
