import { NextResponse } from 'next/server'
import { getPlexFriends } from '@/lib/plex'

export async function POST(request: Request){
  try {
    const { token, url } = await request.json()
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })
    
    // Attempt to fetch friends/users as a connectivity test
    // Using default URL if not provided, or the one passed
    const serverUrl = url || 'https://plex.tv'
    
    // We'll try to fetch friends. If it works, the token is valid.
    const friends = await getPlexFriends(serverUrl, token)
    
    // Even if 0 friends, if no error thrown, it's connected.
    // getPlexFriends catches errors and returns empty array. 
    // We need to differentiate between "no friends" and "error".
    // Let's inspect getPlexFriends implementation or just try a direct fetch here for better diagnostics.
    
    // Direct test for better error reporting
    const testRes = await fetch('https://plex.tv/api/users', {
      headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }
    })
    
    if (!testRes.ok) {
      if (testRes.status === 401) return NextResponse.json({ error: 'Unauthorized: Invalid Token' }, { status: 401 })
      return NextResponse.json({ error: `Connection failed: ${testRes.status} ${testRes.statusText}` }, { status: testRes.status })
    }
    
    const text = await testRes.text()
    // Simple check if it looks like XML
    if (!text.includes('<?xml')) {
      return NextResponse.json({ error: 'Invalid response from Plex' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, message: 'Connection successful!' })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Connection failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
