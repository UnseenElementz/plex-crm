import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/pricing'
import { sendCustomEmail } from '@/lib/email'
import { createServiceClient, getRequester } from '@/lib/serverSupabase'

function ensureActiveCustomer(nextDue: any, subscriptionStatus: any): boolean {
  if (String(subscriptionStatus || '').toLowerCase() === 'inactive') return false
  if (!nextDue) return false
  const statusLabel = getStatus(new Date(nextDue))
  return statusLabel === 'Active' || statusLabel === 'Due Soon' || statusLabel === 'Due Today'
}

function anonymizeEmail(email: string) {
  if (!email) return ''
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  return `${user.substring(0, 2)}***@${domain}`
}

function normalizeTitle(input: string, fallback: string) {
  const clean = String(input || '').trim()
  return clean || fallback
}

function buildDescription(input: {
  kind: 'request' | 'issue'
  previewDescription: string
  customerName: string
  email: string
  details: string
  season: string
  episode: string
  plexUsername: string
}) {
  const sections: string[] = []
  if (input.previewDescription) sections.push(input.previewDescription)

  const meta: string[] = []
  meta.push(`Submitted by: ${input.customerName || input.email}`)
  meta.push(`Contact: ${input.email}`)
  if (input.plexUsername) meta.push(`Username: ${input.plexUsername}`)
  if (input.kind === 'issue' && input.season) meta.push(`Season: ${input.season}`)
  if (input.kind === 'issue' && input.episode) meta.push(`Episode: ${input.episode}`)
  sections.push(meta.join('\n'))

  if (input.details) {
    sections.push(input.details)
  }

  return sections.filter(Boolean).join('\n\n')
}

function normalizeSort(raw: string | null) {
  const [fieldRaw, orderRaw] = String(raw || 'updated_at.desc').split('.')
  const allowed = new Set(['created_at', 'updated_at', 'title', 'status'])
  const field = allowed.has(fieldRaw) ? fieldRaw : 'updated_at'
  const ascending = orderRaw === 'asc'
  return { field, ascending }
}

async function recommendationsHaveUpdatedAt(s: NonNullable<ReturnType<typeof createServiceClient>>) {
  const { error } = await s.from('recommendations').select('updated_at').limit(0)
  return !error
}

function formatLatestComment(comment: any) {
  if (!comment?.content) return ''
  return String(comment.content).replace(/\s+/g, ' ').trim().slice(0, 180)
}

