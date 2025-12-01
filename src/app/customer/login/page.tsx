"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function CustomerLoginPage(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function login(){
    setError('')
    
    // Supabase login for customers only
    const s = getSupabase()
    if (!s){ 
      try {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem('customerProfile')
          if (!raw) { setError('Please register first.'); return }
          sessionStorage.setItem('customerDemo', 'true')
        }
        if (typeof window !== 'undefined') {
          window.location.href = '/customer'
        }
      } finally {}
      return 
    }
    
    const { error } = await s.auth.signInWithPassword({ email, password })
    if (error) { 
      setError(error.message); 
      return 
    }
    
    // Verify user is a customer (not admin)
    const { data: profs } = await s.from('profiles').select('*').eq('email', email).limit(1)
    const role = profs?.[0]?.role || 'customer'
    
    if (role === 'admin') {
      setError('Admin users cannot login as customers. Please use the main login page.')
      await s.auth.signOut() // Sign out admin user
      return
    }
    
    // Successful customer login
    if (typeof window !== 'undefined') {
      window.location.href = '/customer'
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email && password) {
      login()
    }
  }

  return (
    <main className="p-6 flex items-center justify-center min-h-screen">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Customer Portal</h1>
          <p className="text-slate-400">Sign in to manage your subscription</p>
        </div>
        
        <div className="space-y-4">
          <input 
            className="input w-full" 
            placeholder="Email" 
            type="email"
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            onKeyPress={handleKeyPress} 
          />
          
          <input 
            className="input w-full" 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e=>setPassword(e.target.value)} 
            onKeyPress={handleKeyPress} 
          />
          
          {error && (
            <div className="text-rose-400 text-sm bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
              {error}
            </div>
          )}
          
          <button 
            className="btn w-full" 
            onClick={login}
            disabled={!email || !password}
          >
            Sign In
          </button>
        </div>
        <div className="mt-4 glass p-4 rounded-lg border border-amber-500/30 bg-amber-900/20">
          <div className="text-amber-200 font-semibold mb-1">Important Notice</div>
          <p className="text-amber-300 text-sm">If you are already a member, please register using your Plex email address to access your account.</p>
        </div>
        
        <div className="mt-6 text-center text-sm text-slate-400 space-y-2">
          <div>
            Don&rsquo;t have an account?{' '}
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/customer/register" prefetch={false}>
              Create Account
            </Link>
          </div>
          <div>
            <Link className="text-slate-500 hover:text-slate-300 transition-colors" href="/forgot-password" prefetch={false}>
              Forgot your password?
            </Link>
          </div>
          <div>
            <Link className="text-slate-500 hover:text-slate-300 transition-colors" href="/login" prefetch={false}>
              Admin Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
