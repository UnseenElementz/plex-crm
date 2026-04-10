import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createCommunityAccessCode } from '@/lib/communityAccess'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const label = String(body?.label || '').trim()

    const result = await createCommunityAccessCode({
      email: email || null,
      label: label || null,
      createdBy: 'admin',
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create access code' }, { status: 400 })
  }
}

export const runtime = 'nodejs'
