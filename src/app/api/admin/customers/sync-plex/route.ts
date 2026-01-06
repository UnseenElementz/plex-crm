import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getPlexFriends } from '@/lib/plex'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: Request){
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    // Get settings for Plex token
    const { data: settings } = await supabase.from('admin_settings').select('*').single()
    
    if (!settings || !settings.plex_token || !settings.plex_server_url) {
      return NextResponse.json({ error: 'Plex not configured in settings' }, { status: 400 })
    }

    // Fetch friends from Plex
    const friends = await getPlexFriends(settings.plex_server_url, settings.plex_token)
    
    if (!friends.length) {
      return NextResponse.json({ message: 'No Plex friends found', count: 0, added: 0 })
    }

    // Get existing customers to minimize writes
    const { data: existing } = await supabase.from('customers').select('id,email,full_name,plex_username')
    const existingByEmail = new Map<string, any>((existing || []).map((c: any) => [String(c.email || '').toLowerCase(), c]))
    const existingByPlex = new Map<string, any>((existing || []).filter((c: any) => c.plex_username).map((c: any) => [String(c.plex_username || '').toLowerCase(), c]))

    let added = 0
    let updated = 0
    const emails: string[] = []

    // Process friends
    for (const friend of friends) {
      if (!friend.email) continue
      const fEmail = String(friend.email).toLowerCase()
      const fUser = String(friend.username || friend.title || '').toLowerCase()
      emails.push(friend.email)

      const byPlex = fUser ? existingByPlex.get(fUser) : null
      const byEmail = existingByEmail.get(fEmail)

      if (byPlex) {
        // Update email if changed or missing, attach plex metadata
        const needsEmailUpdate = String(byPlex.email || '').toLowerCase() !== fEmail
        const updatePayload: any = {}
        if (needsEmailUpdate) updatePayload.email = friend.email
        if (!byPlex.plex_username && friend.username) updatePayload.plex_username = friend.username
        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase.from('customers').update(updatePayload).eq('id', byPlex.id)
          if (!error) updated++
        }
        continue
      }

      if (byEmail) {
        // Update plex metadata if missing
        const updatePayload: any = {}
        if (!byEmail.full_name && (friend.username || friend.title)) updatePayload.full_name = friend.username || friend.title
        if (!byEmail.plex_username && friend.username) updatePayload.plex_username = friend.username
        if (Object.keys(updatePayload).length > 0) {
          const { error } = await supabase.from('customers').update(updatePayload).eq('id', byEmail.id)
          if (!error) updated++
        }
        continue
      }

      // Add new customer
      const { error } = await supabase.from('customers').insert({
        email: friend.email,
        full_name: friend.username || friend.title || friend.email.split('@')[0],
        status: 'inactive', // Default to inactive until they buy a plan
        plex_id: friend.id,
        plex_username: friend.username
      })

      if (!error) added++
    }

    return NextResponse.json({ 
      ok: true, 
      count: friends.length, 
      added,
      emails,
      message: `Synced ${friends.length} friends. Added ${added} new customers.`
    })

  } catch (e: any) {
    console.error('Sync error:', e)
    return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 })
  }
}
