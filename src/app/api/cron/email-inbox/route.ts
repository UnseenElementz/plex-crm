import { NextResponse } from 'next/server'
import { fetchManagedInboxMessages, sendInboxAutoReplies, svc } from '@/lib/adminInboxRuntime'

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const { settings, config, messages } = await fetchManagedInboxMessages({
      supabase,
      limit: 60,
      serviceOnly: true,
      unreadOnly: true,
    })

    const result = await sendInboxAutoReplies({
      supabase,
      settings,
      messages,
      mailboxUser: String(config.user || '').trim().toLowerCase(),
    })

    return NextResponse.json({
      ok: true,
      inboxCount: messages.length,
      autoRepliesSent: result.sent,
      mailbox: config.mailbox,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cron inbox sync failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
