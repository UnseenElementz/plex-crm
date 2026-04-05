import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function baseOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, baseOptions())
}

export function createServerAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, baseOptions())
}

export async function getRequester(request?: Request) {
  const isAdmin = cookies().get('admin_session')?.value === '1'
  const auth = createServerAuthClient()
  const authHeader = request?.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token || !auth) {
    return { isAdmin, email: null as string | null }
  }

  const { data, error } = await auth.auth.getUser(token)
  if (error || !data.user?.email) {
    return { isAdmin, email: null as string | null }
  }

  return {
    isAdmin,
    email: data.user.email.trim().toLowerCase(),
  }
}
