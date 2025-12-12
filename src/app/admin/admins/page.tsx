'use client'

import { useEffect, useState } from 'react'

type AdminRow = { email: string; full_name: string; pages: string[] }
const ALL_PAGES = ['dashboard','chat','customers','settings','email']

export default function AdminAdminsPage(){
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [selectedPages, setSelectedPages] = useState<string[]>(['dashboard','chat','customers'])
  const [msg, setMsg] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPass, setResetPass] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ (async()=>{ 
    try{ 
      const r = await fetch('/api/admin/admins'); 
      if(r.ok){ 
        const j = await r.json(); 
        const list = j.admins || []
        if (list.length){ setAdmins(list); return }
      }
    } catch{}
    try{
      if (typeof document !== 'undefined'){
        const raw = (document.cookie.split(';').map(s=>s.trim()).find(s=> s.startsWith('admin_settings=')) || '').split('=')[1]
        const settings = raw ? JSON.parse(decodeURIComponent(raw)) : {}
        const perms = settings?.admin_perms || {}
        const arr: AdminRow[] = Object.keys(perms).map(email=> ({ email, full_name: '', pages: perms[email] || [] }))
        if (arr.length) setAdmins(arr)
      }
    } catch{}
  })() },[])

  function togglePage(p: string){ setSelectedPages(prev=> prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p]) }

  async function createAdmin(){
    setLoading(true); setMsg('')
    try{
      const res = await fetch('/api/admin/admins', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password, full_name: fullName, pages: selectedPages }) })
      const j = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(j?.error || 'Failed'); return }
      setMsg('Admin created')
      setAdmins(prev=>{ const next = prev.filter(a=> a.email!==email); return [...next, { email, full_name: fullName, pages: selectedPages }] })
      setEmail(''); setPassword(''); setFullName('')
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  async function resetPassword(){
    setLoading(true); setMsg('')
    try{
      const res = await fetch('/api/admin/admins/reset', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: resetEmail, newPassword: resetPass }) })
      const j = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(j?.error || 'Failed'); return }
      setMsg('Password reset')
      setResetEmail(''); setResetPass('')
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Admin Management</h2>
        <a href="/admin" className="btn-outline">← Back to Chat</a>
      </div>

      {msg && (<div className="glass p-3 rounded mb-4 text-cyan-300 text-sm">{msg}</div>)}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-solid p-6 rounded-2xl border border-cyan-500/20">
          <h3 className="card-title">Create Admin</h3>
          <div className="space-y-3">
            <input className="input" placeholder="Admin email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="input" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
            <div>
              <div className="label">Page access</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ALL_PAGES.map(p=> (
                  <label key={p} className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={selectedPages.includes(p)} onChange={()=> togglePage(p)} /> {p}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn" onClick={createAdmin} disabled={loading || !email || !password}>Create Admin</button>
          </div>
        </div>

        <div className="card-solid p-6 rounded-2xl border border-cyan-500/20">
          <h3 className="card-title">Reset Password</h3>
          <div className="space-y-3">
            <input className="input" placeholder="User email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} />
            <input className="input" type="password" placeholder="New password" value={resetPass} onChange={e=>setResetPass(e.target.value)} />
            <button className="btn" onClick={resetPassword} disabled={loading || !resetEmail || !resetPass}>Reset</button>
          </div>
        </div>
      </div>

      <div className="card-solid p-6 rounded-2xl border border-cyan-500/20 mt-6">
        <h3 className="card-title">Admins</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-300 border-b border-slate-700/50">
                <th className="p-2">Email</th>
                <th className="p-2">Name</th>
                <th className="p-2">Pages</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a=> (
                <tr key={a.email} className="border-b border-slate-800/30">
                  <td className="p-2 text-slate-300">{a.email}</td>
                  <td className="p-2 text-slate-300">{a.full_name}</td>
                  <td className="p-2 text-slate-400">{a.pages.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
