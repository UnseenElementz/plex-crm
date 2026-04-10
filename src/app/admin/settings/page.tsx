"use client"
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { getSupabase } from '@/lib/supabaseClient'
import { applyUniformDiscount, inferUniformDiscountPercentage, STANDARD_PRICING_CONFIG } from '@/lib/pricing'

function formatPriceInput(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function parsePriceInput(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampPercentage(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(100, Math.max(0, parsed))
}

function buildPricingFields(input: {
  packageDiscount: string
  settings: {
    yearly_price: string
    stream_yearly_price: string
    movies_only_price: string
    tv_only_price: string
    downloads_price: string
  }
}) {
  const percentageDiscount = clampPercentage(input.packageDiscount)
  if (percentageDiscount !== null) {
    const discounted = applyUniformDiscount(percentageDiscount)
    return {
      percentageDiscount,
      pricing: discounted,
      display: {
        yearly_price: formatPriceInput(discounted.yearly_price),
        stream_yearly_price: formatPriceInput(discounted.stream_yearly_price),
        movies_only_price: formatPriceInput(discounted.movies_only_price),
        tv_only_price: formatPriceInput(discounted.tv_only_price),
        downloads_price: formatPriceInput(discounted.downloads_price ?? STANDARD_PRICING_CONFIG.downloads_price ?? 20),
      },
    }
  }

  const pricing = {
    yearly_price: parsePriceInput(input.settings.yearly_price, STANDARD_PRICING_CONFIG.yearly_price),
    stream_yearly_price: parsePriceInput(input.settings.stream_yearly_price, STANDARD_PRICING_CONFIG.stream_yearly_price),
    movies_only_price: parsePriceInput(input.settings.movies_only_price, STANDARD_PRICING_CONFIG.movies_only_price),
    tv_only_price: parsePriceInput(input.settings.tv_only_price, STANDARD_PRICING_CONFIG.tv_only_price),
    downloads_price: parsePriceInput(input.settings.downloads_price, STANDARD_PRICING_CONFIG.downloads_price ?? 20),
  }

  return {
    percentageDiscount: null,
    pricing,
    display: {
      yearly_price: formatPriceInput(pricing.yearly_price),
      stream_yearly_price: formatPriceInput(pricing.stream_yearly_price),
      movies_only_price: formatPriceInput(pricing.movies_only_price),
      tv_only_price: formatPriceInput(pricing.tv_only_price),
      downloads_price: formatPriceInput(pricing.downloads_price),
    },
  }
}

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
    company_name: '',
    yearly_price: '85',
    stream_yearly_price: '20',
    movies_only_price: '60',
    tv_only_price: '60',
    downloads_price: '20',
    bg_music_url: '',
    bg_music_volume: '0.1',
    bg_music_enabled: true,
    plex_token: '',
    plex_server_url: 'https://plex.tv',
    imap_host: '',
    imap_port: '993',
    imap_user: '',
    imap_pass: '',
    imap_secure: true,
    imap_mailbox: 'INBOX',
    service_email_keywords: 'plex,stream,service,payment,renewal,buffer,login,support,subscription',
    email_auto_reply_enabled: true,
    email_auto_reply_subject: 'We got your message',
    email_auto_reply_body: 'Hi {{first_name}},\n\nThank you for messaging Streamz R Us.\n\nA member of the team will be with you shortly.\n\nDue to high demand, please allow up to 24 hours for a reply, although it is usually much quicker.\n\nThanks,\nStreamz R Us'
  })
  const [packageDiscount, setPackageDiscount] = useState('')
  const [imapConfigured, setImapConfigured] = useState(false)
  const [imapSource, setImapSource] = useState<'database' | 'env' | 'unavailable'>('unavailable')
  const [loading, setLoading] = useState(true) // Start as true to wait for loadSettings
  const [saveLoading, setSaveLoading] = useState(false)
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
  const [dbMode, setDbMode] = useState<'checking' | 'database' | 'local'>('checking')
  const [dbDetail, setDbDetail] = useState('')

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
      // ABSOLUTE TRUTH: Always fetch from server/database
      const res = await fetch(`/api/admin/settings?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const rawDbStatus = res.headers.get('X-DB-Status') || 'unknown'
        const isDatabaseMode = rawDbStatus === 'found' || rawDbStatus === 'empty'
        setSupabaseStatus(isDatabaseMode ? 'connected' : 'error')
        setDbMode(isDatabaseMode ? 'database' : 'local')
        setDbDetail(rawDbStatus)
        setImapConfigured(Boolean(data.imap_configured ?? (data.imap_host && data.imap_user && data.imap_pass)))
        setImapSource((data.imap_source as 'database' | 'env' | 'unavailable') || 'database')
        
        setSettings({
          smtp_host: data.smtp_host ?? '',
          smtp_port: data.smtp_port ?? '587',
          smtp_user: data.smtp_user ?? '',
          smtp_pass: data.smtp_pass ?? '',
          smtp_from: data.smtp_from ?? '',
          paypal_email: data.paypal_email ?? '',
          payment_lock: data.payment_lock !== undefined ? Boolean(data.payment_lock) : false,
          chat_online: data.chat_online !== undefined ? Boolean(data.chat_online) : true,
          hero_image_url: data.hero_image_url ?? '',
          admin_user: data.admin_user ?? 'Anfrax786',
          admin_pass: data.admin_pass ?? 'Badaman1',
          timezone: data.timezone ?? 'Europe/London',
          monthly_maintenance: data.monthly_maintenance?.toString() ?? '140',
          company_name: data.company_name ?? '',
          yearly_price: data.yearly_price?.toString() ?? '85',
          stream_yearly_price: data.stream_yearly_price?.toString() ?? '20',
          movies_only_price: data.movies_only_price?.toString() ?? '60',
          tv_only_price: data.tv_only_price?.toString() ?? '60',
          downloads_price: data.downloads_price?.toString() ?? '20',
          bg_music_url: data.bg_music_url ?? '',
          bg_music_volume: data.bg_music_volume?.toString() ?? '0.1',
          bg_music_enabled: data.bg_music_enabled !== undefined ? Boolean(data.bg_music_enabled) : true,
          plex_token: data.plex_token ?? '',
          plex_server_url: data.plex_server_url ?? 'https://plex.tv',
          imap_host: data.imap_host ?? '',
          imap_port: data.imap_port?.toString() ?? '993',
          imap_user: data.imap_user ?? '',
          imap_pass: data.imap_source === 'env' ? '' : (data.imap_pass ?? ''),
          imap_secure: data.imap_secure !== undefined ? Boolean(data.imap_secure) : true,
          imap_mailbox: data.imap_mailbox ?? 'INBOX',
          service_email_keywords: data.service_email_keywords ?? 'plex,stream,service,payment,renewal,buffer,login,support,subscription',
          email_auto_reply_enabled: data.email_auto_reply_enabled !== undefined ? Boolean(data.email_auto_reply_enabled) : true,
          email_auto_reply_subject: data.email_auto_reply_subject ?? 'We got your message',
          email_auto_reply_body: data.email_auto_reply_body ?? 'Hi {{first_name}},\n\nThank you for messaging Streamz R Us.\n\nA member of the team will be with you shortly.\n\nDue to high demand, please allow up to 24 hours for a reply, although it is usually much quicker.\n\nThanks,\nStreamz R Us'
        })
        const inferredDiscount = inferUniformDiscountPercentage(data)
        setPackageDiscount(inferredDiscount && inferredDiscount > 0 ? formatPriceInput(inferredDiscount) : '')
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
      setSupabaseStatus('error')
      setDbMode('local')
      setDbDetail('request-failed')
    } finally {
      setLoading(false)
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
        setTestMsg('Connected: ' + data.message)
      } else {
        setTestMsg('Connection failed: ' + (data.error || 'Failed'))
      }
    } catch (e) { setTestMsg('Connection failed: Network error') }
    finally { setTesting(false); setTimeout(()=> setTestMsg(''), 5000) }
  }

  async function saveSettings() {
    if (!isAuthenticated) {
      setMessage('You must be logged in as admin to save settings.')
      return
    }
    
    setSaveLoading(true)
    setMessage('')
    try {
      try {
        const check = await fetch('/api/admin/auth/session', { cache: 'no-store' })
        if (!check.ok) {
          const s = getSupabase()
          const { data: { user } } = s ? await s.auth.getUser() : { data: { user: null } as any }
          if (user?.email) {
            await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: user.email }) }).catch(()=>{})
          }
        }
      } catch {}

      const pricingDraft = buildPricingFields({
        packageDiscount,
        settings: {
          yearly_price: settings.yearly_price,
          stream_yearly_price: settings.stream_yearly_price,
          movies_only_price: settings.movies_only_price,
          tv_only_price: settings.tv_only_price,
          downloads_price: settings.downloads_price,
        },
      })
      const settingsData = {
        monthly_maintenance: parseFloat(settings.monthly_maintenance) || 140,
        yearly_price: pricingDraft.pricing.yearly_price,
        stream_yearly_price: pricingDraft.pricing.stream_yearly_price,
        movies_only_price: pricingDraft.pricing.movies_only_price,
        tv_only_price: pricingDraft.pricing.tv_only_price,
        downloads_price: pricingDraft.pricing.downloads_price,
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
        plex_server_url: settings.plex_server_url,
        imap_host: settings.imap_host,
        imap_port: settings.imap_port,
        imap_user: settings.imap_user,
        imap_pass: settings.imap_pass,
        imap_secure: Boolean(settings.imap_secure),
        imap_mailbox: settings.imap_mailbox,
        service_email_keywords: settings.service_email_keywords,
        email_auto_reply_enabled: Boolean(settings.email_auto_reply_enabled),
        email_auto_reply_subject: settings.email_auto_reply_subject,
        email_auto_reply_body: settings.email_auto_reply_body
      }
      const res = await fetch('/api/admin/settings', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(settingsData) })
      const body = await res.json().catch(()=>({}))
      
      if (!res.ok) {
        if (res.status === 401) {
          setMessage('Unauthorized: admin session missing. Please log in again, then try Save.')
        } else {
          setMessage(body?.error || 'Failed to save settings.')
        }
      } else if (body.dbOk === false) {
        setSupabaseStatus('error')
        setDbMode('local')
        setMessage('Database write failed: ' + (body.dbError || 'Check Supabase env and table setup.'))
      } else {
        setSupabaseStatus('connected')
        setDbMode('database')
        setMessage('Settings saved successfully.')

        const confirmedSettings = body.settings || settingsData
        setSettings({
          smtp_host: confirmedSettings.smtp_host ?? settings.smtp_host,
          smtp_port: confirmedSettings.smtp_port?.toString() ?? settings.smtp_port,
          smtp_user: confirmedSettings.smtp_user ?? settings.smtp_user,
          smtp_pass: confirmedSettings.smtp_pass ?? settings.smtp_pass,
          smtp_from: confirmedSettings.smtp_from ?? settings.smtp_from,
          paypal_email: confirmedSettings.paypal_email ?? settings.paypal_email,
          payment_lock: confirmedSettings.payment_lock !== undefined ? Boolean(confirmedSettings.payment_lock) : settings.payment_lock,
          chat_online: confirmedSettings.chat_online !== undefined ? Boolean(confirmedSettings.chat_online) : settings.chat_online,
          hero_image_url: confirmedSettings.hero_image_url ?? settings.hero_image_url,
          admin_user: confirmedSettings.admin_user ?? settings.admin_user,
          admin_pass: confirmedSettings.admin_pass ?? settings.admin_pass,
          timezone: confirmedSettings.timezone ?? settings.timezone,
          monthly_maintenance: confirmedSettings.monthly_maintenance?.toString() ?? settings.monthly_maintenance,
          company_name: confirmedSettings.company_name ?? settings.company_name,
          yearly_price: confirmedSettings.yearly_price?.toString() ?? pricingDraft.display.yearly_price,
          stream_yearly_price: confirmedSettings.stream_yearly_price?.toString() ?? pricingDraft.display.stream_yearly_price,
          movies_only_price: confirmedSettings.movies_only_price?.toString() ?? pricingDraft.display.movies_only_price,
          tv_only_price: confirmedSettings.tv_only_price?.toString() ?? pricingDraft.display.tv_only_price,
          downloads_price: confirmedSettings.downloads_price?.toString() ?? pricingDraft.display.downloads_price,
          bg_music_url: confirmedSettings.bg_music_url ?? settings.bg_music_url,
          bg_music_volume: confirmedSettings.bg_music_volume?.toString() ?? settings.bg_music_volume,
          bg_music_enabled: confirmedSettings.bg_music_enabled !== undefined ? Boolean(confirmedSettings.bg_music_enabled) : settings.bg_music_enabled,
          plex_token: confirmedSettings.plex_token ?? settings.plex_token,
          plex_server_url: confirmedSettings.plex_server_url ?? settings.plex_server_url,
          imap_host: confirmedSettings.imap_host ?? settings.imap_host,
          imap_port: confirmedSettings.imap_port?.toString() ?? settings.imap_port,
          imap_user: confirmedSettings.imap_user ?? settings.imap_user,
          imap_pass: confirmedSettings.imap_source === 'env' ? '' : (confirmedSettings.imap_pass ?? settings.imap_pass),
          imap_secure: confirmedSettings.imap_secure !== undefined ? Boolean(confirmedSettings.imap_secure) : settings.imap_secure,
          imap_mailbox: confirmedSettings.imap_mailbox ?? settings.imap_mailbox,
          service_email_keywords: confirmedSettings.service_email_keywords ?? settings.service_email_keywords,
          email_auto_reply_enabled: confirmedSettings.email_auto_reply_enabled !== undefined ? Boolean(confirmedSettings.email_auto_reply_enabled) : settings.email_auto_reply_enabled,
          email_auto_reply_subject: confirmedSettings.email_auto_reply_subject ?? settings.email_auto_reply_subject,
          email_auto_reply_body: confirmedSettings.email_auto_reply_body ?? settings.email_auto_reply_body,
        })
        const inferredDiscount = inferUniformDiscountPercentage(confirmedSettings)
        setPackageDiscount(inferredDiscount && inferredDiscount > 0 ? formatPriceInput(inferredDiscount) : '')
        setImapConfigured(Boolean(confirmedSettings.imap_configured ?? (confirmedSettings.imap_host && confirmedSettings.imap_user && confirmedSettings.imap_pass)))
        setImapSource((confirmedSettings.imap_source as 'database' | 'env' | 'unavailable') || imapSource)

        try{ await fetch('/api/admin/auth/upsert', { method:'POST' }) } catch{}
      }
    } catch (e: any) {
      setMessage('Error: ' + e.message)
    } finally {
      setSaveLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      saveSettings()
    }
  }

  async function ensureAdminSession() {
    try {
      const check = await fetch('/api/admin/auth/session', { cache: 'no-store' })
      if (check.ok) return true
    } catch {}

    const supabase = getSupabase()
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } as any }
    if (!user?.email) return false

    try {
      const hydrated = await fetch('/api/admin/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      return hydrated.ok
    } catch {
      return false
    }
  }

  async function persistPricing(pricing: {
    yearly_price: number
    stream_yearly_price: number
    movies_only_price: number
    tv_only_price: number
    downloads_price: number
  }) {
    const hasSession = await ensureAdminSession()
    if (!hasSession) {
      setMessage('Unauthorized: admin session missing. Please log in again, then try the discount tool.')
      return false
    }

    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(body?.error || 'Failed to save pricing.')
      return false
    }
    const confirmedSettings = body.settings || pricing
    setSettings((current) => ({
      ...current,
      yearly_price: confirmedSettings.yearly_price?.toString() ?? current.yearly_price,
      stream_yearly_price: confirmedSettings.stream_yearly_price?.toString() ?? current.stream_yearly_price,
      movies_only_price: confirmedSettings.movies_only_price?.toString() ?? current.movies_only_price,
      tv_only_price: confirmedSettings.tv_only_price?.toString() ?? current.tv_only_price,
      downloads_price: confirmedSettings.downloads_price?.toString() ?? current.downloads_price,
    }))
    const inferredDiscount = inferUniformDiscountPercentage(confirmedSettings)
    setPackageDiscount(inferredDiscount && inferredDiscount > 0 ? formatPriceInput(inferredDiscount) : '')
    return true
  }

  async function applyPackageDiscount() {
    const percentage = clampPercentage(packageDiscount)
    if (percentage === null) {
      setMessage('Enter a valid discount percentage between 0 and 100.')
      return
    }

    const discounted = applyUniformDiscount(percentage)
    const saved = await persistPricing({
      yearly_price: discounted.yearly_price,
      stream_yearly_price: discounted.stream_yearly_price,
      movies_only_price: discounted.movies_only_price,
      tv_only_price: discounted.tv_only_price,
      downloads_price: discounted.downloads_price ?? STANDARD_PRICING_CONFIG.downloads_price ?? 20,
    })
    if (saved) {
      setMessage(`${formatPriceInput(percentage)}% discount is now live for customers.`)
    }
  }

  async function resetPackagePrices() {
    const saved = await persistPricing({
      yearly_price: STANDARD_PRICING_CONFIG.yearly_price,
      stream_yearly_price: STANDARD_PRICING_CONFIG.stream_yearly_price,
      movies_only_price: STANDARD_PRICING_CONFIG.movies_only_price,
      tv_only_price: STANDARD_PRICING_CONFIG.tv_only_price,
      downloads_price: STANDARD_PRICING_CONFIG.downloads_price ?? 20,
    })
    if (saved) {
      setPackageDiscount('')
      setMessage('Standard prices are live again. The customer discount banner is now removed.')
    }
  }

  const pricingDraft = buildPricingFields({
    packageDiscount,
    settings: {
      yearly_price: settings.yearly_price,
      stream_yearly_price: settings.stream_yearly_price,
      movies_only_price: settings.movies_only_price,
      tv_only_price: settings.tv_only_price,
      downloads_price: settings.downloads_price,
    },
  })
  const discountPreview = pricingDraft.percentageDiscount
  const previewPrices = pricingDraft.display

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

  if (loading) {
    return (
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-400">Loading live settings...</div>
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
              {supabaseStatus === 'connected' ? 'Database Connected' : 
               supabaseStatus === 'error' ? 'Database Issue' : 'Checking...'}
            </span>
            <a href="/admin" className="btn-xs-outline ml-3">Back to Chat</a>
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
                        <div className="text-xs text-slate-500">{format(new Date(u.created_at), 'dd MMM yyyy HH:mm')}</div>
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
          <h2 className="text-xl font-semibold mb-4">Inbound Email Inbox (IMAP / Gmail)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">IMAP Host</label>
              <input className="input" placeholder="imap.gmail.com" value={settings.imap_host} readOnly={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_host: e.target.value })} />
            </div>
            <div>
              <label className="label">IMAP Port</label>
              <input className="input" placeholder="993" value={settings.imap_port} readOnly={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_port: e.target.value })} />
            </div>
            <div>
              <label className="label">IMAP Username</label>
              <input className="input" placeholder="your-email@gmail.com" value={settings.imap_user} readOnly={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_user: e.target.value })} />
            </div>
            <div>
              <label className="label">IMAP Password / App Password</label>
              <input className="input" type="password" placeholder={imapSource === 'env' ? 'Stored securely in server env' : 'Gmail app password'} value={settings.imap_pass} readOnly={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_pass: e.target.value })} />
            </div>
            <div>
              <label className="label">Mailbox</label>
              <input className="input" placeholder="INBOX" value={settings.imap_mailbox} readOnly={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_mailbox: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={settings.imap_secure} disabled={imapSource === 'env'} onChange={e => setSettings({ ...settings, imap_secure: e.target.checked })} />
                <span className="text-xs text-slate-400">Use secure IMAP</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="label">Service Keywords</label>
              <input
                className="input"
                placeholder="plex,stream,service,payment,renewal,buffer,login,support"
                value={settings.service_email_keywords}
                readOnly={imapSource === 'env'}
                onChange={e => setSettings({ ...settings, service_email_keywords: e.target.value })}
              />
              <div className="text-xs text-slate-500 mt-1">Only customer replies containing one of these keywords will show in the website inbox.</div>
              {imapSource === 'env' ? <div className="text-xs text-cyan-300 mt-2">This inbox is secured in server environment variables, so the app password is not stored in the database.</div> : null}
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Auto Reply</h2>
          <div className="space-y-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.email_auto_reply_enabled}
                onChange={e => setSettings({ ...settings, email_auto_reply_enabled: e.target.checked })}
              />
              <span className="text-sm text-slate-300">Send one automatic reply to each new matched inbox message</span>
            </label>
            <div>
              <label className="label">Auto Reply Subject</label>
              <input
                className="input"
                placeholder="We got your message"
                value={settings.email_auto_reply_subject}
                onChange={e => setSettings({ ...settings, email_auto_reply_subject: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Auto Reply Body</label>
              <textarea
                className="input min-h-[12rem]"
                value={settings.email_auto_reply_body}
                onChange={e => setSettings({ ...settings, email_auto_reply_body: e.target.value })}
              />
              <div className="mt-2 text-xs text-slate-500">
                Supports <code className="bg-slate-800 px-1 rounded">{'{{first_name}}'}</code>, <code className="bg-slate-800 px-1 rounded">{'{{full_name}}'}</code>, <code className="bg-slate-800 px-1 rounded">{'{{email}}'}</code>, and <code className="bg-slate-800 px-1 rounded">{'{{company_name}}'}</code>.
              </div>
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
                <span className="text-xs text-slate-400">When enabled: the service stays closed to new member payments; only active subscribers can extend before their due date.</span>
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
                placeholder="Ex: Streamz R Us" 
                value={settings.company_name} 
                onChange={e => setSettings({...settings, company_name: e.target.value})}
                onKeyPress={handleKeyPress}
              />
              <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">
                Use a clean trading name shown across the site.
              </div>
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
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <input 
                    className="input" 
                    placeholder="https://example.com/your-image.jpg" 
                    value={settings.hero_image_url} 
                    onChange={e => setSettings({...settings, hero_image_url: e.target.value})}
                    onKeyPress={handleKeyPress}
                  />
                  <div className="text-xs text-slate-500 mt-1">Shown on the homepage hero card. Uses responsive contain-fit.</div>
                </div>
                {settings.hero_image_url && (
                  <div className="w-24 h-24 rounded-lg border border-slate-700 overflow-hidden bg-slate-900 shrink-0">
                    <img 
                      src={settings.hero_image_url} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Invalid+URL' }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="label">Monthly Maintenance Cost (GBP)</label>
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
          <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label className="label">Reduce All Package Prices By (%)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="50"
                  value={packageDiscount}
                  onChange={e => setPackageDiscount(e.target.value)}
                />
                <div className="mt-2 text-xs text-slate-400">
                  Type a percentage like <span className="text-white">50</span> to make every package half price, then save settings.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-xs" type="button" onClick={applyPackageDiscount}>Apply Discount</button>
                <button className="btn-xs-outline" type="button" onClick={resetPackagePrices}>Reset Standard Prices</button>
              </div>
            </div>
            {discountPreview !== null ? (
              <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">Full Access: GBP {previewPrices.yearly_price}</div>
                <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">Extra Stream: GBP {previewPrices.stream_yearly_price}</div>
                <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">Movies Only: GBP {previewPrices.movies_only_price}</div>
                <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">TV Only: GBP {previewPrices.tv_only_price}</div>
                <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">Downloads: GBP {previewPrices.downloads_price}</div>
              </div>
            ) : null}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Yearly Base Price (GBP)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={pricingDraft.display.yearly_price}
                onChange={e=>{
                  setPackageDiscount('')
                  setSettings({...settings, yearly_price: e.target.value})
                }}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Additional Stream (Yearly) (GBP)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={pricingDraft.display.stream_yearly_price}
                onChange={e=>{
                  setPackageDiscount('')
                  setSettings({...settings, stream_yearly_price: e.target.value})
                }}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Movies Only Price (GBP)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={pricingDraft.display.movies_only_price}
                onChange={e=>{
                  setPackageDiscount('')
                  setSettings({...settings, movies_only_price: e.target.value})
                }}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">TV Shows Only Price (GBP)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={pricingDraft.display.tv_only_price}
                onChange={e=>{
                  setPackageDiscount('')
                  setSettings({...settings, tv_only_price: e.target.value})
                }}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <label className="label">Downloads Addon Price (GBP)</label>
              <input 
                className="input" 
                type="number"
                step="0.01"
                value={pricingDraft.display.downloads_price}
                onChange={e=>{
                  setPackageDiscount('')
                  setSettings({...settings, downloads_price: e.target.value})
                }}
                onKeyPress={handleKeyPress}
              />
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">These prices update the customer portal totals immediately. In demo mode, they save locally; with Supabase configured, they persist to the database.</div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuration Status</h2>
          {supabaseStatus === 'error' && (
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-amber-300 mb-2">Database Not Connected</h3>
              <p className="text-amber-200 text-sm mb-3">
                The app cannot reach the database right now. Customer auth, synced CRM data, and full Plex tooling all depend on a working Supabase connection.
              </p>
              <ol className="text-amber-200 text-sm space-y-1 list-decimal list-inside">
                <li>Go to your Supabase project dashboard</li>
                <li>Open Settings then API</li>
                <li>Copy your Project URL and add it to <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> in your .env.local file</li>
                <li>Copy your anon/public key and add it to <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your .env.local file</li>
                <li>Copy your service role key into <code className="bg-slate-800 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code></li>
                <li>Restart your development server</li>
              </ol>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400 mb-2">Settings Storage</div>
              <div className={`flex items-center gap-2 ${dbMode === 'database' ? 'text-emerald-400' : 'text-amber-300'}`}>
                <div className={`w-2 h-2 rounded-full ${dbMode === 'database' ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                {dbMode === 'database' ? 'Database mode' : dbMode === 'local' ? 'Connection issue' : 'Checking'}
              </div>
              {dbDetail ? <div className="mt-1 text-xs text-slate-500">Status: {dbDetail}</div> : null}
            </div>
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
            <div>
              <div className="text-sm text-slate-400 mb-2">Inbound Inbox</div>
              <div className={`flex items-center gap-2 ${
                imapConfigured
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  imapConfigured
                    ? 'bg-emerald-500'
                    : 'bg-rose-500'
                }`}></div>
                {imapConfigured ? (imapSource === 'env' ? 'Configured securely via server env' : 'Configured') : 'Not Configured'}
              </div>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl mb-6">
          <h2 className="text-xl font-semibold mb-4">Access Control</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">Banned customer screen</div>
              <div className="mt-2 text-sm text-slate-400">
                This is the page banned customers see when portal access has been removed.
              </div>
              <a href="/customer/banned" className="btn-outline mt-4 inline-flex" target="_blank" rel="noreferrer">
                Preview banned page
              </a>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">Moderation controls</div>
              <div className="mt-2 text-sm text-slate-400">
                Warnings, bans, and unbans now flow through the security and Plex tools pages so customer access changes can be reviewed and reversed properly.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/admin/security" className="btn-outline">Open Security</a>
                <a href="/admin/plex-tools" className="btn-outline">Open Plex Tools</a>
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
          disabled={saveLoading}
        >
          {saveLoading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </main>
  )
}

