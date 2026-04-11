import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sendCustomEmail } from '@/lib/email'
import { createServiceClient } from '@/lib/serverSupabase'

function normalizeUiStatus(status: string) {
  const clean = String(status || '').trim().toLowerCase()
  if (clean === 'completed') return 'done'
  if (clean === 'in-progress') return 'in-progress'
  if (clean === 'done') return 'done'
  return 'pending'
}

function normalizeStoredStatus(status: string) {
  const clean = String(status || '').trim().toLowerCase()
  if (clean === 'completed') return 'done'
  if (clean === 'done') return 'done'
  if (clean === 'in-progress') return 'in-progress'
  return 'pending'
}

function isWorkingComment(comment: any) {
  const author = String(comment?.author_email || '').trim().toLowerCase()
  const content = String(comment?.content || '').trim().toLowerCase()
  return author === 'system@streamzrus.local' && content.startsWith("we're on it")
}

function getDisplayStatus(status: string, comments: any[]) {
  const normalized = normalizeStoredStatus(status)
  if (normalized === 'done') return 'done'
  if (normalized === 'in-progress') return 'in-progress'
  return comments.some((comment) => isWorkingComment(comment)) ? 'in-progress' : 'pending'
}

function formatStatusLabel(status: string) {
  if (normalizeUiStatus(status) === 'in-progress') return 'in progress'
  if (normalizeUiStatus(status) === 'done') return 'completed'
  return 'queued'
}

function formatStatusComment(status: string, kind: string) {
  const normalized = normalizeUiStatus(status)
  if (normalized === 'done') {
    return kind === 'issue'
      ? 'Complete. The reported issue has been resolved.'
      : 'Complete. This request has now been added.'
  }
  if (normalized === 'in-progress') {
    return "We're on it. The team is now working through this."
  }
  return 'Status updated to queued.'
}

