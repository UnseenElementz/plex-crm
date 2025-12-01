"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function CustomerRegisterPage(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [plexUsername, setPlexUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function register(){
    setError('')
    setLoading(true)
    
    const s = getSupabase()
    if (!s){ 
      try {
        const profile = { fullName, email, plan: 'monthly', streams: 1, nextDueDate: new Date().toISOString(), plexUsername }
        if (typeof window !== 'undefined') {
          localStorage.setItem('customerProfile', JSON.stringify(profile))
          sessionStorage.setItem('customerDemo', 'true')
        }
        router.push('/customer')
      } finally {
        setLoading(false)
      }
      return 
    }
    
    try {
      const { data, error } = await s.auth.signUp({ 
        email, 
        password, 
        options: { 
          data: { 
            role: 'customer', 
            fullName,
            plexUsername
          } 
        } 
      })
      
      if (error) { 
        setError(error.message); 
        setLoading(false)
        return 
      }
      
      const user = data.user
      if (!user) { 
        setError('Registration failed. Please try again.'); 
        setLoading(false)
        return 
      }
      
      // Create customer profile
      await s.from('profiles').insert({ 
        user_id: user.id, 
        email, 
        role: 'customer',
        full_name: fullName
      })
      
      // Create customer record
      await s.from('customers').insert({ 
        name: fullName || email, 
        email, 
        subscription_type: 'monthly', 
        streams: 1, 
        next_payment_date: new Date().toISOString(),
        start_date: new Date().toISOString(),
        notes: plexUsername ? `Plex: ${plexUsername}` : undefined
      })
      
      // Redirect to customer portal
      router.push('/customer')
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email && password && fullName) {
      register()
    }
  }

  return (
    <main className="p-6 flex items-center justify-center min-h-screen">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Customer Registration</h1>
          <p className="text-slate-400">Create your account to access our services</p>
        </div>
        
        <div className="space-y-4">
          <input 
            className="input w-full" 
            placeholder="Full Name" 
            value={fullName}
            onChange={e=>setFullName(e.target.value)}
            onKeyPress={handleKeyPress}
          />

          <input 
            className="input w-full" 
            placeholder="Plex Username" 
            value={plexUsername}
            onChange={e=>setPlexUsername(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          
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
            onClick={register}
            disabled={!email || !password || !fullName || loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>
        
        <div className="mt-6 text-center text-sm text-slate-400 space-y-2">
          <div>
            Already have an account?{' '}
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/customer/login">
              Sign In
            </Link>
          </div>
          <div>
            <Link className="text-slate-500 hover:text-slate-300 transition-colors" href="/login">
              Admin Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
