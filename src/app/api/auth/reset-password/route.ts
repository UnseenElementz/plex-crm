import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Authentication service not configured' }, { status: 500 })
    }

    // Always request Supabase to send reset email; Supabase will handle existence silently
    const host = process.env.NEXT_PUBLIC_CANONICAL_HOST || 'plex-crm.vercel.app'
    const scheme = host.startsWith('http') ? '' : 'https://'
    const redirectTo = `${scheme}${host}/reset-password`
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
