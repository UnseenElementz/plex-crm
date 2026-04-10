import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { fetchManagedInboxMessages, parseBool, sendInboxAutoReplies, svc } from '@/lib/adminInboxRuntime'

export async function GET(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    const url = new URL(request.url)
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40)))
    const serviceOnly = parseBool(url.searchParams.get('serviceOnly'), true)
    const unreadOnly = parseBool(url.searchParams.get('unreadOnly'), true)

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    let settings: any = null
    try {
      const { data } = await supabase.from('admin_settings').select('*').single()
      settings = data || null
    } catch {}
    if (!settings) {
      const raw = cookies().get('admin_settings')?.value
      settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    }

    const { config, messages } = await fetchManagedInboxMessages({
      supabase,
      settings,
      limit,
      serviceOnly,
      unreadOnly,
    })
    await sendInboxAutoReplies({
      supabase,
      settings,
      messages,
      mailboxUser: String(config.user || '').trim().toLowerCase(),
    })
    return NextResponse.json({ messages, count: messages.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load inbox' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
