'use client'

import { useEffect, useState } from 'react'

type Customer = { id: string; full_name: string; email: string }

export default function AdminEmailPage(){
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [selectAll, setSelectAll] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/customers'); if(r.ok){ const d = await r.json(); setCustomers(d || []) } } catch{} })() },[])

  useEffect(()=>{
    if (selectAll){
      const m: Record<string, boolean> = {}
      customers.forEach(c=>{ if (c.email) m[c.email] = true })
      setSelected(m)
    }
  }, [selectAll, customers])

  function toggle(email: string){ setSelected(s=> ({ ...s, [email]: !s[email] })) }

  async function send(){
    setSending(true); setMsg('')
    try{
      const list = Object.keys(selected).filter(k=> selected[k])
      const mode = selectAll ? 'all' : 'list'
      const res = await fetch('/api/admin/email/custom', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ subject, body, mode, recipients: list }) })
      const data = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(data?.error || 'Failed to send'); return }
      setMsg(`Sent to ${data?.count || list.length} recipients`)
      setSelected({}); setSelectAll(false); setSubject(''); setBody('')
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setSending(false); setTimeout(()=> setMsg(''), 4000) }
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Admin Email</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass p-4 rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={selectAll} onChange={e=> setSelectAll(e.target.checked)} /><span className="text-sm text-slate-300">Select all customers</span></label>
          </div>
          <div className="max-h-80 overflow-auto space-y-2">
            {customers.map(c=> (
              <div key={c.id} className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(selected[c.email]) || selectAll} onChange={()=> toggle(c.email)} />
                <span className="text-slate-300 text-sm">{c.full_name} — {c.email}</span>
              </div>
            ))}
            {customers.length===0 && (<div className="text-slate-400 text-sm">No customers found</div>)}
          </div>
        </div>
        <div className="glass p-4 rounded-2xl">
          <div className="space-y-3">
            <input className="input" placeholder="Subject" value={subject} onChange={e=> setSubject(e.target.value)} />
            <textarea className="input" rows={10} placeholder="Message" value={body} onChange={e=> setBody(e.target.value)} />
            <button className="btn" onClick={send} disabled={sending || !subject || !body}>{sending ? 'Sending...' : 'Send Email'}</button>
            {msg && (<div className={`text-sm ${msg.startsWith('Sent') ? 'text-emerald-400' : 'text-rose-400'}`}>{msg}</div>)}
          </div>
        </div>
      </div>
    </main>
  )
}

