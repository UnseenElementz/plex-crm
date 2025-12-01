"use client"
import { useEffect, useMemo, useState } from 'react'
import CustomerForm from '@/components/CustomerForm'
import { calculatePrice, getStatus } from '@/lib/pricing'

type Customer = { id: string; full_name: string; email: string; plan: 'monthly'|'yearly'; streams: number; next_due_date: string; plex_username?: string }

export default function AdminCustomersPage(){
  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (!res.ok) location.href = '/login'
      } catch { location.href = '/login' }
    })()
  }, [])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [sendMsg, setSendMsg] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  useEffect(()=>{ (async()=>{ 
    try{ 
      setLoading(true); 
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
  const filtered = useMemo(()=> customers.filter(c=> (c.full_name+c.email+(c.plex_username||'')).toLowerCase().includes(q.toLowerCase())), [customers, q])

  
  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Customers</h2>
        <div className="flex gap-3">
          <input 
            className="input w-64" 
            placeholder="Search customers..." 
            value={q} 
            onChange={e=>setQ(e.target.value)} 
          />
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
        <div className="glass p-6 rounded-2xl mb-6 border border-cyan-500/20">
          <CustomerForm onSaved={(c)=>{ 
            if (editItem) { 
              setCustomers(prev=>prev.map(p=> p.id===c.id? c : p)); 
              setEditItem(null) 
            } else { 
              setCustomers(prev=>[...prev, c]) 
            } 
            setShowForm(false) 
          }} 
          initial={editItem || undefined} />
        </div>
      )}

      <div className="glass p-6 rounded-2xl border border-cyan-500/10">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-700/50">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email / Plex</th>
                  <th className="p-3 font-medium">Plan</th>
                  <th className="p-3 font-medium">Streams</th>
                  <th className="p-3 font-medium">Price</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const price = calculatePrice(c.plan, c.streams)
                  const status = getStatus(new Date(c.next_due_date))
                  return (
                    <tr key={c.id} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-all duration-200 group">
                      <td className="p-3">
                        <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                          {c.full_name}
                        </div>
                      </td>
                      <td className="p-3 text-slate-400">
                        <div>{c.email}</div>
                        {c.plex_username && <div className="text-slate-500 text-xs">Plex: {c.plex_username}</div>}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">
                          {c.plan}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{c.streams}</td>
                      <td className="p-3 font-medium text-slate-200">£{price.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`tag ${status.toLowerCase().replace(' ','-')}`}>{status}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button 
                            className="btn-xs transform hover:scale-105 transition-transform" 
                            onClick={()=>{ setEditItem(c); setShowForm(true) }}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn-xs-outline transform hover:scale-105 transition-transform" 
                            disabled={sendingEmail===c.email} 
                            onClick={()=>sendReminder(c.email, setSendingEmail, setSendMsg)}
                          >
                            {sendingEmail===c.email ? 'Sending...' : 'Send reminder'}
                          </button>
                          <button 
                            className="btn-xs-outline transform hover:scale-105 transition-transform" 
                            onClick={()=>sendTranscode(c.email, setSendingEmail, setSendMsg)}
                          >
                            Transcode Warning
                          </button>
                          <button 
                            className="btn-xs-outline transform hover:scale-105 transition-transform" 
                            disabled={deletingId === c.id}
                            onClick={()=> setPendingDelete(c)}
                          >
                            {deletingId === c.id ? 'Deleting...' : 'Delete'}
                          </button>
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
    setSendMsg('Sending transcode warning...')
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
      setSendMsg('Transcode warning sent successfully!')
    }
  } catch(e: any){ setSendMsg(`Failed: ${e?.message || 'Network error'}`) }
  finally{ setSendingEmail(null); setTimeout(()=> setSendMsg(''), 5000) }
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
