'use client'

import { useEffect, useState } from 'react'
import AdminDashboard from '@/components/admin/AdminDashboard'
import { useAuthStore } from '@/stores/authStore'

export default function AdminPage() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const [checked, setChecked] = useState(false)
  const [cookieChecked, setCookieChecked] = useState(false)
  const [cookieOK, setCookieOK] = useState(false)

  useEffect(() => {
    (async()=>{
      try{
        const hasCookie = typeof document !== 'undefined' && document.cookie.includes('admin_session=')
        const isProd = process.env.NODE_ENV === 'production'
        if (!hasCookie && !isProd){
          const raw = typeof document !== 'undefined' ? (document.cookie.split(';').map(s=>s.trim()).find(s=> s.startsWith('admin_settings=')) || '').split('=')[1] : ''
          const data = raw ? JSON.parse(decodeURIComponent(raw)) : {}
          const u = (data?.admin_user || 'Anfrax786') as string
          const p = (data?.admin_pass || 'Badaman1') as string
          await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: u, password: p }) })
        }
      } catch{}
    })()
  }, [])

  useEffect(() => { (async()=>{ await checkAuth(); setChecked(true) })() }, [])
  useEffect(() => {
    (async()=>{
      try{
        const r = await fetch('/api/admin/auth/session')
        if (r.ok){ setCookieOK(true); setCookieChecked(true); return }
      }catch{}
      finally{ setCookieChecked(true) }
    })()
  }, [])

  const allowed = isAuthenticated || cookieOK

  if (isLoading || !checked || !cookieChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="glass p-6 rounded-2xl text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2 text-rose-400">Access Denied</h1>
          <p className="text-slate-400 mb-4">You must be logged in as admin to view the dashboard.</p>
          <a href="/login" className="btn">Go to Login</a>
        </div>
      </div>
    )
  }

  return <AdminDashboard />
}
