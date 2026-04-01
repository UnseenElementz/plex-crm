import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { renderTemplate, sendCustomEmail } from '@/lib/email'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function getFirstName(fullName?: string, email?: string, plexUsername?: string) {
  const fromName = String(fullName || '').trim()
  if (fromName) return fromName.split(/\s+/)[0] || fromName
  const fromPlex = String(plexUsername || '').trim()
  if (fromPlex) return fromPlex.split(/\s+/)[0] || fromPlex
  const fromEmail = String(email || '').trim()
  if (fromEmail.includes('@')) return fromEmail.split('@')[0]
  return fromEmail
}

export async function POST(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(()=>({}))
    const subject = String(body?.subject || '').trim()
    const message = String(body?.body || '').trim()
    const mode = String(body?.mode || 'list')
    const list = Array.isArray(body?.recipients) ? body.recipients.filter((x: any)=> typeof x === 'string') : []
    if (!subject || !message) return NextResponse.json({ error: 'subject and body required' }, { status: 400 })

    const supabase = svc()
    let emails: string[] = []
    if (mode === 'all'){
      if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
      const { data, error } = await supabase.from('customers').select('email')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      emails = (data || []).map((r: any)=> r.email).filter(Boolean)
    } else {
      emails = list
    }
    emails = Array.from(new Set(emails)).filter(Boolean)
    if (!emails.length) return NextResponse.json({ error: 'no recipients' }, { status: 400 })

    let customersByEmail = new Map<string, any>()
    try {
      const supabase = svc()
      if (supabase) {
        const { data } = await supabase
          .from('customers')
          .select('email, full_name, name, notes, streams, plan, subscription_type, next_due_date, next_payment_date')
          .in('email', emails)
        for (const row of (data || []) as any[]) {
          const email = String(row?.email || '').trim().toLowerCase()
          if (!email) continue
          customersByEmail.set(email, row)
        }
      }
    } catch {}

    let settings: any = null
    try{
      const s = svc()
      if (s){
        const { data } = await s.from('admin_settings').select('*').single()
        settings = data || null
      }
    } catch {}
    if (!settings){
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    }
    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass){
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
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
    try{
      await sendCustomEmail(
        emails,
        (recipient) => {
          const key = String(recipient || '').trim().toLowerCase()
          const c = customersByEmail.get(key)
          const fullName = c?.full_name ?? c?.name ?? ''
          const notes = String(c?.notes || '')
          const plexUsername = notes.match(/Plex:\s*(.+)/i)?.[1]?.trim() || ''
          const firstName = getFirstName(fullName, recipient, plexUsername)
          const vars: Record<string, unknown> = {
            first_name: firstName,
            full_name: String(fullName || '').trim(),
            email: recipient,
            plex_username: plexUsername,
            username: plexUsername || firstName,
            plan: (c?.plan ?? c?.subscription_type ?? ''),
            streams: (c?.streams ?? ''),
            next_due_date: (c?.next_due_date ?? c?.next_payment_date ?? '')
          }
          return renderTemplate(subject, vars)
        },
        (recipient) => {
          const key = String(recipient || '').trim().toLowerCase()
          const c = customersByEmail.get(key)
          const fullName = c?.full_name ?? c?.name ?? ''
          const notes = String(c?.notes || '')
          const plexUsername = notes.match(/Plex:\s*(.+)/i)?.[1]?.trim() || ''
          const firstName = getFirstName(fullName, recipient, plexUsername)
          const vars: Record<string, unknown> = {
            first_name: firstName,
            full_name: String(fullName || '').trim(),
            email: recipient,
            plex_username: plexUsername,
            username: plexUsername || firstName,
            plan: (c?.plan ?? c?.subscription_type ?? ''),
            streams: (c?.streams ?? ''),
            next_due_date: (c?.next_due_date ?? c?.next_payment_date ?? '')
          }
          return renderTemplate(message, vars)
        }
      )
      return NextResponse.json({ ok: true, count: emails.length })
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}

