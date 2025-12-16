import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getPlexFriends } from '@/lib/plex'

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

    // 2. Fetch Plex Friends
    const friends = await getPlexFriends(settings.plex_server_url || 'https://plex.tv', settings.plex_token)
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
    const matchedPlexIds = new Set<string>()

    // Simple logic: Match by email only, update username
    for (const f of friends) {
      const fEmail = (f.email || '').toLowerCase()
      const fUser = (f.username || '').toLowerCase()

      // A. Check for Email Match (Only)
      const match = customers.find(c => c.email && c.email.toLowerCase() === fEmail)

      if (match) {
        matchedPlexIds.add(f.id)

        // Update customer with Plex username
        let notes = match.notes || ''
        const plexMatch = notes.match(/Plex:\s*([^\r\n]+)/i)
        const currentLinked = plexMatch ? plexMatch[1].trim() : ''
        
        if (currentLinked !== f.username) {
          let newNotes = notes
          if (plexMatch) {
            newNotes = notes.replace(/Plex:\s*[^\r\n]+/, `Plex: ${f.username}`)
          } else {
            newNotes = (notes ? notes + '\n' : '') + `Plex: ${f.username}`
          }
          updates.push(s.from('customers').update({ notes: newNotes }).eq('id', match.id))
          updatedCount++
        }
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates)
    }

    const unmatched = friends.filter(f => !matchedPlexIds.has(f.id))

    return NextResponse.json({ 
      ok: true, 
      count: updatedCount, 
      total_friends: friends.length,
      matched_names: friends.map(f => f.username),
      unmatched
    })

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
