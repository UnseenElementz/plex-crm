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
    // Local admin override
    if (loginLocalAdmin(email, password)) { 
      sessionStorage.setItem('localAdmin', 'true')
      router.replace('/admin')
      return 
    }
    // Supabase login
    const s = getSupabase()
    if (!s){ setError('Customer login requires Supabase to be configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'); return }
    const adminAliasEmail = 'admin@streamzrus.local'
    const isUsername = !email.includes('@')
    const supaEmail = isUsername ? adminAliasEmail : email
    let { error } = await s.auth.signInWithPassword({ email: supaEmail, password })
    if (error && isUsername) {
      try { await fetch('/api/admin/auth/upsert') } catch {}
      const retry = await s.auth.signInWithPassword({ email: supaEmail, password })
      error = retry.error || null
    }
    if (error) { setError(error.message || 'Login failed'); return }
    const { data: profs } = await s.from('profiles').select('*').eq('email', supaEmail).limit(1)
    const role = profs?.[0]?.role || (supaEmail===adminAliasEmail ? 'admin' : 'customer')
    if (role==='admin') { sessionStorage.setItem('localAdmin', 'true') }
    router.replace(role==='admin' ? '/admin' : '/customer')
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
