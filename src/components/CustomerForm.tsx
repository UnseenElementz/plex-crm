"use client"
import { useEffect, useState } from 'react'
import { calculatePrice, getTransactionFee, calculateNextDue } from '@/lib/pricing'
import { CustomerCreateSchema, CustomerUpdateSchema, formatZodError } from '@/lib/validation'
import DatePicker from '@/components/DatePicker'

type Plan = 'monthly'|'yearly'
type Customer = { id?: string; full_name: string; email: string; plan: Plan; streams: number; start_date?: string; next_due_date?: string; notes?: string; plex_username?: string }

export default function CustomerForm({ initial, onSaved, onCancel }: { initial?: Customer; onSaved?: (c: any)=>void; onCancel?: ()=>void }){
  const [c, setC] = useState<Customer>(initial || { full_name:'', email:'', plan:'monthly', streams:1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const price = calculatePrice(c.plan, c.streams, pricingConfig)
  const [dueInput, setDueInput] = useState('')
  const [startInput, setStartInput] = useState('')
  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showDuePicker, setShowDuePicker] = useState(false)
  
  const formatDateForInput = (dateString: string | undefined): string => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      const year = date.getFullYear()
      if (year < 2000 || year > 2100) return ''
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${day}.${month}.${year}`
    } catch {
      return ''
    }
  }
  
  const parseDateFromInput = (inputValue: string): string => {
    if (!inputValue) return ''
    try {
      let y = 0, m = 0, d = 0
      if (/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
        const [yyyy, mm, dd] = inputValue.split('-')
        y = parseInt(yyyy, 10)
        m = parseInt(mm, 10)
        d = parseInt(dd, 10)
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(inputValue)) {
        const [dd, mm, yyyy] = inputValue.split('/')
        d = parseInt(dd, 10)
        m = parseInt(mm, 10)
        y = parseInt(yyyy, 10)
      } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(inputValue)) {
        const [dd, mm, yyyy] = inputValue.split('.')
        d = parseInt(dd, 10)
        m = parseInt(mm, 10)
        y = parseInt(yyyy, 10)
      } else {
        return ''
      }
      if (!d || !m || !y) return ''
      const date = new Date(y, m - 1, d)
      if (isNaN(date.getTime())) return ''
      return date.toISOString()
    } catch {
      return ''
    }
  }
  
  useEffect(()=>{ 
    if (c.id) return
    const now = new Date()
    const midday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    const todayStr = formatDateForInput(midday.toISOString())
    setStartInput(prev=> prev || todayStr)
    setC(v=>({ 
      ...v, 
      start_date: v.start_date || midday.toISOString(), 
      next_due_date: v.next_due_date || calculateNextDue(v.plan || 'monthly', midday).toISOString() 
    }))
  }, [])
  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/admin/settings', { cache: 'no-store' }); if (r.ok){ const j = await r.json(); setPricingConfig(j) } } catch{} })() }, [])
  useEffect(()=>{ setDueInput(formatDateForInput(c.next_due_date)) }, [c.next_due_date])
  useEffect(()=>{ setStartInput(formatDateForInput(c.start_date)) }, [c.start_date])
  useEffect(()=>{ 
    if (/^\d{4}-\d{2}-\d{2}$/.test(startInput) || /^\d{2}\/\d{2}\/\d{4}$/.test(startInput)){
      const iso = parseDateFromInput(startInput)
      if (iso){
        const d = new Date(iso)
        const next = calculateNextDue(c.plan, d).toISOString()
        setC(v=>({ ...v, start_date: iso, next_due_date: next }))
        setDueInput(formatDateForInput(next))
      }
    }
  }, [startInput])

  async function save(){
    setError(''); setSuccess(''); setLoading(true)
    try{
      const draft: any = { ...c }
      if (dueInput) {
        const iso = parseDateFromInput(dueInput)
        if (!iso) { setError('Invalid next due date'); return }
        draft.next_due_date = iso
      }
      if (startInput) {
        const iso = parseDateFromInput(startInput)
        if (!iso) { setError('Invalid start date'); return }
        draft.start_date = iso
      } else {
        delete draft.start_date
      }
      const isUpdate = !!c.id
      const schema = isUpdate ? CustomerUpdateSchema : CustomerCreateSchema
      const parsed = schema.safeParse(draft)
      if (!parsed.success) { setError(formatZodError(parsed.error)); return }
      const url = isUpdate ? `/api/customers/${draft.id}` : '/api/customers'
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
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button disabled={loading} className={`btn whitespace-nowrap ${c.plan==='monthly'?'active':''}`} onClick={()=>setC({ ...c, plan: 'monthly', next_due_date: calculateNextDue('monthly', new Date(c.start_date || new Date())).toISOString() })}>Monthly</button>
        <button disabled={loading} className={`btn whitespace-nowrap ${c.plan==='yearly'?'active':''}`} onClick={()=>setC({ ...c, plan: 'yearly', next_due_date: calculateNextDue('yearly', new Date(c.start_date || new Date())).toISOString() })}>Yearly</button>
      </div>
      <label className="label">Streams</label>
      <input className="input" type="number" min={1} value={c.streams} onChange={e=>setC({ ...c, streams: parseInt(e.target.value||'1',10) })} />
      <label className="label">Start date (optional)</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input 
            className="input flex-1"
            type="text"
            placeholder="DD.MM.YYYY or YYYY-MM-DD"
            value={startInput}
            onChange={e=>{
              const v = e.target.value
              setStartInput(v)
              const iso = parseDateFromInput(v)
              if (iso) setC({ ...c, start_date: iso })
            }}
            onBlur={e=>{
              const v = e.target.value
              const iso = parseDateFromInput(v)
              if (!iso){
                setStartInput(formatDateForInput(c.start_date))
              }
            }}
          />
          <button type="button" className="btn" onClick={()=> setShowStartPicker(s=> !s)}>{showStartPicker ? 'Close' : 'Pick date'}</button>
        </div>
        {showStartPicker && (
          <DatePicker 
            value={c.start_date}
            onChange={(iso)=>{
              setC({ ...c, start_date: iso })
              setStartInput(formatDateForInput(iso))
              const d = new Date(iso)
              const next = calculateNextDue(c.plan, d).toISOString()
              setC(v=>({ ...v, next_due_date: next }))
              setDueInput(formatDateForInput(next))
            }}
          />
        )}
      </div>
      <label className="label">Next due date</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input 
            className="input flex-1"
            type="text"
            placeholder="DD.MM.YYYY or YYYY-MM-DD"
            value={dueInput}
            onChange={e=>{
              const v = e.target.value
              setDueInput(v)
              const iso = parseDateFromInput(v)
              if (iso) setC({ ...c, next_due_date: iso })
            }}
            onBlur={e=>{
              const v = e.target.value
              const iso = parseDateFromInput(v)
              if (!iso){
                setDueInput(formatDateForInput(c.next_due_date))
              }
            }}
          />
          <button type="button" className="btn" onClick={()=> setShowDuePicker(s=> !s)}>{showDuePicker ? 'Close' : 'Pick date'}</button>
        </div>
        {showDuePicker && (
          <DatePicker 
            value={c.next_due_date}
            onChange={(iso)=>{
              setC({ ...c, next_due_date: iso })
              setDueInput(formatDateForInput(iso))
            }}
          />
        )}
      </div>
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
