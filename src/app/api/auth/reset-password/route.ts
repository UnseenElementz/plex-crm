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

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', email)
      .single()

    if (checkError || !existingUser) {
      // Don't reveal whether email exists for security
      return NextResponse.json({ 
        message: 'If an account exists with this email, you will receive password reset instructions.' 
      })
    }

    // Send password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password`,
    })

    if (error) {
      console.error('Password reset error:', error)
      return NextResponse.json({ error: 'Failed to send reset email' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'If an account exists with this email, you will receive password reset instructions.' 
    })

  } catch (error) {
    console.error('Password reset request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}