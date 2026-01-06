'use client'

import { useEffect, useMemo, useState } from 'react'
import { getStatus } from '@/lib/pricing'

type Customer = { id: string; full_name: string; email: string; status: string; next_due_date: string; plan?: string }

export default function AdminEmailPage(){
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<'all'|'active'|'inactive'|'due_soon'|'overdue'>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(()=>{ 
    loadCustomers()
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

  async function syncPlex() {
    setSyncing(true)
    setMsg('Syncing with Plex...')
    try {
      const res = await fetch('/api/admin/customers/sync-plex', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMsg(data.message || 'Sync successful')
        const recs: string[] = Array.isArray(data.emails) ? data.emails.filter(Boolean) : []
        if (recs.length > 0) {
          setSelected(prev => {
            const next = { ...prev }
            recs.forEach(e => next[e] = true)
            return next
          })
          setMsg(`Selected ${recs.length} recipients from Plex`)
        }
        await loadCustomers()
      } else {
        setMsg(data.error || 'Sync failed')
      }
    } catch (e: any) {
      setMsg(e.message || 'Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(''), 5000)
    }
  }

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const hasPlan = Boolean(c.plan)
      const rawStatus = (c.status === 'inactive') ? 'Inactive' : (hasPlan ? getStatus(new Date(c.next_due_date)) : 'Inactive')
      
      if (filter === 'all') return true
      if (filter === 'active') return rawStatus === 'Active'
      if (filter === 'inactive') return rawStatus === 'Inactive' || !hasPlan
      if (filter === 'due_soon') return rawStatus === 'Due Soon' || rawStatus === 'Due Today'
      if (filter === 'overdue') return rawStatus === 'Overdue'
      return true
    })
  }, [customers, filter])

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

  return (
    <main className="p-6 max-w-[95vw] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Email Center</h2>
        <div className="flex gap-3">
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
          <div className="glass p-4 rounded-t-2xl border-b-0 rounded-b-none z-10 relative">
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
                />
              </div>
              
              <div className="flex-1 flex flex-col">
                <label className="label mb-1">Message</label>
                <textarea 
                  className="input flex-1 resize-none font-mono text-sm" 
                  placeholder="Write your message here..." 
                  value={body} 
                  onChange={e=> setBody(e.target.value)} 
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
    </main>
  )
}

