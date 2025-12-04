"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { loginLocalAdmin } from '@/lib/localAdmin'

export default function LoginPage(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function login(){
    setError('')

    const s = getSupabase()
    const adminAliasEmail = process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local'
    const isUsername = !email.includes('@')
    const supaEmail = isUsername ? adminAliasEmail : email
    if (!s){
      if (isUsername && loginLocalAdmin(email, password)){
        try{
          const res = await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: email, password }) })
          if (!res.ok) throw new Error('Invalid admin credentials')
        } catch(e:any){ setError(e?.message || 'Admin login failed'); return }
        router.replace('/admin')
        return
      }
      setError('Login requires Supabase configuration (.env.local).')
      return
    }
    let { error } = await s.auth.signInWithPassword({ email: supaEmail, password })
    if (isUsername) {
      try { await fetch('/api/admin/auth/upsert', { method:'POST' }) } catch {}
      if (error) {
        const retry = await s.auth.signInWithPassword({ email: supaEmail, password })
        error = retry.error || null
      }
    }
    if (error) {
      // Fallback: allow alias admin login without Supabase if credentials match admin settings/env
      if (isUsername && loginLocalAdmin(email, password)){
        try{
          const res = await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: email, password }) })
          if (!res.ok) throw new Error('Invalid admin credentials')
        } catch {}
        router.replace('/admin')
        return
      }
      setError(error.message || 'Login failed');
      return
    }
    const { data: profs } = await s.from('profiles').select('role').eq('email', supaEmail).limit(1)
    const role = profs?.[0]?.role || 'customer'
    const isAdminLogin = (supaEmail.toLowerCase() === adminAliasEmail.toLowerCase()) || role === 'admin'
    if (isAdminLogin) {
      try{ await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email: supaEmail }) }) } catch {}
      router.replace('/admin')
      return
    }
    router.replace('/customer')
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email && password) {
      login()
    }
  }

  return (
    <main className="p-6 flex items-center justify-center">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Login</h2>
        <input className="input mb-3" placeholder="Admin ID or Email" value={email} onChange={e=>setEmail(e.target.value)} onKeyPress={handleKeyPress} />
        <input className="input mb-3" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyPress={handleKeyPress} />
        {error && <div className="text-rose-400 text-sm mb-2">{error}</div>}
        <button className="btn w-full" onClick={login}>Login</button>
        {process.env.NODE_ENV !== 'production' && (
          <button
            className="btn w-full mt-2"
            onClick={async ()=>{
              try{
                const res = await fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: email || 'Anfrax786', password: password || 'Badaman1' }) })
                if (!res.ok) throw new Error('Invalid admin credentials')
                router.replace('/admin')
              } catch {
                setError('Admin quick login failed')
              }
            }}
          >Dev Admin Login</button>
        )}
        <div className="mt-3 text-sm text-slate-400">
          <div className="flex justify-between items-center">
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/forgot-password" prefetch={false}>Forgot password?</Link>
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/register" prefetch={false}>Register</Link>
          </div>
          <div className="text-center mt-2">
            <Link className="text-slate-400 hover:text-cyan-300 transition-colors" href="/customer/login" prefetch={false}>Customer Login</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
