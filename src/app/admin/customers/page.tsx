"use client"
import { useEffect, useMemo, useState } from 'react'
import CustomerForm from '@/components/CustomerForm'
import { calculatePrice, getStatus } from '@/lib/pricing'
import { format } from 'date-fns'

type Customer = { id: string; full_name: string; email: string; plan: 'monthly'|'yearly'|'three_year'; streams: number; next_due_date: string; start_date?: string; plex_username?: string; status?: 'active'|'inactive' }

export default function AdminCustomersPage(){
  // Single effect: ensure session then load customers (dev auto-login, prod redirect)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'inactive'|'due_soon'|'overdue'|'registered'>('active')
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
  
  useEffect(()=>{ (async()=>{ 
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
  })() }, [])
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
    else if (sortBy === 'price_high') sorted.sort((a,b)=> calculatePrice(b.plan as any, b.streams) - calculatePrice(a.plan as any, a.streams))
    else if (sortBy === 'price_low') sorted.sort((a,b)=> calculatePrice(a.plan as any, a.streams) - calculatePrice(b.plan as any, b.streams))
    else if (sortBy === 'streams_high') sorted.sort((a,b)=> b.streams - a.streams)
    else if (sortBy === 'streams_low') sorted.sort((a,b)=> a.streams - b.streams)
    else if (sortBy === 'due_soon') sorted.sort((a,b)=> new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime())
    return sorted
  }, [customers, q, statusFilter, sortBy])

  
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Customers</h2>
        <div className="flex gap-3 items-center">
          <a
            href="/admin"
            className="btn-outline px-4 py-1 text-center transition-all duration-200 hover:shadow-glow hover:scale-105"
          >
            ← Back to Chat
          </a>
          <input 
            className="input w-64" 
            placeholder="Search customers..." 
            value={q} 
            onChange={e=>setQ(e.target.value)} 
          />
          <select className="input w-40" value={statusFilter} onChange={e=> setStatusFilter(e.target.value as any)}>
            <option value="all">All</option>
            <option value="due_soon">Due Soon</option>
            <option value="overdue">Overdue</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="registered">Registered</option>
          </select>
          <select className="input w-48" value={sortBy} onChange={e=> setSortBy(e.target.value as any)}>
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
                  <th className="p-1.5 font-medium">Name</th>
                  <th className="p-1.5 font-medium">Email / Plex</th>
                  <th className="p-1.5 font-medium">Plan</th>
                  <th className="p-1.5 font-medium">Streams</th>
                  <th className="p-1.5 font-medium">Price</th>
                  <th className="p-1.5 font-medium">Status</th>
                  <th className="p-1.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const hasPlan = Boolean(c.plan)
                  const price = hasPlan ? calculatePrice(c.plan as any, c.streams) : null
                  const statusLabel = !hasPlan ? 'Registered' : ((c.status === 'inactive') ? 'Inactive' : getStatus(new Date(c.next_due_date)))
                  return (
                    <tr key={c.id} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-all duration-200 group">
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
                          <div className="text-slate-400 text-xs">Registered: {c.start_date ? format(new Date(c.start_date), 'dd/MM/yyyy') : '-'}</div>
                        )}
                      </td>
                      <td className="p-1.5 text-slate-400">{c.streams}</td>
                      <td className="p-1.5 font-medium text-slate-200">{price !== null ? `£${price.toFixed(2)}` : '—'}</td>
                      <td className="p-1.5">
                        <span className={`tag ${statusLabel.toLowerCase().replace(' ','-')}`}>{statusLabel}</span>
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
