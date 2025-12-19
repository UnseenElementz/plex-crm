"use client"
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    paypal_email: '',
    payment_lock: false,
    chat_online: true,
    hero_image_url: '',
    admin_user: 'Anfrax786',
    admin_pass: 'Badaman1',
    timezone: 'Europe/London',
    monthly_maintenance: '140',
    company_name: 'Streamz R Us',
    monthly_price: '15',
    yearly_price: '85',
    stream_monthly_price: '5',
    stream_yearly_price: '20',
    three_year_price: '180',
    stream_three_year_price: '40',
    bg_music_url: '',
    bg_music_volume: '0.1',
    bg_music_enabled: true,
    plex_token: '',
    plex_server_url: 'https://plex.tv'
  })
  const [loading, setLoading] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [updates, setUpdates] = useState<Array<{ id?: string; title: string; content: string; created_at: string }>>([])
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  useEffect(() => {
    checkAuth()
    loadSettings()
    loadServiceUpdates()
  }, [])

  async function checkAuth() {
    try {
      try{
        const r = await fetch('/api/admin/auth/session')
        if (r.ok){ setIsAuthenticated(true); setAuthLoading(false); return }
      } catch{}
      // do not infer admin from settings content
      const s = getSupabase()
      if (!s) {
        setAuthLoading(false)
        setSupabaseStatus('error')
        return
      }
      
      setSupabaseStatus('connected')
      
      const { data: { user }, error: userError } = await s.auth.getUser()
      if (userError || !user) {
        console.log('No user found or user error:', userError)
        // Don't redirect, just show not authenticated state
        setAuthLoading(false)
        return
      }
      
      
      
      // Check if user is admin from profiles
      const { data: profile, error: profileError } = await s.from('profiles').select('role').eq('email', user.email).single()
      if (profileError) {
        console.log('Profile check error:', profileError)
        // Don't redirect, just show not authenticated state
        setAuthLoading(false)
        return
      }
      
      if (profile?.role === 'admin') {
        setIsAuthenticated(true)
        try {
          await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: user.email }) })
        } catch {}
      }
      
    } catch (e) {
      console.error('Auth check failed:', e)
      // Don't redirect on error, just show not authenticated state
    } finally {
      setAuthLoading(false)
    }
  }

  async function loadServiceUpdates(){
    try{
      const res = await fetch('/api/admin/service-updates')
      const data = await res.json().catch(()=>({ updates: [] }))
      if (res.ok){
        setUpdates(Array.isArray(data.updates) ? data.updates : [])
      } else {
        setUpdates([])
      }
    } catch {
      setUpdates([])
    }
  }

  async function publishUpdate(){
    if (!isAuthenticated) { setUpdateMsg('You must be admin to publish.'); return }
    if (!newTitle.trim() || !newContent.trim()) { setUpdateMsg('Title and content are required.'); return }
    setPublishing(true)
    setUpdateMsg('')
    try{
      const res = await fetch('/api/admin/service-updates', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }) })
      const body = await res.json().catch(()=>({}))
      if (!res.ok){
        setUpdateMsg(body?.error || 'Failed to publish')
      } else {
        const update = body?.update || { title: newTitle.trim(), content: newContent.trim(), created_at: new Date().toISOString() }
        setUpdates(prev => [update, ...prev])
        setNewTitle('')
        setNewContent('')
        setUpdateMsg('Update published')
      }
    } catch(e:any){
      setUpdateMsg(e?.message || 'Failed to publish')
    } finally {
      setPublishing(false)
    }
  }

  

  async function deleteUpdate(id?: string){
    if (!id) return
    try{
      const res = await fetch(`/api/admin/service-updates?id=${encodeURIComponent(id)}`, { method:'DELETE' })
      const body = await res.json().catch(()=>({}))
      if (!res.ok){ setUpdateMsg(body?.error || 'Failed to delete'); return }
      setUpdates(prev => prev.filter(u => (u as any).id !== id))
      setUpdateMsg('Update deleted')
      setTimeout(()=> setUpdateMsg(''), 3000)
    } catch(e:any){ setUpdateMsg(e?.message || 'Failed to delete') }
  }

  async function loadSettings() {
    try {
      try {
        if (typeof window !== 'undefined') {
          const cookieStr = document.cookie || ''
          const cookieMatch = cookieStr.split(';').map(s=>s.trim()).find(s=> s.startsWith('admin_settings='))
          if (cookieMatch) {
            const rawCookie = decodeURIComponent(cookieMatch.split('=')[1] || '')
            if (rawCookie) {
              const data = JSON.parse(rawCookie)
              setSettings(prev => ({
                ...prev,
                smtp_host: data.smtp_host || prev.smtp_host,
                smtp_port: data.smtp_port || prev.smtp_port,
                smtp_user: data.smtp_user || prev.smtp_user,
                smtp_pass: data.smtp_pass || prev.smtp_pass,
                smtp_from: data.smtp_from || prev.smtp_from,
                paypal_email: data.paypal_email || prev.paypal_email,
                payment_lock: Boolean(data.payment_lock ?? prev.payment_lock),
                chat_online: Boolean(data.chat_online ?? prev.chat_online),
                hero_image_url: data.hero_image_url || prev.hero_image_url,
                admin_user: data.admin_user || prev.admin_user,
                admin_pass: data.admin_pass || prev.admin_pass,
                timezone: data.timezone || prev.timezone,
                monthly_maintenance: (data.monthly_maintenance ?? Number(prev.monthly_maintenance)).toString(),
                company_name: data.company_name || prev.company_name,
                monthly_price: (data.monthly_price ?? Number(prev.monthly_price)).toString(),
                yearly_price: (data.yearly_price ?? Number(prev.yearly_price)).toString(),
                stream_monthly_price: (data.stream_monthly_price ?? Number(prev.stream_monthly_price)).toString(),
                stream_yearly_price: (data.stream_yearly_price ?? Number(prev.stream_yearly_price)).toString(),
                three_year_price: (data.three_year_price ?? Number(prev.three_year_price)).toString(),
                stream_three_year_price: (data.stream_three_year_price ?? Number(prev.stream_three_year_price)).toString(),
                bg_music_url: data.bg_music_url || prev.bg_music_url,
                bg_music_volume: (data.bg_music_volume ?? Number(prev.bg_music_volume)).toString(),
                bg_music_enabled: Boolean(data.bg_music_enabled ?? prev.bg_music_enabled)
              }))
            }
          }
          const raw = localStorage.getItem('admin_settings')
          if (raw) {
            const data = JSON.parse(raw)
              setSettings(prev => ({
                ...prev,
                smtp_host: data.smtp_host || prev.smtp_host,
                smtp_port: data.smtp_port || prev.smtp_port,
                smtp_user: data.smtp_user || prev.smtp_user,
                smtp_pass: data.smtp_pass || prev.smtp_pass,
                smtp_from: data.smtp_from || prev.smtp_from,
                paypal_email: data.paypal_email || prev.paypal_email,
                payment_lock: Boolean(data.payment_lock ?? prev.payment_lock),
                chat_online: Boolean(data.chat_online ?? prev.chat_online),
                hero_image_url: data.hero_image_url || prev.hero_image_url,
                admin_user: data.admin_user || prev.admin_user,
                admin_pass: data.admin_pass || prev.admin_pass,
                timezone: data.timezone || prev.timezone,
                monthly_maintenance: (data.monthly_maintenance ?? Number(prev.monthly_maintenance)).toString(),
                company_name: data.company_name || prev.company_name,
                monthly_price: (data.monthly_price ?? Number(prev.monthly_price)).toString(),
                yearly_price: (data.yearly_price ?? Number(prev.yearly_price)).toString(),
                stream_monthly_price: (data.stream_monthly_price ?? Number(prev.stream_monthly_price)).toString(),
                stream_yearly_price: (data.stream_yearly_price ?? Number(prev.stream_yearly_price)).toString(),
                three_year_price: (data.three_year_price ?? Number(prev.three_year_price)).toString(),
                stream_three_year_price: (data.stream_three_year_price ?? Number(prev.stream_three_year_price)).toString(),
                bg_music_url: data.bg_music_url || prev.bg_music_url,
                bg_music_volume: (data.bg_music_volume ?? Number(prev.bg_music_volume)).toString(),
                bg_music_enabled: Boolean(data.bg_music_enabled ?? prev.bg_music_enabled)
              }))
          }
        }
      } catch {}

      // Then try server
      const res = await fetch('/api/admin/settings')
      if (!res.ok) {
        const b = await res.json().catch(()=>({}))
        setSupabaseStatus('error')
        setMessage(b?.error || 'Settings table not found. Using local settings until database is ready.')
        return
      }
      const data = await res.json()
      setSupabaseStatus('connected')
      setSettings(prev => ({
        ...prev,
        smtp_host: data.smtp_host || prev.smtp_host,
        smtp_port: data.smtp_port || prev.smtp_port,
        smtp_user: data.smtp_user || prev.smtp_user,
        smtp_pass: data.smtp_pass || prev.smtp_pass,
        smtp_from: data.smtp_from || prev.smtp_from,
        paypal_email: data.paypal_email || prev.paypal_email,
        payment_lock: Boolean(data.payment_lock ?? prev.payment_lock),
        chat_online: Boolean(data.chat_online ?? prev.chat_online),
        hero_image_url: data.hero_image_url || prev.hero_image_url,
        admin_user: data.admin_user || prev.admin_user,
        admin_pass: data.admin_pass || prev.admin_pass,
        timezone: data.timezone || prev.timezone,
        monthly_maintenance: data.monthly_maintenance?.toString() || prev.monthly_maintenance,
        company_name: data.company_name || prev.company_name,
        monthly_price: (data.monthly_price ?? Number(prev.monthly_price)).toString(),
        yearly_price: (data.yearly_price ?? Number(prev.yearly_price)).toString(),
        stream_monthly_price: (data.stream_monthly_price ?? Number(prev.stream_monthly_price)).toString(),
        stream_yearly_price: (data.stream_yearly_price ?? Number(prev.stream_yearly_price)).toString(),
        three_year_price: (data.three_year_price ?? Number(prev.three_year_price)).toString(),
        stream_three_year_price: (data.stream_three_year_price ?? Number(prev.stream_three_year_price)).toString(),
        bg_music_url: data.bg_music_url || prev.bg_music_url,
        bg_music_volume: (data.bg_music_volume ?? Number(prev.bg_music_volume)).toString(),
        bg_music_enabled: Boolean(data.bg_music_enabled ?? prev.bg_music_enabled),
        plex_token: data.plex_token || prev.plex_token,
        plex_server_url: data.plex_server_url || prev.plex_server_url
      }))
      try {
        if (typeof window !== 'undefined') {
          const toStore = {
            monthly_maintenance: data.monthly_maintenance,
            monthly_price: data.monthly_price,
            yearly_price: data.yearly_price,
            stream_monthly_price: data.stream_monthly_price,
            stream_yearly_price: data.stream_yearly_price,
            three_year_price: data.three_year_price,
            stream_three_year_price: data.stream_three_year_price,
            smtp_host: data.smtp_host,
            smtp_port: data.smtp_port,
            smtp_user: data.smtp_user,
            smtp_pass: data.smtp_pass,
            smtp_from: data.smtp_from,
            paypal_email: data.paypal_email,
            payment_lock: Boolean(data.payment_lock),
            chat_online: Boolean(data.chat_online),
            hero_image_url: data.hero_image_url,
            admin_user: data.admin_user,
            admin_pass: data.admin_pass,
            timezone: data.timezone,
            company_name: data.company_name,
            bg_music_url: data.bg_music_url,
            bg_music_volume: data.bg_music_volume,
            bg_music_enabled: data.bg_music_enabled,
            plex_token: data.plex_token,
            plex_server_url: data.plex_server_url
          }
          localStorage.setItem('admin_settings', JSON.stringify(toStore))
          document.cookie = `admin_settings=${encodeURIComponent(JSON.stringify(toStore))}; path=/; max-age=31536000`
        }
      } catch {}
    } catch (e) {
      console.error('Failed to load settings:', e)
      setSupabaseStatus('error')
      setMessage('Failed to load settings. Using local settings.')
    }
  }

  async function testPlex(){
    setTesting(true); setTestMsg('Testing...')
    try {
      const res = await fetch('/api/admin/plex/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: settings.plex_token, url: settings.plex_server_url })
      })
      const data = await res.json()
      if (res.ok) {
        setTestMsg('✅ ' + data.message)
      } else {
        setTestMsg('❌ ' + (data.error || 'Failed'))
      }
    } catch (e) { setTestMsg('❌ Network error') }
    finally { setTesting(false); setTimeout(()=> setTestMsg(''), 5000) }
  }

  async function saveSettings() {
    if (!isAuthenticated) {
      setMessage('You must be logged in as admin to save settings.')
      return
    }
    
    setLoading(true)
    setMessage('')
    try {
      const settingsData = {
        monthly_maintenance: parseFloat(settings.monthly_maintenance) || 140,
        monthly_price: parseFloat(settings.monthly_price) || 15,
        yearly_price: parseFloat(settings.yearly_price) || 85,
        stream_monthly_price: parseFloat(settings.stream_monthly_price) || 5,
        stream_yearly_price: parseFloat(settings.stream_yearly_price) || 20,
        three_year_price: parseFloat(settings.three_year_price) || 180,
        stream_three_year_price: parseFloat(settings.stream_three_year_price) || 40,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: settings.smtp_user,
        smtp_pass: settings.smtp_pass,
        smtp_from: settings.smtp_from,
        paypal_email: settings.paypal_email,
        payment_lock: Boolean(settings.payment_lock),
        chat_online: Boolean(settings.chat_online),
        hero_image_url: settings.hero_image_url,
        admin_user: settings.admin_user,
        admin_pass: settings.admin_pass,
        timezone: settings.timezone,
        company_name: settings.company_name,
        bg_music_url: settings.bg_music_url,
        bg_music_volume: parseFloat(settings.bg_music_volume) || 0.1,
        bg_music_enabled: Boolean(settings.bg_music_enabled),
        plex_token: settings.plex_token,
        plex_server_url: settings.plex_server_url
      }
      const res = await fetch('/api/admin/settings', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(settingsData) })
      const body = await res.json().catch(()=>({}))
      
      if (!res.ok) {
        setMessage(body?.error || 'Failed to save to database. Saved locally.')
      } else if (body.dbOk === false) {
        setMessage('⚠️ Saved to browser, but Database write failed. Did you run the Migration SQL in Supabase?')
      } else {
        setMessage('Settings saved to Database successfully!')
        try{ await fetch('/api/admin/auth/upsert', { method:'POST' }) } catch{}
      }
      
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('admin_settings', JSON.stringify(settingsData))
          document.cookie = `admin_settings=${encodeURIComponent(JSON.stringify(settingsData))}; path=/; max-age=31536000`
        }
      } catch {}
    } catch (e: any) {
      setMessage('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      saveSettings()
    }
  }

  if (authLoading) {
    return (
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-400">Checking authentication...</div>
          </div>
        </div>
      </main>
    )
  }

  if (!isAuthenticated && !authLoading) {
    return (
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass p-6 rounded-2xl text-center">
            <h1 className="text-2xl font-bold mb-4 text-rose-400">Access Denied</h1>
            <p className="text-slate-400 mb-4">You must be logged in as an admin to access settings.</p>
            <a 
              className="btn" 
              href="/login"
            >
              Go to Login
            </a>
            
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              supabaseStatus === 'connected' ? 'bg-emerald-500' : 
              supabaseStatus === 'error' ? 'bg-rose-500' : 'bg-yellow-500 animate-pulse'
            }`}></div>
            <span className="text-sm text-slate-400">
              {supabaseStatus === 'connected' ? 'Connected' : 
               supabaseStatus === 'error' ? 'Not Configured' : 'Checking...'}
            </span>
            <a href="/admin" className="btn-xs-outline ml-3">← Back to Chat</a>
          </div>
        </div>
        

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Service Updates</h2>
          <div className="space-y-3 mb-4">
            <input className="input" placeholder="Title" value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
            <textarea className="input" placeholder="Write the update..." rows={5} value={newContent} onChange={e=>setNewContent(e.target.value)} />
            <button className="btn" onClick={publishUpdate} disabled={publishing || !newTitle.trim() || !newContent.trim()}>{publishing ? 'Publishing...' : 'Publish Update'}</button>
            {updateMsg && (<div className={`text-sm ${updateMsg.startsWith('Failed') || updateMsg.includes('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>{updateMsg}</div>)}
          </div>
          {updates.length > 0 && (
            <div>
              <div className="text-slate-400 mb-2 font-medium">Previous Updates</div>
              <div className="space-y-3">
                {updates.map((u, idx)=> (
                  <div key={(u as any).id || idx} className="glass p-4 rounded-xl border border-cyan-500/10 hover:border-cyan-500/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-slate-200">{u.title}</div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-500">{require('date-fns').format(new Date(u.created_at), 'dd MMM yyyy')}</div>
                        {(u as any).id && (
                          <button 
                            className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                            onClick={()=> deleteUpdate((u as any).id)}
                          >Delete</button>
                        )}
                      </div>
                    </div>
                    <div className="text-slate-400 text-sm whitespace-pre-wrap">{u.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Chat Availability</h2>
          <div className="flex items-center gap-3">
            <label className="label">Online</label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={settings.chat_online} onChange={e=> setSettings({ ...settings, chat_online: e.target.checked })} />
              <span className="text-xs text-slate-400">When disabled, customers see an offline notice and can leave a message; you&apos;ll receive it in the admin messenger.</span>
            </label>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Email Configuration (SMTP)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">SMTP Host</label>
              <input 
                className="input" 
                placeholder="smtp.gmail.com" 
                value={settings.smtp_host} 
                onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">SMTP Port</label>
              <input 
                className="input" 
                placeholder="587" 
                value={settings.smtp_port} 
                onChange={e => setSettings({...settings, smtp_port: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">SMTP Username</label>
              <input 
                className="input" 
                placeholder="your-email@gmail.com" 
                value={settings.smtp_user} 
                onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">SMTP Password</label>
              <input 
                className="input" 
                type="password"
                placeholder="App password or SMTP password" 
                value={settings.smtp_pass} 
                onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">From Email Address</label>
              <input 
                className="input" 
                placeholder="noreply@yourcompany.com" 
                value={settings.smtp_from} 
                onChange={e => setSettings({...settings, smtp_from: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Plex Configuration</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Plex Token (X-Plex-Token)</label>
              <input 
                className="input" 
                type="password"
                value={settings.plex_token || ''}
                onChange={e => setSettings({...settings, plex_token: e.target.value})}
                placeholder="Ex: abcdef123456"
              />
              <div className="text-xs text-slate-500 mt-1">Found in XML of Plex web app or Tautulli settings.</div>
            </div>
            <div>
              <label className="label">Plex Server URL</label>
              <input 
                className="input" 
                value={settings.plex_server_url || ''}
                onChange={e => setSettings({...settings, plex_server_url: e.target.value})}
                placeholder="Ex: https://plex.tv or http://IP:32400"
              />
              <div className="text-xs text-slate-500 mt-1">Use https://plex.tv to sync via cloud, or local IP if accessible.</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button className="btn-outline text-xs" onClick={testPlex} disabled={testing || !settings.plex_token}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {testMsg && <div className="text-sm text-slate-300">{testMsg}</div>}
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Payment Configuration</h2>
          <div>
            <label className="label">PayPal Email Address</label>
            <input 
              className="input" 
              placeholder="your-paypal-email@domain.com" 
              value={settings.paypal_email} 
              onChange={e => setSettings({...settings, paypal_email: e.target.value})}
              onKeyPress={handleKeyPress}
            />
            <div className="mt-4 flex items-center gap-3">
              <label className="label">Payment Lock</label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={settings.payment_lock} onChange={e=> setSettings({ ...settings, payment_lock: e.target.checked })} />
                <span className="text-xs text-slate-400">When enabled: new customers cannot pay; only active subscribers can extend before due date.</span>
              </label>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Business Settings</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Company Name</label>
              <input 
                className="input" 
                placeholder="Streamz R Us" 
                value={settings.company_name} 
                onChange={e => setSettings({...settings, company_name: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select 
                className="input" 
                value={settings.timezone} 
                onChange={e => setSettings({...settings, timezone: e.target.value})}
              >
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Hero Image URL</label>
              <input 
                className="input" 
                placeholder="https://example.com/your-image.jpg" 
                value={settings.hero_image_url} 
                onChange={e => setSettings({...settings, hero_image_url: e.target.value})}
                onKeyPress={handleKeyPress}
              />
              <div className="text-xs text-slate-500 mt-1">Shown on the homepage hero card. Uses responsive contain-fit.</div>
            </div>
            <div>
              <label className="label">Monthly Maintenance Cost (£)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                placeholder="140.00" 
                value={settings.monthly_maintenance} 
                onChange={e => setSettings({...settings, monthly_maintenance: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Admin Credentials</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Admin Username</label>
              <input 
                className="input" 
                placeholder="Admin username" 
                value={settings.admin_user} 
                onChange={e => setSettings({...settings, admin_user: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Admin Password</label>
              <input 
                className="input" 
                type="password"
                placeholder="Admin password" 
                value={settings.admin_pass} 
                onChange={e => setSettings({...settings, admin_pass: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div className="md:col-span-2 text-xs text-slate-500">Used for local admin login when Supabase is not available. Saved to settings storage.</div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Pricing Configuration</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Monthly Base Price (£)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={settings.monthly_price}
                onChange={e=>setSettings({...settings, monthly_price: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Yearly Base Price (£)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={settings.yearly_price}
                onChange={e=>setSettings({...settings, yearly_price: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Additional Stream (Monthly) (£)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={settings.stream_monthly_price}
                onChange={e=>setSettings({...settings, stream_monthly_price: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Additional Stream (Yearly) (£)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={settings.stream_yearly_price}
                onChange={e=>setSettings({...settings, stream_yearly_price: e.target.value})}
                onKeyPress={handleKeyPress}
              />
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">These prices update the customer portal totals immediately. In demo mode, they save locally; with Supabase configured, they persist to the database.</div>
        </div>

        {/* Configuration Status */}
        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuration Status</h2>
          {supabaseStatus === 'error' && (
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-amber-300 mb-2">Supabase Not Configured</h3>
              <p className="text-amber-200 text-sm mb-3">
                To enable settings persistence and full functionality, you need to configure Supabase:
              </p>
              <ol className="text-amber-200 text-sm space-y-1 list-decimal list-inside">
                <li>Go to your Supabase project dashboard</li>
                <li>Click on &quot;Settings&quot; → &quot;API&quot; in the sidebar</li>
                <li>Copy your Project URL and add it to <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> in your .env.local file</li>
                <li>Copy your anon/public key and add it to <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your .env.local file</li>
                <li>Restart your development server</li>
              </ol>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400 mb-2">Plex Integration</div>
              <div className={`flex items-center gap-2 ${
                settings.plex_token ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  settings.plex_token ? 'bg-emerald-500' : 'bg-slate-700'
                }`}></div>
                {settings.plex_token ? 'Token Configured' : 'Token Missing'}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-2">Email Service</div>
              <div className={`flex items-center gap-2 ${
                settings.smtp_host && settings.smtp_user && settings.smtp_pass 
                  ? 'text-emerald-400' 
                  : 'text-rose-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  settings.smtp_host && settings.smtp_user && settings.smtp_pass 
                    ? 'bg-emerald-500' 
                    : 'bg-rose-500'
                }`}></div>
                {settings.smtp_host && settings.smtp_user && settings.smtp_pass 
                  ? 'Configured' 
                  : 'Not Configured'}
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-4 ${message.includes('Error') ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
            {message}
          </div>
        )}

        <button 
          className="btn" 
          onClick={saveSettings}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </main>
  )
}
