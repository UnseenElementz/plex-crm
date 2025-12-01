import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { CustomerCreateSchema, formatZodError } from '@/lib/validation'

function mem(){
  const g = globalThis as any
  if (!g.__customers) {
    g.__customers = []
  }
  return g.__customers as any[]
}

export async function GET(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const svc = (url && key) ? createClient(url, key) : null
  if (!supabase && !svc) return NextResponse.json(mem())
  const client = (svc || supabase)!
  const { data, error } = await client.from('customers').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const mapped = (data || []).map((c: any) => ({
    id: c.id,
    full_name: c.full_name ?? c.name,
    email: c.email,
    plan: ((c.notes || '').includes('Term: 3y')) ? 'three_year' : (c.plan ?? c.subscription_type),
    streams: c.streams,
    start_date: c.start_date,
    next_due_date: c.next_due_date ?? c.next_payment_date,
    notes: c.notes,
    plex_username: (c.notes || '').match(/Plex:\s*(.+)/i)?.[1] || undefined,
    timezone: (c.notes || '').match(/Timezone:\s*(.+)/i)?.[1] || undefined,
    status: c.status ?? c.subscription_status
  }))
  return NextResponse.json(mapped)
}

export async function POST(request: Request){
  const body = await request.json()
  const parsed = CustomerCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  const payload = parsed.data
  if (!supabase){
    const list = mem()
    if (list.some(x=> x.email === payload.email)) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
    const id = (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2)
    const item = { id, ...body }
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
    next_payment_date: payload.plan === 'three_year' ? (payload.next_due_date || new Date(new Date().setFullYear(new Date().getFullYear()+3)).toISOString()) : payload.next_due_date,
    notes: [
      payload.notes?.trim(),
      payload.plan === 'three_year' ? 'Term: 3y' : undefined,
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
    plan: ((row.notes || '').includes('Term: 3y')) ? 'three_year' : (row.plan ?? row.subscription_type),
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
