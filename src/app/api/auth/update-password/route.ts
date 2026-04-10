import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { password, accessToken: bodyAccessToken } = await request.json()
    const authHeader = request.headers.get('authorization') || ''
    const headerAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const accessToken = bodyAccessToken || headerAccessToken
    
    if (!password || !accessToken) {
      return NextResponse.json({ error: 'Password and access token are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Authentication service not configured' }, { status: 500 })
    }

    // Create client with the access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      }
    )

    // Update the user's password
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      console.error('Password update error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ message: 'Password updated successfully' })

  } catch (error) {
    console.error('Password update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
