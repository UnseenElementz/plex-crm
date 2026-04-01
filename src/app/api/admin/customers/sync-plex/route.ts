import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getAllPlexUsers, getOwnedServers } from '@/lib/plex'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function ensurePlexLine(notes: string, plexUsernameRaw: string) {
  const u = String(plexUsernameRaw || '').trim()
  if (!u) return String(notes || '')
  const n = String(notes || '')
  if (/Plex:\s*[^\n]+/i.test(n)) return n
  const base = n.trim()
  return (base ? (base + '\n') : '') + `Plex: ${u}`
}

export async function POST(request: Request){
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(()=>({}))
    const mode = String(body?.mode || 'customers')
    const action = String(body?.action || 'run')

    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    if (mode === 'email' && action === 'confirm') {
      const includeUnmatched = Boolean(body?.include_unmatched)
      const selectedCount = Number(body?.selected_count || 0)
      const mismatchCount = Number(body?.mismatch_count || 0)
      const mismatchCustomerIds = Array.isArray(body?.mismatch_customer_ids) ? body.mismatch_customer_ids.map((x: any)=> String(x || '').trim()).filter(Boolean) : []
      console.info('mail_plex_sync_confirm', { includeUnmatched, selectedCount, mismatchCount, mismatchCustomerIdsCount: mismatchCustomerIds.length })
      return NextResponse.json({ ok: true })
    }

    // Get settings for Plex token
    const { data: settings } = await supabase.from('admin_settings').select('*').single()
    
    if (!settings || !settings.plex_token || !settings.plex_server_url) {
      return NextResponse.json({ error: 'Plex not configured in settings' }, { status: 400 })
    }

    const servers = await getOwnedServers(settings.plex_token)
    if (!servers.length) {
      return NextResponse.json({
        error: 'Plex server not claimed / not found for this token. Use a token from the Plex account that owns the server and ensure the server is claimed.'
      }, { status: 400 })
    }

    // Fetch ONLY active library shares from Plex
    const friends = await getAllPlexUsers(settings.plex_token)
    
    if (!friends || !friends.length) {
      return NextResponse.json({ 
        ok: true, 
        message: 'No active Plex library shares found',
        count: 0, 
        added: 0,
        updated: 0,
        emails: [],
        unmatched_friends: [],
        mismatched: []
      })
    }

    const { data: existing, error: existingError } = await supabase.from('customers').select('id,email,name,notes')
    if (existingError) console.error('sync_plex_existing_customers_error', existingError.message)
    const existingByEmail = new Map<string, any>((existing || []).map((c: any) => [String(c.email || '').toLowerCase(), c]))
    const existingByPlex = new Map<string, any>(
      (existing || [])
        .map((c: any) => {
          const notes = String(c?.notes || '')
          const fromNotes = notes.match(/Plex:\s*([^\n]+)/i)?.[1]?.trim() || ''
          return { c, plex: fromNotes ? fromNotes.toLowerCase() : '' }
        })
        .filter((x: any) => x.plex)
        .map((x: any) => [x.plex, x.c])
    )

    let added = 0
    let updated = 0
    const emails: string[] = []
    const unmatched_friends: any[] = []
    const mismatched: any[] = []
    const rows: any[] = []

    // Process friends
    for (const friend of friends) {
      const plexEmailRaw = String(friend.email || '').trim()
      const plexEmail = plexEmailRaw.toLowerCase()
      const plexUsernameRaw = String(friend.username || friend.title || '').trim()
      const plexUsername = plexUsernameRaw.toLowerCase()
      const canEmail = Boolean(plexEmailRaw)

      if (mode !== 'email' && !canEmail) continue

      if (canEmail) emails.push(plexEmailRaw)

      const byEmail = plexEmail ? existingByEmail.get(plexEmail) : null
      const byPlex = !byEmail && plexUsername ? existingByPlex.get(plexUsername) : null
      const linked = byEmail || byPlex || null
      const customerEmailRaw = String(linked?.email || '').trim()
      const customerEmail = customerEmailRaw.toLowerCase()

      const linkedBy = byEmail ? 'email' : (byPlex ? 'plex_username' : null)
      const status =
        !canEmail ? 'missing_plex_email'
        : (!linked ? 'not_in_crm'
          : (customerEmail && plexEmail && customerEmail !== plexEmail ? 'email_mismatch' : 'linked'))

      const recipientEmail = linked ? (customerEmailRaw || plexEmailRaw) : plexEmailRaw
      rows.push({
        status,
        linked_by: linkedBy,
        recipient_email: recipientEmail,
        plex_email: plexEmailRaw,
        plex_username: plexUsernameRaw,
        customer_id: linked?.id || null,
        customer_email: customerEmailRaw || null,
        customer_name: linked?.name || null
      })

      if (mode === 'email') {
        if (status === 'email_mismatch') {
          mismatched.push({
            plex_email: plexEmailRaw,
            plex_username: plexUsernameRaw,
            customer_id: linked?.id || null,
            customer_email: customerEmailRaw || null
          })
        }
        if (status === 'not_in_crm') {
          unmatched_friends.push({ email: plexEmailRaw, username: plexUsernameRaw })
        }
        continue
      }

      if (byPlex) {
        const nextNotes = ensurePlexLine(String(byPlex.notes || ''), plexUsernameRaw)
        if (nextNotes !== String(byPlex.notes || '')) {
          const { error } = await supabase.from('customers').update({ notes: nextNotes }).eq('id', byPlex.id)
          if (!error) updated++
        }
        continue
      }

      if (byEmail) {
        const nextNotes = ensurePlexLine(String(byEmail.notes || ''), plexUsernameRaw)
        if (nextNotes !== String(byEmail.notes || '')) {
          const { error } = await supabase.from('customers').update({ notes: nextNotes }).eq('id', byEmail.id)
          if (!error) updated++
        }
        continue
      }

      unmatched_friends.push(friend)
      if (mode !== 'email') {
        const { error } = await supabase.from('customers').insert({
          name: plexUsernameRaw || friend.email.split('@')[0],
          email: friend.email,
          subscription_status: 'inactive',
          notes: ensurePlexLine('', plexUsernameRaw)
        })
        if (!error) added++
      }
    }

    if (mode === 'email') {
      const totals = {
        total: rows.length,
        linked: rows.filter(r=> r.status === 'linked').length,
        mismatched: rows.filter(r=> r.status === 'email_mismatch').length,
        not_in_crm: rows.filter(r=> r.status === 'not_in_crm').length,
        missing_plex_email: rows.filter(r=> r.status === 'missing_plex_email').length
      }
      const recommended = rows
        .filter(r=> r.status === 'linked' || r.status === 'email_mismatch')
        .map(r=> r.recipient_email)
        .filter(Boolean)
      console.info('mail_plex_sync_preview', { totals, recommendedCount: recommended.length })
      return NextResponse.json({
        ok: true,
        mode,
        action: action === 'run' ? 'preview' : action,
        totals,
        count: friends.length,
        emails: recommended,
        rows,
        unmatched_friends,
        mismatched
      })
    }

    return NextResponse.json({ 
      ok: true, 
      count: friends.length, 
      added,
      updated,
      emails,
      unmatched_friends,
      mode,
      message: `Synced ${friends.length} shared users. Added ${added} new customers.`
    })

  } catch (e: any) {
    console.error('Sync error:', e)
    return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 })
  }
}
