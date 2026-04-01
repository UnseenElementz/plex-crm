import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getStatus } from '@/lib/pricing'
import { sendCustomEmail } from '@/lib/email'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function ensureActiveCustomer(nextDue: any, subscriptionStatus: any): boolean {
  if (String(subscriptionStatus || '').toLowerCase() === 'inactive') return false
  if (!nextDue) return false
  const statusLabel = getStatus(new Date(nextDue))
  // Accept both 'Active' and 'Due Soon' for access
  return statusLabel === 'Active' || statusLabel === 'Due Soon' || statusLabel === 'Due Today'
}

function anonymizeEmail(email: string) {
  if (!email) return ''
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  return `${user.substring(0, 2)}***@${domain}`
}

export async function GET(req: Request){
  try{
    const s = svc()
    if (!s) return NextResponse.json({ items: [] })

    const { searchParams } = new URL(req.url)
    const filterEmail = searchParams.get('email')
    const status = searchParams.get('status')
    const kind = searchParams.get('kind')
    const sort = searchParams.get('sort') || 'created_at.desc'

    let query = s.from('recommendations').select('*')

    if (filterEmail) {
      query = query.eq('submitter_email', filterEmail)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (kind) {
      query = query.eq('kind', kind)
    }

    const [field, order] = sort.split('.')
    query = query.order(field, { ascending: order === 'asc' })

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Anonymize emails for shared visibility
    const items = (data || []).map(item => ({
      ...item,
      submitter_email: anonymizeEmail(item.submitter_email)
    }))

    return NextResponse.json({ items })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const b = await req.json().catch(()=>({}))
    const kind = String(b?.kind || 'request')
    if (kind !== 'request' && kind !== 'issue') return NextResponse.json({ error: 'invalid kind' }, { status: 400 })

    const url = String(b?.url || '').trim()
    const title = String(b?.title || '').trim()
    const description = String(b?.description || '').trim()
    const image = String(b?.image || '').trim()
    const submitterEmail = String(b?.email || '').trim()
    const token = String(b?.token || '').trim()
    const details = String(b?.details || '').trim()
    const season = String(b?.season || '').trim()
    const episode = String(b?.episode || '').trim()

    if (!url || !title) return NextResponse.json({ error: 'url and title required' }, { status: 400 })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const s = svc()
    if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })

    const { data: authData, error: authErr } = await s.auth.getUser(token)
    const authEmail = authData?.user?.email || ''
    if (authErr || !authEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (submitterEmail && submitterEmail.toLowerCase() !== authEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: cust, error: custErr } = await s
      .from('customers')
      .select('email,name,next_payment_date,subscription_status,notes')
      .eq('email', authEmail)
      .limit(1)
      .maybeSingle()
    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 })
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 403 })
    const nextDue = (cust as any).next_payment_date
    const isActive = ensureActiveCustomer(nextDue, (cust as any).subscription_status)
    if (!isActive) return NextResponse.json({ error: 'Active subscription required' }, { status: 403 })

    const plexUsername = String((cust as any).notes || '').match(/Plex:\s*([^\n]+)/i)?.[1]?.trim() || ''

    const lines: string[] = []
    lines.push(`Type: ${kind === 'issue' ? 'Issue Report' : 'Request'}`)
    lines.push(`Customer: ${(cust as any).name || ''} <${authEmail}>`)
    if (plexUsername) lines.push(`Plex: ${plexUsername}`)
    if (kind === 'issue') {
      if (season) lines.push(`Season: ${season}`)
      if (episode) lines.push(`Episode: ${episode}`)
    }
    if (details) {
      lines.push('')
      lines.push(details)
    }

    const payload: any = {
      id: crypto.randomUUID(),
      url,
      title: title, // Store clean title
      description: [description, '', ...lines].filter(Boolean).join('\n'),
      image,
      submitter_email: authEmail,
      created_at: new Date().toISOString()
    }
    
    // Check if columns exist before adding them to avoid errors
    try {
      const { data: cols } = await s.rpc('get_column_names', { tname: 'recommendations' })
      if (cols && Array.isArray(cols)) {
        if (cols.includes('kind')) payload.kind = kind
        if (cols.includes('status')) payload.status = 'pending'
      } else {
        // Fallback for when RPC doesn't exist: try to detect via a simple query
        const { error: colErr } = await s.from('recommendations').select('kind').limit(0)
        if (!colErr) {
          payload.kind = kind
          payload.status = 'pending'
        }
      }
    } catch {
      // If check fails, we proceed without those columns (old schema)
    }

    const { data, error } = await s.from('recommendations').insert([payload]).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let settings: any = null
    try{
      const { data: sRow } = await s.from('admin_settings').select('*').single()
      settings = sRow || null
    }catch{}
    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass){
      return NextResponse.json({ ok: true, item: data, warned: 'SMTP not configured' })
    }

    const originalEnv = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_FROM: process.env.SMTP_FROM
    }
    process.env.SMTP_HOST = settings.smtp_host
    process.env.SMTP_PORT = settings.smtp_port || '587'
    process.env.SMTP_USER = settings.smtp_user
    process.env.SMTP_PASS = String(settings.smtp_pass || '').replace(/\s+/g, '')
    process.env.SMTP_FROM = settings.smtp_from || settings.smtp_user

    const notifyTo = settings.smtp_from || settings.smtp_user
    const subj = kind === 'issue'
      ? `New Media Issue Report: ${title}`
      : `New Request: ${title}`
    const text = `${subj}\n\nLink: ${url}\n\n${lines.join('\n')}\n`
    try{
      await sendCustomEmail([notifyTo], subj, text)
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }

    return NextResponse.json({ ok: true, item: data })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
