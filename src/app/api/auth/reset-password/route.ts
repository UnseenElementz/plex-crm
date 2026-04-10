import { NextResponse } from 'next/server'
import { createServerAuthClient } from '@/lib/serverSupabase'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createServerAuthClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Authentication service not configured' }, { status: 500 })
    }

    // Always request Supabase to send reset email; Supabase handles account existence silently.
    const configuredHost = String(process.env.NEXT_PUBLIC_CANONICAL_HOST || '').trim()
    const origin = request.headers.get('origin') || ''
    const host = configuredHost || origin || 'https://plex-crm.vercel.app'
    const scheme = host.startsWith('http://') || host.startsWith('https://') ? '' : 'https://'
    const redirectTo = `${scheme}${host.replace(/\/+$/, '')}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      console.error('Password reset error:', error)
      return NextResponse.json({ error: 'Failed to send reset email' }, { status: 500 })
    }

    return NextResponse.json({ message: 'If an account exists with this email, you will receive password reset instructions.' })

  } catch (error) {
    console.error('Password reset request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
