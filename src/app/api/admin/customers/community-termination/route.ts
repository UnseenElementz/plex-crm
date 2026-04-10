import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { addAuditLog, syncCustomerDownloads } from '@/lib/moderation'
import { mergeCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { sendPlainTextEmail, serviceTerminatedTemplate, terminationDateSoonTemplate } from '@/lib/email'
import { removePlexSharesByEmail } from '@/lib/plex'

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

function getFirstName(name: unknown, email: unknown) {
  const fullName = String(name || '').trim()
  if (fullName) return fullName.split(/\s+/)[0] || fullName
  const normalizedEmail = normalizeEmail(email)
  return normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : 'there'
}

function formatPlanEndDate(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return 'your current plan end date'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const customerId = String(body?.customerId || '').trim()
    const mode = String(body?.mode || '').trim().toLowerCase()
    const enabled = body?.enabled !== false

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    if (!['plan_end', 'instant'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be plan_end or instant' }, { status: 400 })
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id,name,email,notes,next_payment_date,subscription_status')
      .eq('id', customerId)
      .maybeSingle()

    if (error || !customer?.id) {
      return NextResponse.json({ error: error?.message || 'Customer not found' }, { status: 404 })
    }

    const email = normalizeEmail(customer.email)
    const currentNotes = String(customer.notes || '')
    const parsedNotes = parseCustomerNotes(currentNotes)
    const firstName = getFirstName(customer.name, email)

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('plex_token,smtp_host,smtp_port,smtp_user,smtp_pass,smtp_from,company_name')
      .eq('id', 1)
      .maybeSingle()

    const companyName = String(settings?.company_name || 'Streamz R Us').trim() || 'Streamz R Us'
    const smtpConfig =
      settings?.smtp_host && settings?.smtp_user && settings?.smtp_pass
        ? {
            host: String(settings.smtp_host || '').trim(),
            port: settings.smtp_port || '587',
            user: String(settings.smtp_user || '').trim(),
            pass: String(settings.smtp_pass || '').trim(),
            from: String(settings.smtp_from || settings.smtp_user || '').trim(),
          }
        : null

    if (mode === 'plan_end') {
      const nextNotes = mergeCustomerNotes({
        existing: currentNotes,
        terminateAtPlanEnd: enabled,
        terminationScheduledAt: enabled ? new Date().toISOString() : null,
      })

      const { error: updateError } = await supabase
        .from('customers')
        .update({ notes: nextNotes })
        .eq('id', customer.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      await addAuditLog({
        action: enabled ? 'community_plan_end_termination_scheduled' : 'community_plan_end_termination_cancelled',
        email,
        details: {
          customer_id: customer.id,
          customer_name: customer.name || email,
          next_payment_date: customer.next_payment_date || null,
        },
      })

      let emailNotice = { attempted: false, sent: false, error: '' }
      if (enabled && email && smtpConfig) {
        emailNotice.attempted = true
        try {
          const { subject, body } = terminationDateSoonTemplate({
            firstName,
            planEndDate: formatPlanEndDate(customer.next_payment_date),
            companyName,
          })
          await sendPlainTextEmail(email, subject, body, smtpConfig)
          emailNotice.sent = true
        } catch (sendError: any) {
          emailNotice.error = sendError?.message || 'Failed to send termination notice'
        }
      }

      return NextResponse.json({
        ok: true,
        mode,
        enabled,
        customerId: customer.id,
        email,
        terminateAtPlanEnd: enabled,
        terminationScheduledAt: enabled ? new Date().toISOString() : null,
        emailNotice,
      })
    }

    let plexToken = ''
    plexToken = String(settings?.plex_token || '').trim()

    const nextNotes = mergeCustomerNotes({
      existing: currentNotes,
      terminateAtPlanEnd: false,
      terminationScheduledAt: null,
      downloads: false,
    })

    const { error: updateError } = await supabase
      .from('customers')
      .update({
        subscription_status: 'inactive',
        notes: nextNotes,
      })
      .eq('id', customer.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await syncCustomerDownloads(email, false)

    let accessRemoval = {
      removed: [] as Array<{ server_machine_id: string; share_id: string }>,
      failures: [] as Array<{ server_machine_id: string; share_id?: string; status?: number; error: string }>,
      skippedReason: '' as string,
    }

    if (!email) {
      accessRemoval.skippedReason = 'No customer email found.'
    } else if (!plexToken) {
      accessRemoval.skippedReason = 'Plex token is not configured.'
    } else {
      const result = await removePlexSharesByEmail(plexToken, email)
      accessRemoval = {
        removed: result.removed,
        failures: result.failures,
        skippedReason: '',
      }
    }

    await addAuditLog({
      action: 'community_instant_terminated',
      email,
      details: {
        customer_id: customer.id,
        customer_name: customer.name || email,
        previous_status: customer.subscription_status || null,
        previous_terminate_at_plan_end: parsedNotes.terminateAtPlanEnd,
        removed_share_count: accessRemoval.removed.length,
        share_removal_failures: accessRemoval.failures.length,
        share_removal_skipped: accessRemoval.skippedReason || null,
      },
    })

    let emailNotice = { attempted: false, sent: false, error: '' }
    if (email && smtpConfig) {
      emailNotice.attempted = true
      try {
        const { subject, body } = serviceTerminatedTemplate({
          firstName,
          companyName,
        })
        await sendPlainTextEmail(email, subject, body, smtpConfig)
        emailNotice.sent = true
      } catch (sendError: any) {
        emailNotice.error = sendError?.message || 'Failed to send termination email'
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      customerId: customer.id,
      email,
      status: 'inactive',
      accessRemoval,
      emailNotice,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update customer termination state' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
