import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendCustomEmail } from '@/lib/email'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET() {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = svc()
  if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  const { data, error } = await s
    .from('recommendations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function PUT(req: Request) {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = svc()
  if (!s) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

  try {
    const { id, status } = await req.json()
    if (!id || !status) return NextResponse.json({ error: 'ID and status required' }, { status: 400 })

    // 1. Update the recommendation status
    const { data: rec, error: updateErr } = await s
      .from('recommendations')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // 2. If status is 'done', send email to customer
    if (status === 'done') {
      const { data: customer } = await s
        .from('customers')
        .select('name, email')
        .eq('email', rec.submitter_email)
        .maybeSingle()

      const firstName = customer?.name?.split(' ')[0] || customer?.name || 'Customer'
      const itemTitle = rec.title
      const kindLabel = rec.kind === 'issue' ? 'reported issue' : 'requested program'
      const resolutionText = rec.kind === 'issue' ? 'issue has been fixed' : 'program has been added to the server'

      const subject = `Your Request Has Been Successfully Processed - StreamZ 'R' Us`
      const text = `Dear Valued Customer,\n\nThank you for your recent ${rec.kind === 'issue' ? 'report' : 'request'} regarding ${itemTitle}. We are pleased to inform you that this matter has been successfully resolved and ${resolutionText}.\n\nWe appreciate your patience and continued support. If you have any questions, please don't hesitate to contact us.\n\nBest regards,\nThe StreamZ 'R' Us Team`

      // Get SMTP settings
      const { data: settings } = await s.from('admin_settings').select('*').single()
      if (settings?.smtp_host && settings?.smtp_user && settings?.smtp_pass) {
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

        try {
          await sendCustomEmail([rec.submitter_email], subject, text)
        } catch (emailErr) {
          console.error('Failed to send notification email:', emailErr)
        } finally {
          Object.entries(originalEnv).forEach(([k,v])=>{ 
            if (v !== undefined) (process.env as any)[k] = v as string
            else delete (process.env as any)[k]
          })
        }
      }
    }

    return NextResponse.json({ ok: true, item: rec })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = svc()
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
