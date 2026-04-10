import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendOverDownloadWarning } from '@/lib/email'
import { addAuditLog } from '@/lib/moderation'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const downloadCount = Number(body.downloadCount || 0)
  const user = String(body.user || '').trim()
  const ip = String(body.ip || '').trim()

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    let settings: any = null
    try {
      const { data } = await supabase.from('admin_settings').select('*').single()
      settings = data || null
    } catch {}

    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      const cookieData = raw ? JSON.parse(decodeURIComponent(raw)) : null
      settings = cookieData || settings
    }

    if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 400 })
    }

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
      await sendOverDownloadWarning(email, {
        companyName: settings.company_name || 'STREAMZ R US',
      })

      await addAuditLog({
        action: 'customer_download_warning',
        email,
        details: {
          user,
          ip,
          download_count: downloadCount,
        },
      })

      return NextResponse.json({ ok: true })
    } finally {
      Object.entries(originalEnv).forEach(([k, v]) => {
        if (v !== undefined) (process.env as any)[k] = v as string
        else delete (process.env as any)[k]
      })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}

