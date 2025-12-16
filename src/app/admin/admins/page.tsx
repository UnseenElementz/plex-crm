'use client'

import { useEffect, useState } from 'react'

type AdminRow = { email: string; full_name: string; pages: string[] }
const ALL_PAGES = ['dashboard','chat','customers','settings','email']

export default function AdminAdminsPage(){
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [selectedPages, setSelectedPages] = useState<string[]>(ALL_PAGES)
  const [msg, setMsg] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPass, setResetPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingEmail, setEditingEmail] = useState<string | null>(null)

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
      const payload = { email, password, full_name: fullName, pages: selectedPages }
      let res
      if (editingEmail) {
        res = await fetch('/api/admin/admins', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ...payload, originalEmail: editingEmail }) })
      } else {
        res = await fetch('/api/admin/admins', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      }
      
      const j = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(j?.error || 'Failed'); return }
      
      setMsg(editingEmail ? 'Admin updated' : 'Admin created')
      if (editingEmail) {
        setAdmins(prev => prev.map(a => a.email === editingEmail ? { email, full_name: fullName, pages: selectedPages } : a))
        setEditingEmail(null)
      } else {
        setAdmins(prev=>{ const next = prev.filter(a=> a.email!==email); return [...next, { email, full_name: fullName, pages: selectedPages }] })
      }
      
      setEmail(''); setPassword(''); setFullName(''); setSelectedPages(ALL_PAGES)
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  async function deleteAdmin(targetEmail: string){
    if (!confirm('Delete this admin?')) return
    setLoading(true); setMsg('')
    try{
      const res = await fetch(`/api/admin/admins?email=${encodeURIComponent(targetEmail)}`, { method:'DELETE' })
      const j = await res.json().catch(()=>({}))
      if (!res.ok){ setMsg(j?.error || 'Failed'); return }
      setMsg('Admin deleted')
      setAdmins(prev => prev.filter(a => a.email !== targetEmail))
    } catch(e:any){ setMsg(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  function startEdit(admin: AdminRow){
    setEditingEmail(admin.email)
    setEmail(admin.email)
    setFullName(admin.full_name)
    setSelectedPages(admin.pages)
    setPassword('') // Don't fill password
    setMsg('Editing admin')
  }

  function cancelEdit(){
    setEditingEmail(null)
    setEmail('')
    setFullName('')
    setPassword('')
    setSelectedPages(ALL_PAGES)
    setMsg('')
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
          <h3 className="card-title">{editingEmail ? 'Edit Admin' : 'Create Admin'}</h3>
          <div className="space-y-3">
            <input className="input" placeholder="Admin email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="input" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <input className="input" type="password" placeholder={editingEmail ? "Password (leave blank to keep)" : "Password"} value={password} onChange={e=>setPassword(e.target.value)} />
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
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={createAdmin} disabled={loading || !email || (!password && !editingEmail)}>
                {editingEmail ? 'Update Admin' : 'Create Admin'}
              </button>
              {editingEmail && (
                <button className="btn-outline" onClick={cancelEdit} disabled={loading}>Cancel</button>
              )}
            </div>
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
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a=> (
                <tr key={a.email} className="border-b border-slate-800/30">
                  <td className="p-2 text-slate-300">{a.email}</td>
                  <td className="p-2 text-slate-300">{a.full_name}</td>
                  <td className="p-2 text-slate-400">{a.pages.join(', ')}</td>
                  <td className="p-2 text-right">
                    <button className="btn-xs mr-2" onClick={()=> startEdit(a)}>Edit</button>
                    <button className="btn-xs-outline" onClick={()=> deleteAdmin(a.email)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
