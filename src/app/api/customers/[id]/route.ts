import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { CustomerUpdateSchema, formatZodError } from '@/lib/validation'

function mem(){
  const g = globalThis as any
  if (!g.__customers) g.__customers = []
  return g.__customers as any[]
}

export async function GET(_: Request, { params }: { params: { id: string } }){
  if (!supabase){
    const item = mem().find(c=>c.id===params.id)
    return NextResponse.json(item || null)
  }
  const { data, error } = await supabase.from('customers').select('*').eq('id', params.id).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data?.[0]
  const mapped = row ? (()=>{
    const plan = ((row.notes || '').includes('Term: 3y')) ? 'three_year' : (row.plan ?? row.subscription_type)
    const rawNext = row.next_due_date ?? row.next_payment_date
    const d = rawNext ? new Date(rawNext) : null
    const year = d ? d.getFullYear() : 0
    const safeNext = (!d || isNaN(d.getTime()) || year < 2000 || year > 2100) ? new Date().toISOString() : rawNext
    return {
      id: row.id,
      full_name: row.full_name ?? row.name,
      email: row.email,
      plan,
      streams: row.streams,
      start_date: row.start_date,
      next_due_date: safeNext,
      notes: row.notes,
      plex_username: (row.notes || '').match(/Plex:\s*(.+)/i)?.[1] || undefined,
      timezone: (row.notes || '').match(/Timezone:\s*(.+)/i)?.[1] || undefined,
      status: row.status ?? row.subscription_status
    }
  })() : null
  return NextResponse.json(mapped)
}

export async function PATCH(request: Request, { params }: { params: { id: string } }){
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
  const input = { ...body, id: params.id }
  if (input.start_date !== undefined) input.start_date = normalize(input.start_date)
  if (input.next_due_date !== undefined) input.next_due_date = normalize(input.next_due_date)
  const parsed = CustomerUpdateSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  const payload = parsed.data
  if (!supabase){
    const list = mem()
    const idx = list.findIndex(c=>c.id===params.id)
    if (idx>=0){
      if (payload.email && list.some((x,i)=> i!==idx && x.email===payload.email)) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
      list[idx] = { ...list[idx], ...payload }
    }
    return NextResponse.json(list[idx] || null)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const svc = (url && key) ? createClient(url, key) : null
  const client = svc ?? supabase
  if (payload.email){
    if (!client){
      const list = mem()
      const dup = list.some(c=> c.id !== params.id && c.email === payload.email)
      if (dup) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
    } else {
      const { data: existing } = await client.from('customers').select('id').eq('email', payload.email).neq('id', params.id).limit(1)
      if (existing && existing.length) return NextResponse.json({ error: 'Duplicate email' }, { status: 409 })
    }
  }
  const dbPayload: any = {}
  if (payload.full_name !== undefined) dbPayload.name = payload.full_name
  if (payload.email !== undefined) dbPayload.email = payload.email
  if (payload.plan !== undefined) dbPayload.subscription_type = payload.plan
  if (payload.plan === 'three_year') dbPayload.subscription_type = 'yearly'
  if (payload.streams !== undefined) dbPayload.streams = payload.streams
  if (payload.start_date !== undefined) dbPayload.start_date = payload.start_date
  if (payload.next_due_date !== undefined) dbPayload.next_payment_date = payload.next_due_date
  if (payload.subscription_status !== undefined) dbPayload.subscription_status = payload.subscription_status
  if (payload.notes !== undefined || payload.plex_username !== undefined || payload.timezone !== undefined) {
    const notes = (payload.notes ?? '').trim()
    const plex = payload.plex_username?.trim()
    const tz = payload.timezone?.trim()
    const term = payload.plan === 'three_year' ? 'Term: 3y' : undefined
    const combined = [notes || undefined, term, plex ? `Plex: ${plex}` : undefined, tz ? `Timezone: ${tz}` : undefined].filter(Boolean).join('\n')
    dbPayload.notes = combined
  }
  if (!client){
    const list = mem()
    const idx = list.findIndex(c=>c.id===params.id)
    if (idx>=0) list[idx] = { ...list[idx], ...dbPayload }
    return NextResponse.json(list[idx] || null)
  }
  const { data, error } = await client.from('customers').update(dbPayload).eq('id', params.id).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data?.[0]
  const mapped = row ? ({
    id: row.id,
    full_name: row.full_name ?? row.name,
    email: row.email,
    plan: row.plan ?? row.subscription_type,
    streams: row.streams,
    start_date: row.start_date,
    next_due_date: row.next_due_date ?? row.next_payment_date,
    notes: row.notes,
    plex_username: (row.notes || '').match(/Plex:\s*(.+)/i)?.[1] || undefined,
    status: row.status ?? row.subscription_status
  }) : null
  return NextResponse.json(mapped)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const svc = (url && key) ? createClient(url, key) : null
  const client = svc ?? supabase
  if (!client){
    const list = mem()
    const idx = list.findIndex(c=>c.id===params.id)
    if (idx>=0) list.splice(idx,1)
    return NextResponse.json({ ok: true })
  }
  const { error } = await client.from('customers').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
