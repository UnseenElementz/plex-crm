"use client"
import { useEffect, useMemo, useState } from 'react'
import CustomerForm from '@/components/CustomerForm'
import { calculatePrice, getStatus } from '@/lib/pricing'
import { format } from 'date-fns'
type Customer = { id: string; full_name: string; email: string; plan: 'monthly'|'yearly'; streams: number; next_due_date: string; start_date?: string; plex_username?: string; status?: 'active'|'inactive'; downloads?: boolean }

export default function AdminCustomersPage(){
  // Single effect: ensure session then load customers (dev auto-login, prod redirect)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'inactive'|'due_soon'|'overdue'|'registered'>('all')
  const [sortBy, setSortBy] = useState<'none'|'newest'|'oldest'|'price_high'|'price_low'|'streams_high'|'streams_low'|'due_soon'>('none')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [sendMsg, setSendMsg] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [linkingItem, setLinkingItem] = useState<Customer | null>(null)
  const [linkInput, setLinkInput] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [unmatchedPlex, setUnmatchedPlex] = useState<Array<{ id: string; username: string; email: string; thumb: string }>>([])
  const [linkUnmatchedModal, setLinkUnmatchedModal] = useState<{ id: string; username: string } | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkActionMsg, setBulkActionMsg] = useState('')
  const [isBulkLoading, setIsBulkLoading] = useState(false)

  const loadCustomers = async () => {
    try{ 
      setLoading(true); 
      let ok = false
      try{ const s = await fetch('/api/admin/auth/session', { cache: 'no-store' }); ok = s.ok } catch{}
      if (!ok){
        const isProd = process.env.NODE_ENV === 'production'
        if (!isProd){
          try{
            const raw = typeof document !== 'undefined' ? (document.cookie.split(';').map(s=>s.trim()).find(s=> s.startsWith('admin_settings=')) || '').split('=')[1] : ''
            const data = raw ? JSON.parse(decodeURIComponent(raw)) : {}
            const u = (data?.admin_user || 'Anfrax786') as string
            const p = (data?.admin_pass || 'Badaman1') as string
            await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: u, password: p }) })
            const s2 = await fetch('/api/admin/auth/session', { cache: 'no-store' }); ok = s2.ok
            if (!ok){
              try{ await fetch('/dev-login') } catch{}
              const s3 = await fetch('/api/admin/auth/session', { cache: 'no-store' }); ok = s3.ok
            }
          } catch{}
        }
      }
      if (!ok){
        const isProd = process.env.NODE_ENV === 'production'
        if (isProd){ location.href = '/login'; return }
        throw new Error('Unauthorized')
      }
      const res = await fetch('/api/customers'); 
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to load customers' }));
        throw new Error(errorData?.error || 'Failed to load customers');
      }
      const data = await res.json();
      setCustomers(data);
    } catch(e: any){ 
      setError(e?.message || 'Failed to load customers');
      console.error('Error loading customers:', e);
    } finally{ 
      setLoading(false) 
    } 
  }

  useEffect(()=>{ loadCustomers() }, [])

  useEffect(()=>{ (async()=>{
    try{
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      if (res.ok){
        const data = await res.json()
        setPricingConfig(data)
      }
    }catch{}
  })() }, [])

  const syncPlex = async () => {
    setSyncing(true)
    setUnmatchedPlex([])
    try {
      const res = await fetch('/api/admin/plex/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const total = data.total_friends ?? 0
        const count = data.count ?? 0
        
        if (data.unmatched_friends && data.unmatched_friends.length > 0) {
           setUnmatchedPlex(data.unmatched_friends)
        } else {
           alert(`Synced! Updated ${count} customers. Total Plex Friends: ${total}`)
        }
        loadCustomers()
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function linkUnmatched(plexUser: { username: string }, customerId: string){
    if (!customerId) return
    try {
      await saveLink({ id: customerId }, plexUser.username, setCustomers, setSendMsg, () => {})
      setUnmatchedPlex(prev => prev.filter(u => u.username !== plexUser.username))
      setLinkUnmatchedModal(null)
      setSelectedCustomerId('')
    } catch {}
  }

  const filtered = useMemo(()=> {
    const list = customers.filter(c=>{
      const matchesText = (c.full_name+c.email+(c.plex_username||'')).toLowerCase().includes(q.toLowerCase())
      if (!matchesText) return false
      if (statusFilter === 'all') return true
      const hasPlan = Boolean(c.plan)
      if (statusFilter === 'registered') return !hasPlan
      const statusLabel = (c.status === 'inactive') ? 'Inactive' : (hasPlan ? getStatus(new Date(c.next_due_date)) : 'Registered')
      if (statusFilter === 'inactive') return statusLabel === 'Inactive'
      if (statusFilter === 'active') return statusLabel === 'Active'
      if (statusFilter === 'due_soon') return statusLabel === 'Due Soon' || statusLabel === 'Due Today'
      if (statusFilter === 'overdue') return statusLabel === 'Overdue'
      return true
    })
    const sorted = [...list]
    if (sortBy === 'newest') sorted.sort((a,b)=> new Date(b.start_date||0).getTime() - new Date(a.start_date||0).getTime())
    else if (sortBy === 'oldest') sorted.sort((a,b)=> new Date(a.start_date||0).getTime() - new Date(b.start_date||0).getTime())
    else if (sortBy === 'price_high') sorted.sort((a,b)=> calculatePrice(b.plan as any, b.streams, pricingConfig) - calculatePrice(a.plan as any, a.streams, pricingConfig))
    else if (sortBy === 'price_low') sorted.sort((a,b)=> calculatePrice(a.plan as any, a.streams, pricingConfig) - calculatePrice(b.plan as any, b.streams, pricingConfig))
    else if (sortBy === 'streams_high') sorted.sort((a,b)=> b.streams - a.streams)
    else if (sortBy === 'streams_low') sorted.sort((a,b)=> a.streams - b.streams)
    else if (sortBy === 'due_soon') sorted.sort((a,b)=> new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime())
    return sorted
  }, [customers, q, statusFilter, sortBy, pricingConfig])

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map(c => c.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleBulkReminder() {
    if (selectedIds.length === 0) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Sending reminders to ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    
    const selectedCustomers = customers.filter(c => selectedIds.includes(c.id))
    
    for (const c of selectedCustomers) {
      try {
        const res = await fetch('/api/reminders/send', { 
          method:'POST', 
          headers:{ 'Content-Type':'application/json' }, 
          body: JSON.stringify({ email: c.email }) 
        })
        if (res.ok) successCount++
        else failCount++
      } catch {
        failCount++
      }
    }
    
    setBulkActionMsg(`Bulk Action: ${successCount} sent, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkStatus(status: 'active' | 'inactive') {
    if (selectedIds.length === 0) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Updating status for ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/customers/${id}`, { 
          method:'PATCH', 
          headers:{ 'Content-Type':'application/json' }, 
          body: JSON.stringify({ subscription_status: status }) 
        })
        if (res.ok) {
          setCustomers(prev => prev.map(c => c.id === id ? { ...c, status } : c))
          successCount++
        } else failCount++
      } catch {
        failCount++
      }
    }
    
    setBulkActionMsg(`Bulk Action: ${successCount} updated, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} customers? This cannot be undone.`)) return
    
    setIsBulkLoading(true)
    setBulkActionMsg(`Deleting ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
        if (res.ok) {
          setCustomers(prev => prev.filter(c => c.id !== id))
          successCount++
        } else failCount++
      } catch {
        failCount++
      }
    }
    
    setBulkActionMsg(`Bulk Action: ${successCount} deleted, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkTranscode() {
    if (selectedIds.length === 0) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Sending over-stream warnings to ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    const selectedCustomers = customers.filter(c => selectedIds.includes(c.id))
    for (const c of selectedCustomers) {
      try {
        const res = await fetch('/api/warnings/transcode', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: c.email }) })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkActionMsg(`Bulk Action: ${successCount} warnings sent, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkSignedUp() {
    if (selectedIds.length === 0) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Sending setup instructions to ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    const selectedCustomers = customers.filter(c => selectedIds.includes(c.id))
    for (const c of selectedCustomers) {
      try {
        const res = await fetch('/api/onboarding/signed-up', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: c.email }) })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkActionMsg(`Bulk Action: ${successCount} setup emails sent, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkChargebackBan() {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure? This will BAN ${selectedIds.length} users and send termination emails.`)) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Banning ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    const selectedCustomers = customers.filter(c => selectedIds.includes(c.id))
    for (const c of selectedCustomers) {
      try {
        const res = await fetch('/api/warnings/chargeback', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: c.email }) })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkActionMsg(`Bulk Action: ${successCount} users banned, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    loadCustomers()
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  async function handleBulkTwoYears() {
    if (selectedIds.length === 0) return
    setIsBulkLoading(true)
    setBulkActionMsg(`Sending service updates to ${selectedIds.length} customers...`)
    let successCount = 0
    let failCount = 0
    const selectedCustomers = customers.filter(c => selectedIds.includes(c.id))
    for (const c of selectedCustomers) {
      try {
        const res = await fetch('/api/admin/email/two-years', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: c.email }) })
        if (res.ok) successCount++
        else failCount++
      } catch { failCount++ }
    }
    setBulkActionMsg(`Bulk Action: ${successCount} updates sent, ${failCount} failed.`)
    setIsBulkLoading(false)
    setSelectedIds([])
    setTimeout(() => setBulkActionMsg(''), 5000)
  }

  
  return (
    <main className="p-6 max-w-[95vw] mx-auto">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold gradient-text shrink-0">Customers</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <button 
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 font-medium hover:bg-cyan-500/10 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all duration-300 backdrop-blur-md" 
            onClick={syncPlex} 
            disabled={syncing}
          >
            {syncing ? <span className="loading loading-spinner loading-xs"></span> : '↻'} 
            <span>Sync Plex</span>
          </button>
          <a 
            href="/admin" 
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-600/50 text-slate-300 font-medium hover:bg-slate-800/80 hover:border-slate-400 hover:text-white transition-all duration-300 backdrop-blur-md"
          >
            <span>←</span> Chat
          </a>
          <input 
            className="input w-64" 
            placeholder="Search customers..."  
            value={q} 
            onChange={e=>setQ(e.target.value)} 
          />
          <select className="input w-40 max-w-[40vw]" value={statusFilter} onChange={e=> setStatusFilter(e.target.value as any)}>
            <option value="all">All</option>
            <option value="due_soon">Due Soon</option>
            <option value="overdue">Overdue</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="registered">Registered</option>
          </select>
          <select className="input w-48 max-w-[40vw]" value={sortBy} onChange={e=> setSortBy(e.target.value as any)}>
            <option value="none">Sort: Default</option>
            <option value="newest">Newest signup</option>
            <option value="oldest">Oldest signup</option>
            <option value="price_high">Highest price</option>
            <option value="price_low">Lowest price</option>
            <option value="streams_high">Most streams</option>
            <option value="streams_low">Least streams</option>
            <option value="due_soon">Due soon first</option>
          </select>
          <button 
            className="btn" 
            onClick={()=>{ setEditItem(null); setShowForm(true) }}
          >
            Add customer
          </button>
          <a 
            className="btn-outline" 
            href="/api/export/csv" 
            target="_blank"
          >
            Export CSV
          </a>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-cyan-500/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="card-title">{editItem ? 'Edit customer' : 'Add customer'}</h3>
              <button className="btn-xs-outline" onClick={()=>{ setEditItem(null); setShowForm(false) }}>✕</button>
            </div>
            <CustomerForm onSaved={(c)=>{ 
              if (editItem) { 
                setCustomers(prev=>prev.map(p=> p.id===c.id? c : p)); 
                setEditItem(null) 
              } else { 
                setCustomers(prev=>[...prev, c]) 
              } 
              setShowForm(false) 
            }} 
            onCancel={()=>{ setEditItem(null); setShowForm(false) }}
            initial={editItem || undefined} />
          </div>
        </div>
      )}

      {unmatchedPlex.length > 0 && (
        <div className="card-solid p-6 rounded-2xl border border-amber-500/20 mb-6">
          <h3 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
            ⚠️ Unmatched Plex Users ({unmatchedPlex.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unmatchedPlex.map(u => (
              <div key={u.id} className="glass p-3 rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-200 truncate">{u.username}</div>
                  <div className="text-xs text-slate-500 truncate">{u.email}</div>
                </div>
                <button 
                  className="btn-xs-outline whitespace-nowrap"
                  onClick={()=> setLinkUnmatchedModal(u)}
                >Link to Customer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {bulkActionMsg && (
        <div className={`p-4 rounded-xl mb-6 flex items-center justify-between ${bulkActionMsg.includes('failed') ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
          <div className="flex items-center gap-2">
            {isBulkLoading && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>}
            <span>{bulkActionMsg}</span>
          </div>
          {!isBulkLoading && <button className="text-xs opacity-50 hover:opacity-100" onClick={() => setBulkActionMsg('')}>✕</button>}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="glass p-4 rounded-2xl mb-6 border border-cyan-500/30 flex items-center justify-between sticky top-4 z-40 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="bg-cyan-500/20 px-3 py-1 rounded-full border border-cyan-500/30 text-cyan-400 text-sm font-bold">
              {selectedIds.length} Selected
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button 
                className="btn-xs bg-cyan-600 hover:bg-cyan-500 text-white" 
                onClick={handleBulkReminder}
                disabled={isBulkLoading}
              >Send Reminders</button>
              <button 
                className="btn-xs-outline" 
                onClick={handleBulkTranscode}
                disabled={isBulkLoading}
              >Over Stream Warning</button>
              <button 
                className="btn-xs-outline" 
                onClick={handleBulkSignedUp}
                disabled={isBulkLoading}
              >Signed Up</button>
              <button 
                className="btn-xs-outline" 
                onClick={handleBulkTwoYears}
                disabled={isBulkLoading}
              >2 Years</button>
              <button 
                className="btn-xs-outline" 
                onClick={() => handleBulkStatus('active')}
                disabled={isBulkLoading}
              >Set Active</button>
              <button 
                className="btn-xs-outline" 
                onClick={() => handleBulkStatus('inactive')}
                disabled={isBulkLoading}
              >Set Inactive</button>
              <button 
                className="btn-xs-outline text-rose-400 border-rose-400/30 hover:bg-rose-500/10" 
                onClick={handleBulkChargebackBan}
                disabled={isBulkLoading}
              >Ban & Chargeback</button>
              <button 
                className="btn-xs-outline text-rose-400 border-rose-400/30 hover:bg-rose-500/10" 
                onClick={handleBulkDelete}
                disabled={isBulkLoading}
              >Delete</button>
            </div>
          </div>
          <button className="btn-xs-outline" onClick={() => setSelectedIds([])}>Deselect All</button>
        </div>
      )}

      <div className="card-solid p-6 rounded-2xl border border-cyan-500/10">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-slate-400 text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
              Loading customers...
            </div>
          </div>
        )}
        {error && (
          <div className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-4 mb-4">
            <div className="text-rose-400 text-sm font-medium">{error}</div>
          </div>
        )}
        {sendMsg && (
          <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3 mb-4">
            <div className="text-cyan-400 text-sm">{sendMsg}</div>
          </div>
        )}
        
        {!loading && !error && (
          <div className="overflow-visible min-h-[400px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-700/50">
                  <th className="p-1.5 w-8">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-xs checkbox-info" 
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-1.5 font-medium">Name</th>
                  <th className="p-1.5 font-medium">Email / Plex</th>
                  <th className="p-1.5 font-medium">Plan</th>
                  <th className="p-1.5 font-medium">Streams</th>
                  <th className="p-1.5 font-medium">Price</th>
                  <th className="p-1.5 font-medium">Status</th>
                  <th className="p-1.5 font-medium">End Date</th>
                  <th className="p-1.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const hasPlan = Boolean(c.plan)
                  const price = hasPlan ? calculatePrice(c.plan as any, c.streams, pricingConfig, c.downloads) : null
                  const statusLabel = !hasPlan ? 'Registered' : ((c.status === 'inactive') ? 'Inactive' : getStatus(new Date(c.next_due_date)))
                  return (
                    <tr key={c.id} className={`border-b border-slate-800/30 hover:bg-slate-800/30 transition-all duration-200 group ${selectedIds.includes(c.id) ? 'bg-cyan-900/10' : ''}`}>
                      <td className="p-1.5">
                        <input 
                          type="checkbox" 
                          className="checkbox checkbox-xs checkbox-info" 
                          checked={selectedIds.includes(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </td>
                      <td className="p-1.5">
                        <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                          {c.full_name}
                        </div>
                      </td>
                      <td className="p-1.5 text-slate-400">
                        <div>{c.email}</div>
                        {c.plex_username && <div className="text-slate-500 text-xs">Plex: {c.plex_username}</div>}
                      </td>
                      <td className="p-1.5">
                        {hasPlan ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">
                            {c.plan}
                          </span>
                        ) : (
                          <div className="text-slate-400 text-xs">
                            <div>Registered: {c.start_date ? format(new Date(c.start_date), 'dd.MM.yyyy') : '-'}</div>
                            <div>End: {c.next_due_date ? format(new Date(c.next_due_date), 'dd.MM.yyyy') : '-'}</div>
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 text-slate-400">{c.streams}</td>
                      <td className="p-1.5 font-medium text-slate-200">{price !== null ? `£${price.toFixed(2)}` : '—'}</td>
                      <td className="p-1.5">
                        <span className={`tag ${statusLabel.toLowerCase().replace(' ','-')}`}>{statusLabel}</span>
                      </td>
                      <td className="p-1.5 text-slate-400">
                        {c.next_due_date ? format(new Date(c.next_due_date), 'dd.MM.yyyy') : '-'}
                      </td>
                      <td className="p-1.5">
                        <div className="relative inline-block">
                          <button
                            className="btn-xs"
                            onClick={()=> setOpenActionsId(openActionsId===c.id ? null : c.id)}
                          >Actions</button>
                          {openActionsId===c.id && (
                            <>
                            <div 
                              className="absolute right-0 mt-1 card-solid p-2 rounded-lg border border-cyan-500/20 z-10 w-44 space-y-2 actions-menu max-h-60 overflow-y-auto"
                              style={{ top: '100%', right: 0 }}
                            >
                              <div className="flex justify-end sticky top-0 bg-[#0f172a] pb-2 pt-1 -mx-2 px-2 z-20 border-b border-slate-700/50 mb-2">
                                <button className="btn-xs-outline" onClick={(e)=>{ e.stopPropagation(); setOpenActionsId(null) }}>✕</button>
                              </div>
                              <button
                                className="btn-xs w-full"
                                onClick={()=>{ setEditItem(c); setShowForm(true); setOpenActionsId(null) }}
                              >Edit</button>
                              <button
                                className="btn-xs-outline w-full"
                                onClick={()=>{ toggleStatus(c, setCustomers, setSendMsg); setOpenActionsId(null) }}
                              >{c.status === 'inactive' ? 'Set Active' : 'Set Inactive'}</button>
                              <button
                                className="btn-xs-outline w-full"
                                disabled={sendingEmail===c.email}
                                onClick={()=>{ sendReminder(c.email, setSendingEmail, setSendMsg); setOpenActionsId(null) }}
                              >{sendingEmail===c.email ? 'Sending...' : 'Send Reminder'}</button>
                              <button
                                className="btn-xs-outline w-full"
                                onClick={()=>{ sendTranscode(c.email, setSendingEmail, setSendMsg); setOpenActionsId(null) }}
                              >Over Stream Warning</button>
                              <button
                                className="btn-xs-outline w-full text-rose-400 hover:text-rose-300 hover:border-rose-400"
                                 onClick={()=>{ sendChargebackBan(c.email, setSendingEmail, setSendMsg, loadCustomers); setOpenActionsId(null) }}
                               >Ban & Chargeback Notice</button>
                          <button
                            className="btn-xs-outline w-full"
                            onClick={()=>{ setLinkingItem(c); setLinkInput(c.plex_username || ''); setOpenActionsId(null) }}
                          >Link Plex Username</button>
                          <a
                            className="btn-xs-outline w-full text-center"
                            href={`/admin/plex-tools?email=${encodeURIComponent(c.email || '')}`}
                            onClick={()=> setOpenActionsId(null)}
                          >Manage Plex</a>
                          <button
                            className="btn-xs-outline w-full"
                            disabled={sendingEmail===c.email}
                            onClick={()=>{ sendTwoYears(c.email, setSendingEmail, setSendMsg); setOpenActionsId(null) }}
                          >{sendingEmail===c.email ? 'Sending...' : '2 years'}</button>
                              <button
                                className="btn-xs-outline w-full"
                                disabled={sendingEmail===c.email}
                                onClick={()=>{ sendSignedUp(c.email, setSendingEmail, setSendMsg); setOpenActionsId(null) }}
                              >{sendingEmail===c.email ? 'Sending...' : 'Signed up'}</button>
                              <button
                                className="btn-xs-outline w-full"
                                disabled={deletingId === c.id}
                                onClick={()=>{ setPendingDelete(c); setOpenActionsId(null) }}
                              >{deletingId === c.id ? 'Deleting...' : 'Delete'}</button>
                            </div>
                            <div className="fixed inset-0" onClick={()=> setOpenActionsId(null)} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {pendingDelete && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div className="glass p-6 rounded-2xl w-full max-w-md border border-rose-500/30">
              <div className="text-lg font-semibold text-slate-200 mb-2">Delete customer?</div>
              <div className="text-slate-400 text-sm mb-4">This action cannot be undone.</div>
              <div className="flex justify-end gap-2">
                <button className="btn-outline" onClick={()=> setPendingDelete(null)}>Cancel</button>
                <button className="btn" onClick={()=> confirmDelete(pendingDelete as any, setDeletingId, setPendingDelete, setCustomers, setSendMsg)}>Delete</button>
              </div>
            </div>
          </div>
        )}
        {linkingItem && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div className="glass p-6 rounded-2xl w-full max-w-md border border-cyan-500/30">
              <div className="text-lg font-semibold text-slate-200 mb-2">Link Plex Username</div>
              <div className="text-slate-400 text-sm mb-4">Enter the Plex username to link to this customer.</div>
              <input className="input w-full mb-4" placeholder="Plex Username" value={linkInput} onChange={e=> setLinkInput(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className="btn-outline" onClick={()=>{ setLinkingItem(null); setLinkInput('') }}>Cancel</button>
                <button className="btn" onClick={()=> saveLink(linkingItem as any, linkInput, setCustomers, setSendMsg, setLinkingItem)}>Save</button>
              </div>
            </div>
          </div>
        )}
        {linkUnmatchedModal && (
          <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div className="glass p-6 rounded-2xl w-full max-w-md border border-cyan-500/30">
              <div className="text-lg font-semibold text-slate-200 mb-2">Link Plex User: <span className="text-cyan-400">{linkUnmatchedModal.username}</span></div>
              <div className="text-slate-400 text-sm mb-4">Select a customer to link this Plex account to.</div>
              
              <div className="mb-4">
                <input 
                  className="input w-full mb-2" 
                  placeholder="Search customers..." 
                  value={q} 
                  onChange={e => setQ(e.target.value)} 
                />
                <div className="max-h-60 overflow-y-auto space-y-1 border border-slate-700/50 rounded p-1">
                  {filtered.map(c => (
                    <div 
                      key={c.id} 
                      className={`p-2 rounded cursor-pointer text-sm flex justify-between items-center ${selectedCustomerId === c.id ? 'bg-cyan-900/40 text-cyan-300' : 'hover:bg-slate-800/50 text-slate-300'}`}
                      onClick={() => setSelectedCustomerId(c.id)}
                    >
                      <div>
                        <div className="font-medium">{c.full_name}</div>
                        <div className="text-xs text-slate-500">{c.email}</div>
                      </div>
                      {c.plex_username && <div className="text-xs text-amber-500">Already linked: {c.plex_username}</div>}
                    </div>
                  ))}
                  {filtered.length === 0 && <div className="p-2 text-slate-500 text-xs">No customers found</div>}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button className="btn-outline" onClick={()=>{ setLinkUnmatchedModal(null); setSelectedCustomerId('') }}>Cancel</button>
                <button 
                  className="btn" 
                  disabled={!selectedCustomerId}
                  onClick={()=> linkUnmatched(linkUnmatchedModal, selectedCustomerId)}
                >Link Customer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

async function sendReminder(email: string, setSendingEmail: (v: string | null)=>void, setSendMsg: (v: string)=>void){
  try{
    setSendingEmail(email)
    setSendMsg('Sending reminder...')
    const res = await fetch('/api/reminders/send', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json()
    if (!res.ok){ 
      const errorMsg = data?.error || 'Unknown error'
      if (errorMsg.includes('SMTP not configured')) {
        setSendMsg('Email service not configured. Please contact admin.')
      } else {
        setSendMsg(`Failed: ${errorMsg}`)
      }
    }
    else { setSendMsg('Reminder sent successfully!') }
  } catch(e: any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally { 
    setSendingEmail(null)
    // Clear message after 5 seconds
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function sendTranscode(email: string, setSendingEmail: (v: string | null)=>void, setSendMsg: (v: string)=>void){
  try{
    setSendingEmail(email)
    setSendMsg('Sending over-stream warning...')
    const res = await fetch('/api/warnings/transcode', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json()
    if (!res.ok){
      const errorMsg = data?.error || 'Unknown error'
      if (errorMsg.includes('SMTP not configured')) {
        setSendMsg('Email service not configured. Please contact admin.')
      } else {
        setSendMsg(`Failed: ${errorMsg}`)
      }
    } else {
      setSendMsg('Over-stream warning sent successfully!')
    }
  } catch(e: any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally{ setSendingEmail(null); setTimeout(()=> setSendMsg(''), 5000) }
}

async function sendChargebackBan(email: string, setSendingEmail: (v: string | null)=>void, setSendMsg: (v: string)=>void, refreshCustomers?: () => void){
  if (!confirm('Are you sure? This will BAN the user and send a termination email.')) return
  try{
    setSendingEmail(email)
    setSendMsg('Sending ban notice...')
    const res = await fetch('/api/warnings/chargeback', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json()
    if (!res.ok){
      const errorMsg = data?.error || 'Unknown error'
      if (String(errorMsg).includes('SMTP not configured')) {
        setSendMsg('Email service not configured. Please contact admin.')
      } else {
        setSendMsg(`Failed: ${errorMsg}`)
      }
    } else {
      setSendMsg('User banned and notice sent!')
      if (refreshCustomers) refreshCustomers()
    }
  } catch(e: any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally{ setSendingEmail(null); setTimeout(()=> setSendMsg(''), 5000) }
}

async function sendSignedUp(email: string, setSendingEmail: (v: string | null)=>void, setSendMsg: (v: string)=>void){
  try{
    setSendingEmail(email)
    setSendMsg('Sending setup instructions...')
    const res = await fetch('/api/onboarding/signed-up', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json().catch(()=>({}))
    if (!res.ok){
      const errorMsg = data?.error || 'Unknown error'
      if (String(errorMsg).includes('SMTP not configured')) {
        setSendMsg('Email service not configured. Please contact admin.')
      } else {
        setSendMsg(`Failed: ${errorMsg}`)
      }
    } else {
      setSendMsg('Setup email sent successfully!')
    }
  } catch(e:any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally {
    setSendingEmail(null)
    setTimeout(()=> setSendMsg(''), 5000)
  }
}

async function sendTwoYears(email: string, setSendingEmail: (v: string | null)=>void, setSendMsg: (v: string)=>void){
  try{
    setSendingEmail(email)
    setSendMsg('Sending service update...')
    const res = await fetch('/api/admin/email/two-years', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json().catch(()=>({}))
    if (!res.ok){
      const errorMsg = data?.error || 'Unknown error'
      if (String(errorMsg).includes('SMTP not configured')) {
        setSendMsg('Email service not configured. Please contact admin.')
      } else {
        setSendMsg(`Failed: ${errorMsg}`)
      }
    } else {
      setSendMsg('Service update sent successfully!')
    }
  } catch(e:any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally {
    setSendingEmail(null)
    setTimeout(()=> setSendMsg(''), 5000)
  }
}

async function confirmDelete(item: { id: string }, setDeletingId: (v: string | null)=>void, setPendingDelete: (v: any)=>void, setCustomers: (updater: any)=>void, setSendMsg: (v: string)=>void){
  try{
    setDeletingId(item.id)
    const res = await fetch(`/api/customers/${item.id}`, { method: 'DELETE' })
    const data = await res.json().catch(()=>({}))
    if (!res.ok){ setSendMsg(data?.error || 'Failed to delete'); return }
    setCustomers((prev: any[]) => prev.filter(c => c.id !== item.id))
    setSendMsg('Customer deleted')
  } catch(e: any){ setSendMsg(e?.message || 'Network error') }
  finally{
    setDeletingId(null)
    setPendingDelete(null)
    setTimeout(()=> setSendMsg(''), 5000)
  }
}

async function toggleStatus(item: { id: string; status?: 'active'|'inactive' }, setCustomers: (updater: any)=>void, setSendMsg: (v: string)=>void){
  try{
    const next = item.status === 'inactive' ? 'active' : 'inactive'
    const res = await fetch(`/api/customers/${item.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ subscription_status: next }) })
    const data = await res.json().catch(()=>({}))
    if (!res.ok){ setSendMsg(data?.error || 'Failed to update status'); return }
    setCustomers((prev: any[]) => prev.map(c => c.id === item.id ? { ...c, status: next } : c))
    setSendMsg(`Status updated to ${next}`)
  } catch(e: any){ setSendMsg(e?.message || 'Network error') }
  finally{ setTimeout(()=> setSendMsg(''), 5000) }
}

async function saveLink(item: { id: string }, username: string, setCustomers: (updater: any)=>void, setSendMsg: (v: string)=>void, setLinkingItem: (v: any)=>void){
  try{
    const u = (username || '').trim()
    const res = await fetch(`/api/customers/${item.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ plex_username: u }) })
    const data = await res.json().catch(()=>({}))
    if (!res.ok){ setSendMsg(data?.error || 'Failed to link'); return }
    setCustomers((prev: any[]) => prev.map(c => c.id === item.id ? { ...c, plex_username: u } : c))
    setSendMsg('Plex username linked')
  } catch(e: any){ setSendMsg(e?.message || 'Network error') }
  finally{ setLinkingItem(null); setTimeout(()=> setSendMsg(''), 5000) }
}
