import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  EmailAttachment,
  getSmtpConfigFromEnv,
  getSmtpConfigFromSettings,
  isLikelySmtpAuthError,
  renderTemplate,
  sendCustomEmail,
  smtpConfigsMatch,
} from '@/lib/email'

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
    const contentType = request.headers.get('content-type') || ''
    let subject = ''
    let message = ''
    let mode = 'list'
    let list: string[] = []
    let attachments: EmailAttachment[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      subject = String(form.get('subject') || '').trim()
      message = String(form.get('body') || '').trim()
      mode = String(form.get('mode') || 'list')
      list = form.getAll('recipients').map((entry) => String(entry || '').trim()).filter(Boolean)

      const files = form.getAll('attachments')
      const MAX_ATTACHMENTS = 3
      const MAX_SIZE = 4 * 1024 * 1024
      if (files.length > MAX_ATTACHMENTS) {
        return NextResponse.json({ error: `Max ${MAX_ATTACHMENTS} attachments allowed.` }, { status: 400 })
      }

      for (const [index, file] of files.entries()) {
        if (!(file instanceof File)) continue
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Only image attachments are supported.' }, { status: 400 })
        }
        if (file.size > MAX_SIZE) {
          return NextResponse.json({ error: 'Image attachment is too large (max 4MB).' }, { status: 400 })
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        attachments.push({
          filename: file.name || `attachment-${index + 1}.png`,
          content: buffer,
          contentType: file.type || 'image/png',
        })
      }
    } else {
      const body = await request.json().catch(()=>({}))
      subject = String(body?.subject || '').trim()
      message = String(body?.body || '').trim()
      mode = String(body?.mode || 'list')
      list = Array.isArray(body?.recipients) ? body.recipients.filter((x: any)=> typeof x === 'string') : []
    }
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
    const dbConfig = getSmtpConfigFromSettings(settings)
    const envConfig = getSmtpConfigFromEnv()
    const fallbackConfig = envConfig && (!dbConfig || !smtpConfigsMatch(dbConfig, envConfig)) ? envConfig : null
    if (!dbConfig && !envConfig){
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }
    const subjectFor = (recipient: string) => {
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
    }
    const bodyFor = (recipient: string) => {
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

    let usedFallback = false
    let result = await sendCustomEmail(emails, subjectFor, bodyFor, attachments, dbConfig || envConfig || undefined)
    const firstError = result.failures[0]?.error || ''

    if (result.sent === 0 && dbConfig && fallbackConfig && isLikelySmtpAuthError(firstError)) {
      const fallbackResult = await sendCustomEmail(emails, subjectFor, bodyFor, attachments, fallbackConfig)
      if (fallbackResult.sent > 0) {
        result = fallbackResult
        usedFallback = true
        try {
          await supabase?.from('admin_settings').update({
            smtp_host: fallbackConfig.host,
            smtp_port: String(fallbackConfig.port || 465),
            smtp_user: fallbackConfig.user,
            smtp_pass: fallbackConfig.pass,
            smtp_from: fallbackConfig.from || fallbackConfig.user,
          }).eq('id', 1)
        } catch {}
      }
    } else if (!dbConfig && envConfig) {
      usedFallback = true
      try {
        await supabase?.from('admin_settings').update({
          smtp_host: envConfig.host,
          smtp_port: String(envConfig.port || 465),
          smtp_user: envConfig.user,
          smtp_pass: envConfig.pass,
          smtp_from: envConfig.from || envConfig.user,
        }).eq('id', 1)
      } catch {}
    }

    if (result.sent === 0) {
      return NextResponse.json({ error: firstError || 'Mass email send failed.', count: 0, failed: result.failed }, { status: 500 })
    }
    const warnings = [
      result.failed ? `${result.failed} recipient${result.failed === 1 ? '' : 's'} failed.` : '',
      usedFallback ? 'SMTP settings were refreshed from secure server configuration.' : '',
    ].filter(Boolean).join(' ')
    return NextResponse.json(
      {
        ok: true,
        count: result.sent,
        failed: result.failed,
        warning: warnings,
      },
      { status: result.failed ? 207 : 200 }
    )
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}