function buildStatusEmail(input: {
  companyName: string
  title: string
  kind: string
  status: string
  note?: string
}) {
  const normalized = normalizeUiStatus(input.status)
  const headline =
    normalized === 'done'
      ? input.kind === 'issue'
        ? 'Your reported issue has been resolved.'
        : 'Your request has been completed.'
      : normalized === 'in-progress'
        ? "We're on it."
        : 'Your request is still in the queue.'

  return {
    subject: `${input.companyName}: update on ${input.title}`,
    body: [
      'Hello,',
      '',
      headline,
      `Current status: ${formatStatusLabel(input.status)}.`,
      input.note ? '' : '',
      input.note ? `Support note: ${input.note}` : '',
      '',
      'You can log in to your portal at any time to check the latest progress.',
      '',
      input.companyName,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

async function withConfiguredSmtp<T>(settings: any, fn: () => Promise<T>) {
  const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  }

  process.env.SMTP_HOST = settings.smtp_host
  process.env.SMTP_PORT = settings.smtp_port || '587'
  process.env.SMTP_USER = settings.smtp_user
  process.env.SMTP_PASS = String(settings.smtp_pass || '').replace(/\s+/g, '')
  process.env.SMTP_FROM = settings.smtp_from || settings.smtp_user

  try {
    return await fn()
  } finally {
    Object.entries(originalEnv).forEach(([k, v]) => {
      if (v !== undefined) (process.env as any)[k] = v as string
      else delete (process.env as any)[k]
    })
  }
}

async function enrichItems(s: ReturnType<typeof createServiceClient>, rows: any[]) {
  const ids = rows.map((item) => item.id).filter(Boolean)
  const [commentsRes, likesRes] = await Promise.all([
    ids.length
      ? s!
          .from('recommendation_comments')
          .select('id,recommendation_id,created_at,content,author_email')
          .in('recommendation_id', ids)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    ids.length
      ? s!.from('recommendation_likes').select('id,recommendation_id').in('recommendation_id', ids)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  const commentMap = new Map<string, any[]>()
  for (const comment of commentsRes.data || []) {
    const key = String((comment as any).recommendation_id || '')
    if (!commentMap.has(key)) commentMap.set(key, [])
    commentMap.get(key)?.push(comment)
  }

  const likeMap = new Map<string, number>()
  for (const like of likesRes.data || []) {
    const key = String((like as any).recommendation_id || '')
    likeMap.set(key, (likeMap.get(key) || 0) + 1)
  }

  return rows.map((item) => {
    const comments = commentMap.get(String(item.id)) || []
    const latestComment = comments[comments.length - 1]
    return {
      ...item,
      status: getDisplayStatus(item.status, comments),
      comments_count: comments.length,
      likes_count: likeMap.get(String(item.id)) || 0,
      latest_comment_preview: latestComment ? String(latestComment.content || '').replace(/\s+/g, ' ').trim().slice(0, 180) : '',
      latest_comment_at: latestComment?.created_at || null,
      updated_at: item.updated_at || item.created_at,
    }
  })
}

async function recommendationsHaveUpdatedAt(s: NonNullable<ReturnType<typeof createServiceClient>>) {
  const { error } = await s.from('recommendations').select('updated_at').limit(0)
  return !error
}

export async function GET() {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = createServiceClient()
  if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  const supportsUpdatedAt = await recommendationsHaveUpdatedAt(s)
  const sortField = supportsUpdatedAt ? 'updated_at' : 'created_at'
  const { data, error } = await s
    .from('recommendations')
    .select('*')
    .order(sortField, { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = await enrichItems(s, data || [])
  return NextResponse.json({ items })
}

export async function PUT(req: Request) {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = createServiceClient()
  if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  try {
    const { id, status, note } = await req.json()
    const cleanId = String(id || '').trim()
    const cleanStatus = normalizeUiStatus(status)
    const cleanNote = String(note || '').trim()

    if (!cleanId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    if (cleanStatus && !['pending', 'in-progress', 'done'].includes(cleanStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: existing, error: existingErr } = await s.from('recommendations').select('*').eq('id', cleanId).single()
    if (existingErr || !existing) return NextResponse.json({ error: existingErr?.message || 'Request not found' }, { status: 404 })

    const existingUiStatus = normalizeStoredStatus(existing.status)
    const nextStatus = cleanStatus || existingUiStatus || 'pending'
    const now = new Date().toISOString()
    const supportsUpdatedAt = await recommendationsHaveUpdatedAt(s)
    const nextStoredStatus =
      nextStatus === 'in-progress'
        ? existingUiStatus === 'done'
          ? 'pending'
          : normalizeStoredStatus(existing.status)
        : nextStatus
    const updatePayload: any = { status: nextStoredStatus }
    if (supportsUpdatedAt) updatePayload.updated_at = now
    const { data: rec, error: updateErr } = await s
      .from('recommendations')
      .update(updatePayload)
      .eq('id', cleanId)
      .select('*')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    const commentPayloads: any[] = []
    if (existingUiStatus !== nextStatus) {
      commentPayloads.push({
        id: crypto.randomUUID(),
        recommendation_id: cleanId,
        author_email: 'system@streamzrus.local',
        content: formatStatusComment(nextStatus, rec.kind || existing.kind || 'request'),
        created_at: now,
      })
    }
    if (cleanNote) {
      commentPayloads.push({
        id: crypto.randomUUID(),
        recommendation_id: cleanId,
        author_email: 'support@streamzrus.local',
        content: cleanNote,
        created_at: now,
      })
    }
    if (commentPayloads.length) {
      await s.from('recommendation_comments').insert(commentPayloads)
    }

    const { data: settings } = await s.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    if (settings?.smtp_host && settings?.smtp_user && settings?.smtp_pass) {
      const emailContent = buildStatusEmail({
        companyName: String(settings.company_name || 'STREAMZ R US').trim() || 'STREAMZ R US',
        title: rec.title || existing.title || 'your item',
        kind: rec.kind || existing.kind || 'request',
        status: nextStatus,
        note: cleanNote,
      })

      try {
        await withConfiguredSmtp(settings, () => sendCustomEmail([rec.submitter_email], emailContent.subject, emailContent.body))
      } catch (emailErr) {
        console.error('Failed to send recommendation update email:', emailErr)
      }
    }

    const [items] = await Promise.all([
      enrichItems(s, [rec]),
    ])

    return NextResponse.json({ ok: true, item: items[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = createServiceClient()
  if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { error } = await s.from('recommendations').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
