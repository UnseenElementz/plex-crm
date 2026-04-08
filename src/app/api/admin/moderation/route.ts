import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sendPlainTextEmail, overStreamingWarningTemplate, serviceBanTemplate } from '@/lib/email'
import { terminatePlexSessions } from '@/lib/plex'
import {
  addAuditLog,
  countWarnings,
  findCustomerByIdentity,
  isCustomerBanned,
  setCustomerBannedInNotes,
} from '@/lib/moderation'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function ordinal(n: number) {
  if (n === 1) return 'first'
  if (n === 2) return 'second'
  if (n === 3) return 'third'
  return `${n}th`
}

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body.action || '').trim().toLowerCase()
    const sessionKeys = Array.isArray(body.sessionKeys) ? body.sessionKeys.map((value: unknown) => String(value || '').trim()).filter(Boolean) : []
    const ip = String(body.ip || '').trim()
    const user = String(body.user || '').trim()
    const customerEmailHint = String(body.customerEmail || '').trim().toLowerCase()

    const { data: settings } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    const plexToken = String(settings?.plex_token || '').trim()
    const plexUrl = String(settings?.plex_server_url || 'https://plex.tv').trim() || 'https://plex.tv'
    const companyName = String(settings?.company_name || 'STREAMZ R US').trim() || 'STREAMZ R US'
    const smtpConfig = {
      host: String(settings?.smtp_host || '').trim(),
      port: settings?.smtp_port || '587',
      user: String(settings?.smtp_user || '').trim(),
      pass: String(settings?.smtp_pass || '').trim(),
      from: String(settings?.smtp_from || settings?.smtp_user || '').trim(),
    }

    const customer = await findCustomerByIdentity({
      customerEmail: customerEmailHint,
      email: customerEmailHint,
      user,
    })

    if (!customer?.email) {
      return NextResponse.json({ error: 'Customer email could not be matched for this session.' }, { status: 400 })
    }

    if (action === 'warn') {
      const warningNumber = (await countWarnings(customer.email)) + 1
      const stopReason = `Streaming stopped. This is your ${ordinal(Math.min(warningNumber, 3))} warning for exceeding your package limits.`

      const stopResult =
        plexToken && sessionKeys.length
          ? await terminatePlexSessions(plexUrl, plexToken, sessionKeys, stopReason)
          : { stopped: 0, failed: [] as string[] }

      const emailTemplate = overStreamingWarningTemplate({
        warningNumber,
        maxWarnings: 3,
        companyName,
      })

      if (smtpConfig.host && smtpConfig.user && smtpConfig.pass) {
        await sendPlainTextEmail(customer.email, emailTemplate.subject, emailTemplate.body, smtpConfig)
      }

      await addAuditLog({
        action: 'customer_warning',
        email: customer.email,
        share_id: sessionKeys[0] || null,
        details: {
          ip,
          user,
          session_keys: sessionKeys,
          warning_number: warningNumber,
          warning_label: `${Math.min(warningNumber, 3)}/3`,
          stopped_streams: stopResult.stopped,
        },
      })

      return NextResponse.json({
        ok: true,
        warning_number: warningNumber,
        warning_label: `${Math.min(warningNumber, 3)}/3`,
        stopped_streams: stopResult.stopped,
      })
    }

    if (action === 'ban') {
      const stopReason = 'Playback has been stopped due to repeated breaches of the service rules.'
      const stopResult =
        plexToken && sessionKeys.length
          ? await terminatePlexSessions(plexUrl, plexToken, sessionKeys, stopReason)
          : { stopped: 0, failed: [] as string[] }

      const currentWarnings = await countWarnings(customer.email)
      const alreadyBanned = await isCustomerBanned(customer.email)

      await supabase
        .from('customers')
        .update({
          notes: setCustomerBannedInNotes(customer.notes, true),
          subscription_status: 'inactive',
        })
        .eq('id', customer.id)

      if (ip) {
        await addAuditLog({
          action: 'ip_block',
          email: customer.email,
          details: { ip, reason: 'Terms of service breach' },
        })
      }

      if (!alreadyBanned) {
        await addAuditLog({
          action: 'customer_ban',
          email: customer.email,
          share_id: sessionKeys[0] || null,
          details: {
            ip,
            user,
            session_keys: sessionKeys,
            stopped_streams: stopResult.stopped,
            warning_count: currentWarnings,
            reason: 'Repeated breaches of the service rules',
          },
        })
      }

      const emailTemplate = serviceBanTemplate({
        appealEmail: 'streamzrus1@gmail.com',
        companyName,
      })

      if (smtpConfig.host && smtpConfig.user && smtpConfig.pass) {
        await sendPlainTextEmail(customer.email, emailTemplate.subject, emailTemplate.body, smtpConfig)
      }

      return NextResponse.json({
        ok: true,
        banned: true,
        email: customer.email,
        stopped_streams: stopResult.stopped,
      })
    }

    if (action === 'unban') {
      const due = customer.next_payment_date ? new Date(customer.next_payment_date) : null
      const nextStatus = due && !Number.isNaN(due.getTime()) && due > new Date() ? 'active' : 'inactive'

      await supabase
        .from('customers')
        .update({
          notes: setCustomerBannedInNotes(customer.notes, false),
          subscription_status: nextStatus,
        })
        .eq('id', customer.id)

      await addAuditLog({
        action: 'customer_unban',
        email: customer.email,
        details: {
          ip,
          user,
        },
      })

      return NextResponse.json({ ok: true, email: customer.email, banned: false })
    }

    return NextResponse.json({ error: 'Unsupported moderation action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to process moderation action' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
