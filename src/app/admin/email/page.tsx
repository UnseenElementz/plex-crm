'use client'

import { useEffect, useMemo, useState } from 'react'
import { getStatus } from '@/lib/pricing'
import { polishWritingDraft } from '@/lib/writingAssistant'

type Customer = { id: string; full_name: string; email: string; status: string; next_due_date: string; plan?: string; streams?: number }
type PlexLinkRow = {
  status: 'linked' | 'email_mismatch' | 'not_in_crm' | 'missing_plex_email'
  linked_by: 'email' | 'plex_username' | null
  recipient_email: string
  plex_email: string
  plex_username: string
  customer_id: string | null
  customer_email: string | null
  customer_name: string | null
}
type PlexPreview = {
  totals: { total: number; linked: number; mismatched: number; not_in_crm: number; missing_plex_email: number }
  rows: PlexLinkRow[]
  emails: string[]
}
type InboxMessage = {
  id: string
  uid: number
  fromEmail: string
  fromName: string
  subject: string
  date: string | null
  text: string
  html: string
  preview: string
  matchedCustomerEmail: string | null
  matchedCustomerName: string | null
  serviceScore: number
}

export default function AdminEmailPage(){
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<'all'|'active'|'inactive'|'due_soon'|'overdue'>('all')
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [plexPreview, setPlexPreview] = useState<PlexPreview | null>(null)
  const [showPlexPreview, setShowPlexPreview] = useState(false)
  const [plexFilter, setPlexFilter] = useState<'all'|'mismatch'|'not_in_crm'>('all')
  const [includeNotInCrm, setIncludeNotInCrm] = useState(false)
  const [confirmingSync, setConfirmingSync] = useState(false)
  const [inbox, setInbox] = useState<InboxMessage[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState('')
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null)

  useEffect(()=>{ 
    loadCustomers()
    loadInbox()
  },[])

  async function loadCustomers() {
    try{ 
      setLoading(true)
      const r = await fetch('/api/customers')
      if(r.ok){ 
        const d = await r.json()
        setCustomers(d || []) 
      } 
    } catch{} 
    finally { setLoading(false) }
  }

  async function loadInbox() {
    try {
      setInboxLoading(true)
      setInboxError('')
      const res = await fetch('/api/admin/email/inbox?serviceOnly=true&limit=40')
      const data = await res.json().catch(()=>({}))
      if (!res.ok) {
        setInboxError(data?.error || 'Failed to load inbox')
        setInbox([])
        return
      }
      const rows = Array.isArray(data?.messages) ? data.messages : []
      setInbox(rows)
      setSelectedInboxId((current) => current && rows.some((row: InboxMessage) => row.id === current) ? current : rows[0]?.id || null)
    } catch (e: any) {
      setInboxError(e?.message || 'Failed to load inbox')
      setInbox([])
    } finally {
      setInboxLoading(false)
    }
  }

  async function syncPlex() {
    setSyncing(true)
    setMsg('Loading Plex sync preview...')
    try {
      const res = await fetch('/api/admin/customers/sync-plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'email', action: 'preview' })
      })
      const data = await res.json().catch(()=>null)
      if (res.ok) {
        const preview: PlexPreview = {
          totals: data?.totals || { total: 0, linked: 0, mismatched: 0, not_in_crm: 0, missing_plex_email: 0 },
          rows: Array.isArray(data?.rows) ? data.rows : [],
          emails: Array.isArray(data?.emails) ? data.emails : []
        }
        setPlexPreview(preview)
        setPlexFilter('all')
        setIncludeNotInCrm(false)
        setShowPlexPreview(true)
        setMsg('')
      } else {
        setMsg(data?.error || 'Sync failed')
      }
    } catch (e: any) {
      setMsg(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(''), 5000)
    }
  }

  const previewRows = useMemo(() => {
    const rows = plexPreview?.rows || []
    if (plexFilter === 'mismatch') return rows.filter(r => r.status === 'email_mismatch')
    if (plexFilter === 'not_in_crm') return rows.filter(r => r.status === 'not_in_crm')
    return rows
  }, [plexPreview, plexFilter])

  async function confirmPlexSyncSelection(){
    const rows = plexPreview?.rows || []
    const eligible = rows.filter(r => r.status !== 'missing_plex_email')
    const picked = eligible.filter(r => r.status !== 'not_in_crm' || includeNotInCrm)
    const emails = Array.from(new Set(picked.map(r => String(r.recipient_email || '').trim()).filter(Boolean)))
    const mismatchRows = picked.filter(r => r.status === 'email_mismatch')
    const mismatchCustomerIds = mismatchRows.map(r => r.customer_id).filter(Boolean)

    setSelected(Object.fromEntries(emails.map(e => [e, true])))
    setShowPlexPreview(false)
    setMsg(`Selected ${emails.length} recipients from Plex. Mismatches: ${mismatchRows.length}. Not in CRM: ${picked.filter(r => r.status === 'not_in_crm').length}.`)

    setConfirmingSync(true)
    try {
      await fetch('/api/admin/customers/sync-plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'email',
          action: 'confirm',
          include_unmatched: includeNotInCrm,
          selected_count: emails.length,
          mismatch_count: mismatchRows.length,
          mismatch_customer_ids: mismatchCustomerIds
        })
      })
    } catch {}
    finally {
      setConfirmingSync(false)
    }
  }

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const hasPlan = Boolean(c.plan)
      const rawStatus = (c.status === 'inactive') ? 'Inactive' : (hasPlan ? getStatus(new Date(c.next_due_date)) : 'Inactive')
      
      const matchesSearch = (c.full_name + c.email).toLowerCase().includes(search.toLowerCase())
      if (!matchesSearch) return false

      if (filter === 'all') return true
      if (filter === 'active') return rawStatus === 'Active'
      if (filter === 'inactive') return rawStatus === 'Inactive' || !hasPlan
      if (filter === 'due_soon') return rawStatus === 'Due Soon' || rawStatus === 'Due Today'
      if (filter === 'overdue') return rawStatus === 'Overdue'
      return true
    })
  }, [customers, filter, search])

  const selectDueSoon2Months = () => {
    const twoMonthsFromNow = new Date()
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)
    const now = new Date()
    
    const next = { ...selected }
    customers.forEach(c => {
      if (!c.next_due_date) return
      const due = new Date(c.next_due_date)
      if (due >= now && due <= twoMonthsFromNow) {
        next[c.email] = true
      }
    })
    setSelected(next)
    setMsg(`Selected customers due within 2 months`)
    setTimeout(() => setMsg(''), 4000)
  }

  const selectByStreams = (minStreams: number, maxStreams?: number) => {
    const next = { ...selected }
    let count = 0
    customers.forEach(c => {
      // Need to cast c as any since Customer type might not have streams
      const streams = (c as any).streams || 0
      if (streams >= minStreams && (maxStreams === undefined || streams <= maxStreams)) {
        next[c.email] = true
        count++
      }
    })
    setSelected(next)
    setMsg(`Selected ${count} customers with ${maxStreams ? `${minStreams}-${maxStreams}` : `${minStreams}+`} streams`)
    setTimeout(() => setMsg(''), 4000)
  }

  const selectAll = useMemo(() => {
    return filtered.length > 0 && filtered.every(c => selected[c.email])
  }, [filtered, selected])

  function toggleAll() {
    if (selectAll) {
      const next = { ...selected }
      filtered.forEach(c => delete next[c.email])
      setSelected(next)
    } else {
      const next = { ...selected }
      filtered.forEach(c => next[c.email] = true)
      setSelected(next)
    }
  }

  function toggle(email: string){ 
    setSelected(s=> {
      const next = { ...s }
      if (next[email]) delete next[email]
      else next[email] = true
      return next
    }) 
  }

  async function send(){
    const recipients = Object.keys(selected)
    if (recipients.length === 0) { setMsg('No recipients selected'); return }
    
    setSending(true); setMsg('')
    try{
      const res = await fetch('/api/admin/email/custom', { 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify({ subject, body, mode: 'list', recipients }) 
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(data?.error || 'Failed to send'); return }
      setMsg(`Sent to ${data?.count || recipients.length} recipients`)
      setSelected({}); setSubject(''); setBody('')
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setSending(false); setTimeout(()=> setMsg(''), 4000) }
  }

  const selectedCount = Object.keys(selected).length
  const selectedInbox = useMemo(() => inbox.find(m => m.id === selectedInboxId) || null, [inbox, selectedInboxId])

  return (
    <main className="p-6 max-w-[95vw] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Email Center</h2>
        <div className="flex gap-3">
          <button 
            onClick={loadInbox} 
            disabled={inboxLoading}
            className="btn-ghost text-xs border border-slate-700 hover:bg-slate-800"
          >
            {inboxLoading ? 'Refreshing inbox...' : 'Refresh Inbox'}
          </button>
          <button 
            onClick={syncPlex} 
            disabled={syncing}
            className="btn-ghost text-xs border border-slate-700 hover:bg-slate-800"
          >
            {syncing ? 'Syncing...' : '↻ Sync Plex Users'}
          </button>
          <a href="/admin" className="btn-outline">← Back to Chat</a>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Sidebar / List */}
        <div className="lg:col-span-5 flex flex-col h-[calc(100vh-12rem)]">
          <div className="glass p-4 rounded-t-2xl border-b-0 rounded-b-none z-10 relative space-y-3">
            <input 
              className="input w-full text-sm" 
              placeholder="Search customers..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {(['all', 'active', 'inactive', 'due_soon', 'overdue'] as const).map(f => (
                <button 
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    filter === f 
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {f.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-xs-outline" onClick={selectDueSoon2Months}>Due Soon (2 Months)</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(1, 1)}>1 Stream</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(2, 2)}>2 Streams</button>
              <button className="btn-xs-outline" onClick={() => selectByStreams(3)}>3+ Streams</button>
              <button className="btn-xs-outline text-rose-400 border-rose-400/30" onClick={() => setSelected({})}>Clear All</button>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectAll} onChange={toggleAll} className="checkbox checkbox-xs checkbox-info" />
                <span className="text-sm text-slate-300">Select All ({filtered.length})</span>
              </label>
              <div className="text-xs text-slate-500">
                Total Selected: <span className="text-cyan-400 font-bold">{selectedCount}</span>
              </div>
            </div>
          </div>
          
          <div className="glass flex-1 overflow-y-auto p-2 space-y-1 rounded-b-2xl border-t-0 rounded-t-none">
            {loading && <div className="text-center p-4 text-slate-500">Loading...</div>}
            {!loading && filtered.length === 0 && <div className="text-center p-4 text-slate-500">No customers found</div>}
            {filtered.map(c => (
              <div 
                key={c.id} 
                onClick={() => toggle(c.email)}
                className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors border ${
                  selected[c.email] 
                    ? 'bg-cyan-900/20 border-cyan-500/30' 
                    : 'bg-slate-800/20 border-transparent hover:bg-slate-800/40'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={!!selected[c.email]} 
                  onChange={() => {}} // Handled by div click
                  className="checkbox checkbox-xs checkbox-info"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <div className="font-medium text-slate-200 truncate text-sm">{c.full_name}</div>
                    <div className="text-[10px] text-slate-500">{c.status === 'inactive' ? 'Inactive' : (c.plan ? 'Active' : 'No Plan')}</div>
                  </div>
                  <div className="text-xs text-slate-400 truncate">{c.email}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compose Area */}
        <div className="lg:col-span-7 h-[calc(100vh-12rem)]">
          <div className="glass p-6 rounded-2xl h-full flex flex-col">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Compose Message</h3>
            <div className="space-y-4 flex-1 flex flex-col">
              <div>
                <label className="label mb-1">Recipients</label>
                <div className="input flex items-center text-sm text-slate-300 bg-slate-900/40">
                  {selectedCount === 0 
                    ? 'No recipients selected' 
                    : `${selectedCount} recipient${selectedCount !== 1 ? 's' : ''} selected`
                  }
                </div>
              </div>

              <div>
                <label className="label mb-1">Subject</label>
                <input 
                  className="input" 
                  placeholder="Important Update..." 
                  value={subject} 
                  onChange={e=> setSubject(e.target.value)} 
                  spellCheck
                />
              </div>
              
              <div className="flex-1 flex flex-col">
                <label className="label mb-1">Message</label>
                <textarea 
                  className="input flex-1 resize-none font-mono text-sm" 
                  placeholder="Write your message here..." 
                  value={body} 
                  onChange={e=> setBody(e.target.value)} 
                  spellCheck
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-sm">
                  {msg && (
                    <span className={`${msg.startsWith('Sent') ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {msg}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-outline px-5"
                    onClick={() => {
                      setSubject((current) => polishWritingDraft(current))
                      setBody((current) => polishWritingDraft(current))
                    }}
                    disabled={!subject && !body}
                  >
                    Polish Draft
                  </button>
                  <button 
                    className="btn px-8" 
                    onClick={send} 
                    disabled={sending || !subject || !body || selectedCount === 0}
                  >
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-5">
          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Customer Reply Inbox</h3>
                <p className="text-xs text-slate-400">Matched to CRM emails and filtered by service-related keywords.</p>
              </div>
              <div className="text-xs text-cyan-300">{inbox.length} found</div>
            </div>
            <div className="max-h-[34rem] overflow-y-auto">
              {inboxLoading && <div className="p-4 text-sm text-slate-400">Loading inbox...</div>}
              {!inboxLoading && inboxError && <div className="p-4 text-sm text-rose-400">{inboxError}</div>}
              {!inboxLoading && !inboxError && inbox.length === 0 && (
                <div className="p-4 text-sm text-slate-500">No matched service replies found.</div>
              )}
              {inbox.map(mail => (
                <button
                  key={mail.id}
                  onClick={() => setSelectedInboxId(mail.id)}
                  className={`w-full text-left p-4 border-b border-slate-800/60 transition-colors ${
                    selectedInboxId === mail.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-200 truncate">{mail.matchedCustomerName || mail.fromName || mail.fromEmail}</div>
                    <div className="text-[10px] text-slate-500 whitespace-nowrap">score {mail.serviceScore}</div>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-1">{mail.subject || '(No subject)'}</div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {mail.fromEmail}
                    {mail.date ? ` • ${new Date(mail.date).toLocaleString('en-GB')}` : ''}
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2 mt-2">{mail.preview}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="glass rounded-2xl h-full min-h-[24rem] flex flex-col">
            <div className="p-4 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-slate-200">Reply Preview</h3>
              <p className="text-xs text-slate-400">Only emails from known customers with likely service-related content are shown here.</p>
            </div>
            {!selectedInbox ? (
              <div className="p-6 text-sm text-slate-500">Select a customer email reply to view it.</div>
            ) : (
              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="glass p-4 rounded-xl">
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Customer</div>
                    <div className="text-slate-200 font-medium mt-1">{selectedInbox.matchedCustomerName || 'Unknown customer'}</div>
                    <div className="text-sm text-slate-400 mt-1">{selectedInbox.matchedCustomerEmail || selectedInbox.fromEmail}</div>
                  </div>
                  <div className="glass p-4 rounded-xl">
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Email Match</div>
                    <div className="text-slate-200 font-medium mt-1">{selectedInbox.fromEmail}</div>
                    <div className="text-sm text-cyan-300 mt-1">Service score: {selectedInbox.serviceScore}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Subject</div>
                  <div className="text-slate-100 text-lg mt-1">{selectedInbox.subject || '(No subject)'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Message</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300 bg-slate-900/40 rounded-xl p-4 border border-slate-800">
                    {selectedInbox.text || selectedInbox.preview || 'No plain text body found.'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedInbox.matchedCustomerEmail && (
                    <button
                      className="btn-xs"
                      onClick={() => setSelected(s => ({ ...s, [selectedInbox.matchedCustomerEmail as string]: true }))}
                    >
                      Select customer in composer
                    </button>
                  )}
                  <button className="btn-xs-outline" onClick={() => { setSubject(selectedInbox.subject ? `Re: ${selectedInbox.subject}` : 'Re: Your message'); setBody(`Hi ${selectedInbox.matchedCustomerName || ''},\n\n`); }}>
                    Start reply draft
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showPlexPreview && plexPreview && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-4 rounded-xl w-full max-w-3xl border border-cyan-500/30 bg-slate-900/80 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold text-slate-200">Plex Sync Preview</div>
              <button className="btn-xs-outline" onClick={()=> setShowPlexPreview(false)} disabled={confirmingSync}>Close</button>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="glass p-2 rounded-lg border border-slate-700">
                <div className="text-slate-400">Total</div>
                <div className="text-slate-200 font-semibold">{plexPreview.totals.total}</div>
              </div>
              <div className="glass p-2 rounded-lg border border-emerald-500/20">
                <div className="text-slate-400">Linked</div>
                <div className="text-emerald-300 font-semibold">{plexPreview.totals.linked}</div>
              </div>
              <div className="glass p-2 rounded-lg border border-amber-500/20">
                <div className="text-slate-400">Email Mismatch</div>
                <div className="text-amber-300 font-semibold">{plexPreview.totals.mismatched}</div>
              </div>
              <div className="glass p-2 rounded-lg border border-rose-500/20">
                <div className="text-slate-400">Not In CRM</div>
                <div className="text-rose-300 font-semibold">{plexPreview.totals.not_in_crm}</div>
              </div>
              <div className="glass p-2 rounded-lg border border-slate-700">
                <div className="text-slate-400">Missing Email</div>
                <div className="text-slate-200 font-semibold">{plexPreview.totals.missing_plex_email}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={`btn-xs-outline ${plexFilter==='all'?'border-cyan-500/50 text-cyan-300':''}`} onClick={()=> setPlexFilter('all')}>All</button>
              <button className={`btn-xs-outline ${plexFilter==='mismatch'?'border-amber-500/50 text-amber-300':''}`} onClick={()=> setPlexFilter('mismatch')}>Email Mismatch</button>
              <button className={`btn-xs-outline ${plexFilter==='not_in_crm'?'border-rose-500/50 text-rose-300':''}`} onClick={()=> setPlexFilter('not_in_crm')}>Not In CRM</button>
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="checkbox checkbox-xs checkbox-info" checked={includeNotInCrm} onChange={e=> setIncludeNotInCrm(e.target.checked)} />
                Include not-in-CRM
              </label>
            </div>

            <div className="mt-3 overflow-y-auto max-h-[48vh] border border-slate-700 rounded-lg">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-slate-400 border-b border-slate-700 bg-slate-900/40">
                <div className="col-span-2">Status</div>
                <div className="col-span-3">Plex Username</div>
                <div className="col-span-3">Plex Email</div>
                <div className="col-span-4">Customer Email</div>
              </div>
              {previewRows.map((r, idx)=> (
                <div key={r.plex_email + ':' + r.plex_username + ':' + idx} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-800">
                  <div className="col-span-2">
                    {r.status === 'linked' && <span className="text-emerald-300">Linked</span>}
                    {r.status === 'email_mismatch' && <span className="text-amber-300">Mismatch</span>}
                    {r.status === 'not_in_crm' && <span className="text-rose-300">Not In CRM</span>}
                    {r.status === 'missing_plex_email' && <span className="text-slate-400">Missing Email</span>}
                  </div>
                  <div className="col-span-3 truncate text-slate-200">{r.plex_username || '-'}</div>
                  <div className="col-span-3 truncate text-slate-200">{r.plex_email || '-'}</div>
                  <div className="col-span-4 truncate text-slate-200">
                    {r.customer_email || (r.status === 'not_in_crm' ? '-' : '')}
                    {r.status === 'email_mismatch' && r.linked_by && (
                      <span className="ml-2 text-[10px] text-slate-500">({r.linked_by})</span>
                    )}
                  </div>
                </div>
              ))}
              {previewRows.length === 0 && (
                <div className="p-4 text-sm text-slate-400">No rows</div>
              )}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-xs-outline" onClick={()=> setShowPlexPreview(false)} disabled={confirmingSync}>Cancel</button>
              <button className="btn-xs" onClick={confirmPlexSyncSelection} disabled={confirmingSync}>
                {confirmingSync ? 'Confirming...' : 'Confirm & Select'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

