'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'

type ShareRow = {
  server_name: string
  server_machine_id: string
  email: string
  username: string
  customer_name?: string | null
  share_id: string
  plex_user_id: string
  all_libraries: boolean | null
  allow_sync: boolean | null
  allow_tuners: boolean | null
  allow_channels: boolean | null
  allow_camera_upload: boolean | null
  allow_subtitle_admin: boolean | null
  filter_all: string | null
  filter_movies: string | null
  filter_television: string | null
  accepted_at: string | null
  invited_at: string | null
  raw: Record<string, string>
}

type Customer = {
  email: string
  full_name: string
  plan?: string
  streams?: number
  status?: string
}

type LibraryRow = {
  id: number
  title: string
  type: string
  is_shared?: boolean
}

function PlexToolsInner() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ShareRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [manage, setManage] = useState<ShareRow | null>(null)
  const [libs, setLibs] = useState<LibraryRow[]>([])
  const [libsLoading, setLibsLoading] = useState(false)
  const [libsError, setLibsError] = useState('')
  const [inviteLibraries, setInviteLibraries] = useState<LibraryRow[]>([])
  const [selectedLibs, setSelectedLibs] = useState<Record<number, boolean>>({})
  const [allowSync, setAllowSync] = useState<boolean>(false)
  const [filters, setFilters] = useState<{ filter_all: string; filter_movies: string; filter_television: string }>({
    filter_all: '',
    filter_movies: '',
    filter_television: ''
  })
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLibs, setInviteLibs] = useState<Record<number, boolean>>({})
  const [inviteAllowSync, setInviteAllowSync] = useState(false)
  const [removeEmail, setRemoveEmail] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [prefillEmail, setPrefillEmail] = useState('')
  const [autoOpened, setAutoOpened] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/plex-tools/shares', { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to load Plex shares')
        return
      }
      setRows(Array.isArray(data?.items) ? data.items : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load Plex shares')
    } finally {
      setLoading(false)
    }
  }

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers', { cache: 'no-store' as any })
      if (!res.ok) return
      const data = await res.json().catch(() => [])
      setCustomers(Array.isArray(data) ? data : [])
    } catch {}
  }

  async function loadLibrariesForShare(r: ShareRow) {
    setLibs([])
    setSelectedLibs({})
    setLibsLoading(true)
    setLibsError('')
    try {
      const qs = new URLSearchParams()
      if (r.email) qs.set('email', r.email)
      if (r.username) qs.set('username', r.username)
      if (r.server_machine_id) qs.set('machineIdentifier', r.server_machine_id)
      const res = await fetch(`/api/admin/plex/libraries?${qs.toString()}`, { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLibsError(data?.error || 'Failed to load libraries')
        return
      }
      const list: LibraryRow[] = Array.isArray(data?.libraries) ? data.libraries : []
      setLibs(list)
      const sharedIds: number[] = Array.isArray(data?.shared) ? data.shared.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n)) : []
      const next: Record<number, boolean> = {}
      list.forEach((l) => {
        if (l?.id === undefined) return
        const id = Number(l.id)
        next[id] = sharedIds.includes(id)
      })
      setSelectedLibs(next)
    } catch (e: any) {
      setLibsError(e?.message || 'Failed to load libraries')
    } finally {
      setLibsLoading(false)
    }
  }

  async function loadLibrariesForInvite() {
    try {
      const res = await fetch('/api/admin/plex/libraries', { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      const list: LibraryRow[] = Array.isArray(data?.libraries) ? data.libraries : []
      setInviteLibraries(list)
      const next: Record<number, boolean> = {}
      list.forEach((l) => {
        if (l?.id !== undefined) next[Number(l.id)] = true
      })
      setInviteLibs(next)
    } catch {}
  }

  useEffect(() => {
    const email = String(searchParams?.get('email') || '').trim()
    if (email) {
      setQuery(email)
      setInviteEmail(email)
      setRemoveEmail(email)
      setPrefillEmail(email)
    }
    load()
    loadCustomers()
    loadLibrariesForInvite()
  }, [])

  const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

  const customersByEmail = useMemo(() => {
    const m = new Map<string, Customer>()
    customers.forEach((c) => {
      const e = String(c.email || '').toLowerCase()
      if (e) m.set(e, c)
    })
    return m
  }, [customers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        r.email.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.server_name.toLowerCase().includes(q)
      )
    })
  }, [rows, query])

  const inviteSelectedIds = useMemo(() => Object.entries(inviteLibs).filter(([, v]) => v).map(([k]) => Number(k)), [inviteLibs])

  async function openManage(r: ShareRow) {
    setManage(r)
    setAllowSync(r.allow_sync === true)
    setFilters({
      filter_all: r.filter_all || '',
      filter_movies: r.filter_movies || '',
      filter_television: r.filter_television || ''
    })
    setLibs([])
    setSelectedLibs({})
    await loadLibrariesForShare(r)
  }

  useEffect(() => {
    const email = String(prefillEmail || '').trim().toLowerCase()
    if (!email || autoOpened || manage) return
    const matches = rows.filter((r) => String(r.email || '').toLowerCase() === email)
    if (matches.length === 1) {
      setAutoOpened(true)
      openManage(matches[0])
    }
  }, [prefillEmail, rows, autoOpened, manage])

  async function saveManage() {
    if (!manage) return
    setSaving(true)
    try {
      const libraryIds = Object.entries(selectedLibs).filter(([, v]) => v).map(([k]) => Number(k))
      const res = await fetch('/api/admin/plex-tools/shares/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_machine_id: manage.server_machine_id,
          share_id: manage.share_id,
          plex_user_id: manage.plex_user_id,
          email: manage.email,
          library_section_ids: libraryIds,
          settings: { allow_sync: allowSync },
          filters,
          force_recreate: false
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${data?.error || 'Update failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }
      await load()
      await loadLibrariesForShare(manage)
      toast.success('Updated and verified')
    } catch (e: any) {
      toast.error(e?.message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function forceRecreateShare() {
    if (!manage) return
    if (!confirm(`Force recreate this share for ${manage.email || manage.username}? This will remove and re-add access to apply downloads/library settings.`)) return
    setSaving(true)
    try {
      const libraryIds = Object.entries(selectedLibs).filter(([, v]) => v).map(([k]) => Number(k))
      const res = await fetch('/api/admin/plex-tools/shares/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_machine_id: manage.server_machine_id,
          share_id: manage.share_id,
          plex_user_id: manage.plex_user_id,
          email: manage.email,
          library_section_ids: libraryIds,
          settings: { allow_sync: allowSync },
          filters,
          force_recreate: true
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${data?.error || 'Recreate failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }
      toast.success('Recreated and verified')
      setManage(null)
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Recreate failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeShare() {
    if (!manage) return
    if (!confirm(`Remove ${manage.email || manage.username} from ${manage.server_name}?`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plex-tools/shares/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_machine_id: manage.server_machine_id, share_id: manage.share_id })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Remove failed')
        return
      }
      toast.success('Removed')
      setManage(null)
      await load()
    } catch (e: any) {
      toast.error(e?.message || 'Remove failed')
    } finally {
      setSaving(false)
    }
  }

  async function invite() {
    const email = inviteEmail.trim()
    if (!email) return
    if (!emailValid(email)) { toast.error('Invalid email'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plex/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, libraries: inviteSelectedIds, allow_sync: inviteAllowSync })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`${data?.error || 'Share failed'}${data?.response ? `: ${String(data.response).slice(0, 140)}` : ''}`)
        return
      }
      toast.success('Shared')
      setInviteEmail('')
      await load()

      if (inviteAllowSync) {
        await load()
        const match = rows.find((r) => r.email.toLowerCase() === email.toLowerCase())
        if (match) {
          await fetch('/api/admin/plex-tools/shares/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              server_machine_id: match.server_machine_id,
              share_id: match.share_id,
              email: match.email,
              library_section_ids: inviteSelectedIds,
              settings: { allow_sync: true },
              filters: { filter_all: match.filter_all || '', filter_movies: match.filter_movies || '', filter_television: match.filter_television || '' }
            })
          })
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Share failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeByEmail() {
    const email = removeEmail.trim()
    if (!email) return
    if (!emailValid(email)) { toast.error('Invalid email'); return }
    if (!confirm(`Remove ${email} from the server and revoke all libraries?`)) return
    setActionBusy(true)
    try{
      const res = await fetch('/api/admin/plex-tools/shares/remove-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok) {
        toast.error(data?.error || 'Remove failed')
        return
      }
      const removedCount = Array.isArray(data?.removed) ? data.removed.length : 0
      if (removedCount === 0) toast.error('No active share found for that email')
      else toast.success(`Removed (${removedCount})`)
      setRemoveEmail('')
      await load()
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="glass border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Plex Tools</h1>
            <p className="text-slate-300 text-sm">Manage server shares and see the exact users Plex says are actively shared.</p>
          </div>
          <div className="flex gap-2">
            <a className="btn-outline" href="https://app.plex.tv/desktop/#!/settings/manage-library-access" target="_blank" rel="noreferrer">
              Manage Access (Plex)
            </a>
            <button className="btn-outline" onClick={load} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Add / Share Plex User</div>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Email to share (invite)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="btn" onClick={invite} disabled={saving || !inviteEmail.trim()}>
              Share
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 items-center text-xs text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={inviteAllowSync} onChange={(e) => setInviteAllowSync(e.target.checked)} />
              Allow Downloads
            </label>
            <span className="text-slate-500">Libraries (defaults to all):</span>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {inviteLibraries.length === 0 && <div className="text-xs text-slate-500">Loading libraries...</div>}
            {Object.entries(inviteLibs).map(([idStr, v]) => {
              const id = Number(idStr)
              const l = (inviteLibraries || []).find((x) => Number((x as any).id) === id)
              const title = l?.title || `Library ${id}`
              return (
                <label key={idStr} className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={v} onChange={() => setInviteLibs((p) => ({ ...p, [id]: !p[id] }))} />
                  <span className="truncate" title={title}>{title}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Remove Plex User (by email)</div>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Email to remove"
              value={removeEmail}
              onChange={(e) => setRemoveEmail(e.target.value)}
            />
            <button className="btn-outline" onClick={removeByEmail} disabled={actionBusy || !removeEmail.trim()}>
              {actionBusy ? 'Removing...' : 'Remove User'}
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500">Downloads must be disabled in Plex Web “Manage Library Access”.</div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Search email / username / server..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="glass px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 whitespace-nowrap">
            Total: <span className="text-slate-100 font-semibold">{rows.length}</span>
          </div>
        </div>

        {error && <div className="mt-4 text-rose-400 text-sm">{error}</div>}

        <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-slate-400 bg-slate-900/50 border-b border-slate-800">
            <div className="col-span-2">Server</div>
            <div className="col-span-3">Customer</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Libraries</div>
            <div className="col-span-1">DL</div>
            <div className="col-span-1"></div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {filtered.map((r, idx) => (
              <div key={`${r.server_machine_id}:${r.share_id || r.email}:${idx}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-900/60">
                <div className="col-span-2 truncate text-slate-200" title={r.server_name}>
                  {r.server_name}
                </div>
                <div className="col-span-3 truncate text-slate-200" title={(r.customer_name || customersByEmail.get(r.email.toLowerCase())?.full_name) || ''}>
                  {r.customer_name || customersByEmail.get(r.email.toLowerCase())?.full_name || '-'}
                </div>
                <div className="col-span-3 truncate text-slate-200" title={r.email}>
                  {r.email || '-'}
                  {r.username && <span className="ml-2 text-[10px] text-slate-500">{r.username}</span>}
                </div>
                <div className="col-span-2 text-slate-300">
                  {r.all_libraries === true ? (
                    <span className="text-emerald-300">All</span>
                  ) : r.all_libraries === false ? (
                    <span className="text-amber-300">Filtered</span>
                  ) : (
                    <span className="text-slate-500">Unknown</span>
                  )}
                </div>
                <div className="col-span-1 text-slate-300">
                  {r.allow_sync === true ? <span className="text-emerald-300">Yes</span> : r.allow_sync === false ? <span className="text-slate-500">No</span> : <span className="text-slate-500">-</span>}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button className="btn-xs-outline" onClick={() => openManage(r)} disabled={!r.share_id}>
                    Manage
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-slate-500">
                {rows.length === 0 ? 'No active shares found.' : 'No matches.'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          “Filtered” means the user does not have access to all libraries (they have a limited set of shared libraries and/or content filters).
        </div>

        <div className="mt-4 glass p-4 rounded-xl border border-slate-800">
          <div className="text-sm font-semibold text-slate-200">Plex Web Access</div>
          <div className="mt-2 text-xs text-slate-500">
            Plex overrides some share settings (especially downloads). Use Plex Web “Manage Library Access” to change them reliably.
          </div>
          <div className="mt-3">
            <a className="btn-outline" href="https://app.plex.tv/desktop/#!/settings/manage-library-access" target="_blank" rel="noreferrer">
              Open Manage Library Access
            </a>
          </div>
        </div>
      </div>
      {manage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
          <div className="glass p-4 rounded-xl w-full max-w-3xl border border-slate-700 bg-slate-900/80 max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-200">Manage Share</div>
                <div className="text-xs text-slate-400">{manage.server_name} — {manage.email} {manage.username ? `(${manage.username})` : ''}</div>
              </div>
              <button className="btn-xs-outline" onClick={() => setManage(null)} disabled={saving}>Close</button>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 items-center text-xs text-slate-300">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={allowSync} onChange={(e) => setAllowSync(e.target.checked)} />
                Allow Downloads
              </label>
              <button className="btn-xs-outline border-rose-500/30 text-rose-300 hover:bg-rose-500/10" onClick={removeShare} disabled={saving}>
                Remove User
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-xs text-slate-400 bg-slate-900/50 border-b border-slate-800">Libraries</div>
                <div className="p-3 max-h-60 overflow-y-auto space-y-2">
                  {libsLoading && <div className="text-xs text-slate-500">Loading...</div>}
                  {!libsLoading && libsError && <div className="text-xs text-rose-400">{libsError}</div>}
                  {!libsLoading && !libsError && libs.length === 0 && <div className="text-xs text-slate-500">No libraries found.</div>}
                  {!libsLoading && libs.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                        onClick={() => {
                          const allSelected = libs.every(l => Boolean(selectedLibs[l.id]))
                          setSelectedLibs(prev => {
                            const next = { ...prev }
                            libs.forEach(l => { next[l.id] = !allSelected })
                            return next
                          })
                        }}
                      >
                        {libs.every(l => Boolean(selectedLibs[l.id])) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}
                  {libs.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedLibs[l.id])}
                        onChange={() => setSelectedLibs((p) => ({ ...p, [l.id]: !p[l.id] }))}
                      />
                      <span className="truncate" title={l.title}>{l.title}</span>
                      <span className="ml-auto text-[10px] text-slate-500">{l.type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-xs text-slate-400 bg-slate-900/50 border-b border-slate-800">Advanced Filters (optional)</div>
                <div className="p-3 space-y-2">
                  <input className="input" placeholder="filter_all" value={filters.filter_all} onChange={(e) => setFilters((p) => ({ ...p, filter_all: e.target.value }))} />
                  <input className="input" placeholder="filter_movies" value={filters.filter_movies} onChange={(e) => setFilters((p) => ({ ...p, filter_movies: e.target.value }))} />
                  <input className="input" placeholder="filter_television" value={filters.filter_television} onChange={(e) => setFilters((p) => ({ ...p, filter_television: e.target.value }))} />
                  <div className="text-[11px] text-slate-500">Leave blank to keep default. These map to Plex share filters.</div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-xs-outline" onClick={() => setManage(null)} disabled={saving}>Cancel</button>
              <button className="btn-xs-outline border-rose-500/30 text-rose-300 hover:bg-rose-500/10" onClick={forceRecreateShare} disabled={saving}>Force Recreate</button>
              <button className="btn-xs" onClick={saveManage} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlexToolsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4">
          <div className="glass border border-slate-700/50 rounded-2xl p-6">
            <div className="text-slate-300 text-sm">Loading...</div>
          </div>
        </div>
      }
    >
      <PlexToolsInner />
    </Suspense>
  )
}
