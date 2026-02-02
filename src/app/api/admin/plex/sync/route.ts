import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAllPlexUsers } from '@/lib/plex'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request){
  const s = svc()
  if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })
  
  try {
    // 1. Get Settings
    let { data: settings } = await s.from('admin_settings').select('*').single()
    
    // Fallback to cookie if DB setting is missing or token is missing
    if (!settings?.plex_token) {
       const cookieStore = cookies()
       const raw = cookieStore.get('admin_settings')?.value
       if (raw) {
          try {
            const cookieSettings = JSON.parse(decodeURIComponent(raw))
            if (cookieSettings.plex_token) {
               settings = { ...(settings || {}), ...cookieSettings }
            }
          } catch {}
       }
    }

    if (!settings?.plex_token) {
      return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 })
    }

    // 2. Fetch Plex Friends (and Shared Users)
    const friends = await getAllPlexUsers(settings.plex_token)
    if (!friends.length) {
      return NextResponse.json({ message: 'No Plex friends found or API error', count: 0 })
    }

    // 3. Fetch Local Customers
    const { data: customers } = await s.from('customers').select('*')
    if (!customers?.length) {
      return NextResponse.json({ message: 'No local customers to match', count: 0 })
    }

    // 4. Match and Update
    let updatedCount = 0
    const updates = []
    
    // Create a map of normalized email -> plex friend
    const plexMap = new Map<string, any>()
    for (const f of friends) {
        if (f.email) plexMap.set(f.email.toLowerCase(), f)
    }

    for (const c of customers) {
        const cEmail = (c.email || '').toLowerCase()
        const plexFriend = plexMap.get(cEmail)
        
        if (plexFriend) {
            // User is on Plex - ensure username matches
            if (c.plex_username !== plexFriend.username) {
                updates.push(s.from('customers').update({ plex_username: plexFriend.username }).eq('id', c.id))
                updatedCount++
            }
        } else {
            // User is NOT on Plex (or email mismatch)
            // If they have a plex_username set, we should clear it as they are no longer shared (by email)
            if (c.plex_username) {
                updates.push(s.from('customers').update({ plex_username: null }).eq('id', c.id))
                updatedCount++
            }
        }
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }

    const unmatched = friends.filter(f => {
        // Find if this friend is linked to any customer
        // We can check our plexMap but we need to check if ANY customer has this username
        const fEmail = (f.email || '').toLowerCase()
        const match = customers.find(c => 
            (c.email && c.email.toLowerCase() === fEmail) || 
            (c.plex_username === f.username)
        )
        return !match
    })

    return NextResponse.json({ 
      ok: true, 
      count: updatedCount, 
      total_friends: friends.length,
      matched_names: friends.map(f => f.username),
      unmatched_friends: unmatched.map(f => ({ username: f.username, email: f.email, id: f.id }))
    })

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
