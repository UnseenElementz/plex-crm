import { NextResponse } from 'next/server'
import { createServiceClient, getRequester } from '@/lib/serverSupabase'
import { getStatus } from '@/lib/pricing'

const SYSTEM_SERVICE_UPDATE_PREFIX = '__SYSTEM__:'

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export async function GET(request: Request) {
  try {
    const requester = await getRequester(request)
    if (!requester.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceClient()
    if (!service) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const email = requester.email
    const [customerRes, settingsRes, updatesRes, conversationsRes] = await Promise.all([
      service
        .from('customers')
        .select('name,email,subscription_status,next_payment_date,subscription_type')
        .eq('email', email)
        .maybeSingle(),
      service.from('admin_settings').select('chat_availability,chat_online').eq('id', 1).maybeSingle(),
      service.from('service_updates').select('id,title,created_at').order('created_at', { ascending: false }).limit(5),
      service.from('conversations').select('id,status,updated_at,metadata').order('updated_at', { ascending: false }).limit(120),
    ])

    const matchedConversations = (conversationsRes.data || []).filter((row: any) => {
      const metadataEmail = normalizeEmail((row as any)?.metadata?.email)
      return metadataEmail === email
    })

    const conversationIds = matchedConversations.map((row: any) => String(row.id || '')).filter(Boolean)
    const messagesRes = conversationIds.length
      ? await service
          .from('messages')
          .select('id,conversation_id,content,timestamp,sender_type')
          .in('conversation_id', conversationIds)
          .eq('sender_type', 'admin')
          .order('timestamp', { ascending: false })
          .limit(12)
      : { data: [], error: null as any }

    const customer = customerRes.data
    const nextDue = String((customer as any)?.next_payment_date || '').trim()
    let accountStatus = 'Inactive'
    if (customer) {
      accountStatus =
        String((customer as any)?.subscription_status || '').trim().toLowerCase() === 'inactive'
          ? 'Inactive'
          : nextDue
            ? getStatus(new Date(nextDue))
            : 'Active'
    }

    const availability = String(
      (settingsRes.data as any)?.chat_availability ??
        ((settingsRes.data as any)?.chat_online === false ? 'off' : 'active')
    ).trim()

    return NextResponse.json({
      role: 'customer',
      account: {
        name: String((customer as any)?.name || '').trim(),
        email,
        status: accountStatus,
        nextDueDate: nextDue || null,
        plan: String((customer as any)?.subscription_type || '').trim() || null,
      },
      support: {
        availability: availability || 'active',
      },
      chatMessages: (messagesRes.data || []).map((row: any) => ({
        id: String(row.id || ''),
        conversationId: String(row.conversation_id || ''),
        content: String(row.content || '').trim(),
        timestamp: row.timestamp || null,
      })),
      serviceUpdates: (updatesRes.data || [])
        .filter((row: any) => !String(row?.title || '').startsWith(SYSTEM_SERVICE_UPDATE_PREFIX))
        .map((row: any) => ({
          id: String(row.id || ''),
          title: String(row.title || '').trim(),
          createdAt: row.created_at || null,
        })),
      fetchedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load live pulse' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
