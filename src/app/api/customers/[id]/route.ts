import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { CustomerUpdateSchema, formatZodError } from '@/lib/validation'
import { cookies } from 'next/headers'

function mem(){
  const g = globalThis as any
  if (!g.__customers) g.__customers = []
  return g.__customers as any[]
}

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !anon) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function getRequester(request: Request) {
  if (cookies().get('admin_session')?.value === '1') {
    return { isAdmin: true, email: null as string | null }
  }

  const authHeader = String(request.headers.get('authorization') || '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return { isAdmin: false, email: null as string | null }

  const authClient = createAuthClient()
  if (!authClient) return { isAdmin: false, email: null as string | null }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user?.email) return { isAdmin: false, email: null as string | null }
  return { isAdmin: false, email: String(data.user.email).trim().toLowerCase() }
}

export async function GET(request: Request, { params }: { params: { id: string } }){
  const requester = await getRequester(request)
  if (!requester.isAdmin && !requester.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!supabase){
    const item = mem().find(c=>c.id===params.id)
    if (!requester.isAdmin && String(item?.email || '').trim().toLowerCase() !== requester.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(item || null)
  }
  const { data, error } = await supabase.from('customers').select('*').eq('id', params.id).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data?.[0]
  if (!requester.isAdmin && String(row?.email || '').trim().toLowerCase() !== requester.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const mapped = row ? (()=>{
    const plan = (row.plan ?? row.subscription_type)
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
      status: row.status ?? row.subscription_status,
      downloads: (row.notes || '').includes('Downloads: Yes')
    }
  })() : null
  return NextResponse.json(mapped)
}

export async function PATCH(request: Request, { params }: { params: { id: string } }){
  const requester = await getRequester(request)
  if (!requester.isAdmin && !requester.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
  if (!requester.isAdmin) {
    const restrictedKeys = ['email', 'plan', 'streams', 'start_date', 'next_due_date', 'subscription_status', 'plex_username', 'timezone', 'downloads']
    const attemptedRestricted = restrictedKeys.some((key) => Object.prototype.hasOwnProperty.call(body || {}, key))
    if (attemptedRestricted) {
      return NextResponse.json({ error: 'Only profile notes and full name can be updated here.' }, { status: 403 })
    }
  }
  if (!supabase){
    const list = mem()
    const idx = list.findIndex(c=>c.id===params.id)
    if (!requester.isAdmin && String(list[idx]?.email || '').trim().toLowerCase() !== requester.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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
  if (client && !requester.isAdmin) {
    const { data: ownerRow } = await client.from('customers').select('email').eq('id', params.id).single()
    if (String(ownerRow?.email || '').trim().toLowerCase() !== requester.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
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
  if (payload.streams !== undefined) dbPayload.streams = payload.streams
  if (payload.start_date !== undefined) dbPayload.start_date = payload.start_date
  if (payload.next_due_date !== undefined) dbPayload.next_payment_date = payload.next_due_date
  if (payload.subscription_status !== undefined) dbPayload.subscription_status = payload.subscription_status
  if (payload.notes !== undefined || payload.plex_username !== undefined || payload.timezone !== undefined) {
    // We need existing data to preserve fields not present in payload
    // If client provided ALL fields, we don't strictly need to fetch, but it's safer to fetch if we are partial updating.
    // However, for simplicity, if any of these are missing, we should probably fetch.
    
    let currentNotes = ''
    let currentPlex = ''
    let currentTimezone = ''
    let currentDownloads = false
    
    // Fetch existing if we are missing any component or if we just want to be safe
    // We already check for duplicates with email, but let's fetch current row if not already fetched
    if (client) {
      const { data: current } = await client.from('customers').select('notes, plan, subscription_type').eq('id', params.id).single()
      if (current) {
        currentNotes = current.notes || ''
        // Extract existing values
        const plexM = currentNotes.match(/Plex:\s*([^\n]+)/i)
        if (plexM) currentPlex = plexM[1].trim()
        
        const tzM = currentNotes.match(/Timezone:\s*([^\n]+)/i)
        if (tzM) currentTimezone = tzM[1].trim()
        
        const dlM = currentNotes.includes('Downloads: Yes')
        currentDownloads = dlM
        
        // Remove the virtual fields from the "base" notes to get the user's actual notes
        // This is a bit hacky because we store everything in one string. 
        // We should strip the system lines to get the "user notes".
        currentNotes = currentNotes
          .replace(/Plex:\s*[^\n]+\n?/gi, '')
          .replace(/Timezone:\s*[^\n]+\n?/gi, '')
          .replace(/Downloads: Yes\n?/gi, '')
          .trim()
      }
    }

    const notes = payload.notes !== undefined ? (payload.notes ?? '').trim() : currentNotes
    const plex = payload.plex_username !== undefined ? payload.plex_username?.trim() : currentPlex
    const tz = payload.timezone !== undefined ? payload.timezone?.trim() : currentTimezone

    const downloads = payload.downloads !== undefined ? payload.downloads : currentDownloads

    const combined = [
      notes || undefined, 
      plex ? `Plex: ${plex}` : undefined, 
      tz ? `Timezone: ${tz}` : undefined,
      downloads ? 'Downloads: Yes' : undefined
    ].filter(Boolean).join('\n')
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
  if (cookies().get('admin_session')?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