export async function GET(req: Request){
  try{
    const s = createServiceClient()
    if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

    const requester = await getRequester(req)
    const { searchParams } = new URL(req.url)
    const filterEmail = String(searchParams.get('email') || '').trim().toLowerCase()
    const status = String(searchParams.get('status') || '').trim()
    const kind = String(searchParams.get('kind') || '').trim()
    const { field, ascending } = normalizeSort(searchParams.get('sort'))
    const supportsUpdatedAt = await recommendationsHaveUpdatedAt(s)

    let query = s.from('recommendations').select('*')

    if (filterEmail) {
      if (!requester.isAdmin && requester.email !== filterEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      query = query.eq('submitter_email', filterEmail)
    }
    if (status) query = query.eq('status', status)
    if (kind) query = query.eq('kind', kind)

    const sortField = field === 'updated_at' && !supportsUpdatedAt ? 'created_at' : field
    const { data, error } = await query.order(sortField, { ascending })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data || []
    const ids = rows.map((item: any) => item.id).filter(Boolean)
    const [commentsRes, likesRes] = await Promise.all([
      ids.length
        ? s
            .from('recommendation_comments')
            .select('id,recommendation_id,created_at,content,author_email')
            .in('recommendation_id', ids)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      ids.length
        ? s.from('recommendation_likes').select('id,recommendation_id,user_email').in('recommendation_id', ids)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    const commentMap = new Map<string, any[]>()
    for (const comment of commentsRes.data || []) {
      const key = String((comment as any).recommendation_id || '')
      if (!commentMap.has(key)) commentMap.set(key, [])
      commentMap.get(key)?.push(comment)
    }

    const likeMap = new Map<string, string[]>()
    for (const like of likesRes.data || []) {
      const key = String((like as any).recommendation_id || '')
      if (!likeMap.has(key)) likeMap.set(key, [])
      likeMap.get(key)?.push(String((like as any).user_email || '').trim().toLowerCase())
    }

    const items = rows.map((item: any) => {
      const comments = commentMap.get(String(item.id)) || []
      const likes = likeMap.get(String(item.id)) || []
      const latestComment = comments[comments.length - 1]
      const exactEmailVisible = requester.isAdmin || requester.email === String(item.submitter_email || '').trim().toLowerCase()

      return {
        ...item,
        submitter_email: exactEmailVisible ? item.submitter_email : anonymizeEmail(item.submitter_email),
        comments_count: comments.length,
        likes_count: likes.length,
        liked_by_me: requester.email ? likes.includes(requester.email) : false,
        latest_comment_preview: formatLatestComment(latestComment),
        latest_comment_at: latestComment?.created_at || null,
        updated_at: item.updated_at || item.created_at,
      }
    })

    return NextResponse.json({ items })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function POST(req: Request){
  try{
    const requester = await getRequester(req)
    const authEmail = requester.email
    if (!authEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const b = await req.json().catch(()=>({}))
    const kind = String(b?.kind || 'request')
    if (kind !== 'request' && kind !== 'issue') return NextResponse.json({ error: 'invalid kind' }, { status: 400 })

    const url = String(b?.url || '').trim()
    const title = normalizeTitle(String(b?.title || ''), kind === 'issue' ? 'Media issue report' : 'New media request')
    const description = String(b?.description || '').trim()
    const image = String(b?.image || '').trim()
    const details = String(b?.details || '').trim()
    const season = String(b?.season || '').trim()
    const episode = String(b?.episode || '').trim()

    if (!url || !title) return NextResponse.json({ error: 'url and title required' }, { status: 400 })

    const s = createServiceClient()
    if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })

    const { data: cust, error: custErr } = await s
      .from('customers')
      .select('email,name,next_payment_date,subscription_status,notes')
      .eq('email', authEmail)
      .limit(1)
      .maybeSingle()

    if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 })
    if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 403 })

    const nextDue = (cust as any).next_payment_date || (cust as any).next_due_date
    const isActive = ensureActiveCustomer(nextDue, (cust as any).subscription_status)
    if (!isActive) return NextResponse.json({ error: 'Active subscription required' }, { status: 403 })

    const plexUsername = String((cust as any).notes || '').match(/Plex:\s*([^\n]+)/i)?.[1]?.trim() || ''
    const now = new Date().toISOString()
    const supportsUpdatedAt = await recommendationsHaveUpdatedAt(s)
    const payload: any = {
      id: crypto.randomUUID(),
      url,
      title,
      description: buildDescription({
        kind,
        previewDescription: description,
        customerName: String((cust as any).name || '').trim(),
        email: authEmail,
        details,
        season,
        episode,
        plexUsername,
      }),
      image,
      submitter_email: authEmail,
      kind,
      status: 'pending',
      created_at: now,
    }
    if (supportsUpdatedAt) payload.updated_at = now

    const { data, error } = await s.from('recommendations').insert([payload]).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let settings: any = null
    try {
      const { data: settingsRow } = await s.from('admin_settings').select('*').eq('id', 1).maybeSingle()
      settings = settingsRow || null
    } catch {}

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
    const companyName = String(settings.company_name || 'STREAMZ R US').trim() || 'STREAMZ R US'
    const kindLabel = kind === 'issue' ? 'issue report' : 'request'
    const subject = `${companyName}: New ${kindLabel}`
    const text = [
      `A customer has sent a new ${kindLabel}.`,
      '',
      `Title: ${title}`,
      `Customer: ${String((cust as any).name || '').trim() || authEmail}`,
      `Email: ${authEmail}`,
      `Link: ${url}`,
      season ? `Season: ${season}` : '',
      episode ? `Episode: ${episode}` : '',
      plexUsername ? `Username: ${plexUsername}` : '',
      '',
      details || description || 'No extra notes added.',
    ]
      .filter(Boolean)
      .join('\n')

    try{
      await sendCustomEmail([notifyTo], subject, text)
    } finally {
      Object.entries(originalEnv).forEach(([k,v])=>{ if (v !== undefined) (process.env as any)[k] = v as string; else delete (process.env as any)[k] })
    }

    return NextResponse.json({ ok: true, item: data })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
