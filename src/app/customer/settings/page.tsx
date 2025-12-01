'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function CustomerSettingsPage(){
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [customerId, setCustomerId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [plexUsername, setPlexUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [timezone, setTimezone] = useState('Europe/London')

  useEffect(()=>{ (async()=>{
    try{
      const s = getSupabase();
      if (!s) { setError('Auth not configured'); setLoading(false); return }
      const { data } = await s.auth.getUser()
      const userEmail = data.user?.email || ''
      if (!userEmail){ setError('Not signed in'); setLoading(false); return }
      setEmail(userEmail)
      // Load profile
      try {
        const { data: prof } = await s.from('profiles').select('full_name').eq('email', userEmail).single()
        setFullName(prof?.full_name || '')
      } catch {}
      // Load customer row for id and plex username (from notes)
      const { data: cust } = await s.from('customers').select('*').eq('email', userEmail).single()
      if (cust){
        setCustomerId(cust.id)
        const m = String(cust.notes || '').match(/Plex:\s*(.+)/i)
        setPlexUsername(m?.[1] || '')
        const t = String(cust.notes || '').match(/Timezone:\s*(.+)/i)
        setTimezone(t?.[1] || 'Europe/London')
      }
    }catch(e:any){ setError(e?.message || 'Load failed') }
    finally{ setLoading(false) }
  })() }, [])

  async function saveProfile(){
    setSaving(true); setMessage(''); setError('')
    try{
      const s = getSupabase(); if (!s) throw new Error('Auth not configured')
      // Update full name in profiles
      try { await s.from('profiles').update({ full_name: fullName }).eq('email', email) } catch{}
      // Update plex username and timezone in customers via API
      if (customerId){
        const res = await fetch(`/api/customers/${customerId}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ plex_username: plexUsername, timezone }) })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error || 'Failed to save')
      }
      setMessage('Profile updated')
    }catch(e:any){ setError(e?.message || 'Failed to save') }
    finally{ setSaving(false) }
  }

  async function saveEmail(){
    setSaving(true); setMessage(''); setError('')
    try{
      const s = getSupabase(); if (!s) throw new Error('Auth not configured')
      const { error } = await s.auth.updateUser({ email })
      if (error) throw error
      if (customerId){
        const res = await fetch(`/api/customers/${customerId}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
        const body = await res.json(); if (!res.ok) throw new Error(body?.error || 'Failed to sync email')
      }
      setMessage('Email updated')
    }catch(e:any){ setError(e?.message || 'Failed to update email') }
    finally{ setSaving(false) }
  }

  async function savePassword(){
    setSaving(true); setMessage(''); setError('')
    try{
      const s = getSupabase(); if (!s) throw new Error('Auth not configured')
      const { error } = await s.auth.updateUser({ password: newPassword })
      if (error) throw error
      setMessage('Password updated')
    }catch(e:any){ setError(e?.message || 'Failed to update password') }
    finally{ setSaving(false); setNewPassword('') }
  }

  if (loading){
    return (
      <main className="p-6 flex items-center justify-center min-h-screen"><div className="text-slate-400">Loading settings...</div></main>
    )
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-4">Customer Settings</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="card-title">Profile</h3>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <label className="label">Plex Username</label>
            <input className="input" value={plexUsername} onChange={e=>setPlexUsername(e.target.value)} />
            <label className="label">Timezone</label>
            <select className="input" value={timezone} onChange={e=>setTimezone(e.target.value)}>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
            <button className="btn mt-3" onClick={saveProfile} disabled={saving}>Save Profile</button>
          </div>
          <div>
            <h3 className="card-title">Account</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Email</label>
                <input 
                  className="input" 
                  type="email" 
                  value={email} 
                  onChange={e=>setEmail(e.target.value)}
                  onKeyDown={(e)=>{ if (e.key==='Enter' && email) { e.preventDefault(); saveEmail() } }}
                />
                <button className="btn mt-2 w-full" onClick={saveEmail} disabled={saving || !email}>Update Email</button>
              </div>
              <div>
                <label className="label">New Password</label>
                <input 
                  className="input" 
                  type="password" 
                  value={newPassword} 
                  onChange={e=>setNewPassword(e.target.value)}
                  onKeyDown={(e)=>{ if (e.key==='Enter' && newPassword) { e.preventDefault(); savePassword() } }}
                />
                <button className="btn mt-2 w-full" onClick={savePassword} disabled={saving || !newPassword}>Update Password</button>
              </div>
            </div>
          </div>
        </div>
        {message && <div className="mt-4 text-emerald-400 text-sm">{message}</div>}
        {error && <div className="mt-4 text-rose-400 text-sm">{error}</div>}
      </div>
    </main>
  )
}
