"use client"
import { useEffect, useState } from 'react'
import { calculatePrice, getTransactionFee, calculateNextDue } from '@/lib/pricing'
import { CustomerCreateSchema, CustomerUpdateSchema, formatZodError } from '@/lib/validation'

type Plan = 'monthly'|'yearly'|'three_year'
type Customer = { id?: string; full_name: string; email: string; plan: Plan; streams: number; start_date?: string; next_due_date?: string; notes?: string; plex_username?: string }

export default function CustomerForm({ initial, onSaved, onCancel }: { initial?: Customer; onSaved?: (c: any)=>void; onCancel?: ()=>void }){
  const [c, setC] = useState<Customer>(initial || { full_name:'', email:'', plan:'monthly', streams:1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const price = calculatePrice(c.plan, c.streams)
  
  // Better date handling for datetime-local input
  const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      // Convert to local datetime format (YYYY-MM-DDTHH:MM)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    } catch {
      return ''
    }
  }
  
  const parseDateFromInput = (inputValue: string): string => {
    if (!inputValue) return ''
    try {
      // datetime-local input gives us YYYY-MM-DDTHH:MM format
      // Convert to ISO string for storage
      return new Date(inputValue).toISOString()
    } catch {
      return ''
    }
  }
  
  useEffect(()=>{ if (!c.next_due_date) setC(v=>({ ...v, next_due_date: new Date().toISOString() })) }, [])

  async function save(){
    setError(''); setSuccess(''); setLoading(true)
    try{
      const isUpdate = !!c.id
      const schema = isUpdate ? CustomerUpdateSchema : CustomerCreateSchema
      const parsed = schema.safeParse(c)
      if (!parsed.success) { setError(formatZodError(parsed.error)); return }
      const url = isUpdate ? `/api/customers/${c.id}` : '/api/customers'
      const method = isUpdate ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(parsed.data) })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Failed'); return }
      setSuccess(isUpdate ? 'Customer updated' : 'Customer created')
      onSaved?.(data)
    } catch(e: any){
      setError(e?.message || 'Unexpected error')
      console.error(e)
    } finally{
      setLoading(false)
    }
  }

  const isEdit = !!c.id

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="card-title">{isEdit ? 'Edit customer' : 'Add customer'}</h3>
        {loading && <span className="text-slate-400 text-sm">Saving...</span>}
      </div>
      <label className="label">Full name</label>
      <input className="input" placeholder="Full name" value={c.full_name} onChange={e=>setC({ ...c, full_name: e.target.value })} />
      <label className="label">Email</label>
      <input className="input" placeholder="Email" value={c.email} onChange={e=>setC({ ...c, email: e.target.value })} />
      <label className="label">Plex Username</label>
      <input className="input" placeholder="Plex Username" value={c.plex_username || ''} onChange={e=>setC({ ...c, plex_username: e.target.value })} />
      <label className="label">Plan</label>
      <div className="flex gap-3">
        <button disabled={loading} className={`btn ${c.plan==='monthly'?'active':''}`} onClick={()=>setC({ ...c, plan: 'monthly', next_due_date: calculateNextDue('monthly', new Date(c.start_date || new Date())).toISOString() })}>Monthly</button>
        <button disabled={loading} className={`btn ${c.plan==='yearly'?'active':''}`} onClick={()=>setC({ ...c, plan: 'yearly', next_due_date: calculateNextDue('yearly', new Date(c.start_date || new Date())).toISOString() })}>Yearly</button>
        <button disabled={loading} className={`btn ${c.plan==='three_year'?'active':''}`} onClick={()=>setC({ ...c, plan: 'three_year', next_due_date: calculateNextDue('three_year', new Date(c.start_date || new Date())).toISOString() })}>3 Years</button>
      </div>
      <label className="label">Streams</label>
      <input className="input" type="number" min={1} value={c.streams} onChange={e=>setC({ ...c, streams: parseInt(e.target.value||'1',10) })} />
      <label className="label">Next due date</label>
      <input 
        className="input" 
        type="datetime-local" 
        value={formatDateForInput(c.next_due_date)} 
        onChange={e=>{
          const parsedDate = parseDateFromInput(e.target.value)
          if (parsedDate) {
            setC({ ...c, next_due_date: parsedDate })
          }
        }} 
      />
      <label className="label">Notes</label>
      <textarea className="input" value={c.notes || ''} onChange={e=>setC({ ...c, notes: e.target.value })} />
      <div>Auto price: £{price.toFixed(2)}</div>
      <div className="text-xs text-slate-400">£{getTransactionFee(c.plan)} transaction fee applies</div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {success && <div className="text-emerald-400 text-sm">{success}</div>}
      <div className="flex gap-2">
        <button disabled={loading} className="btn" onClick={save}>{isEdit ? 'Save changes' : 'Create customer'}</button>
        <button disabled={loading} className="btn-outline" onClick={()=>{ setError(''); setSuccess(''); onCancel?.(); }}>Cancel</button>
      </div>
    </div>
  )
}
