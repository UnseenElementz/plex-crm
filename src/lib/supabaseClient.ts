import { createClient, type SupabaseClient } from '@supabase/supabase-js'
let cached: SupabaseClient | null = null

export function getSupabase(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Return null if either URL or key is missing or empty
  if (!url || !key || url.trim() === '' || key.trim() === '') {
    return null
  }
  
  // Validate URL format
  try {
    new URL(url)
    if (cached) return cached
    cached = createClient(url, key, { auth: { persistSession: true, storageKey: 'plex-auth' }, global: { headers: { apikey: key } } })
    return cached
  } catch (error) {
    console.error('Invalid Supabase URL:', error)
    return null
  }
}

export const supabase = getSupabase()
