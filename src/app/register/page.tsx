"use client"
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function RegisterPage(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function register(){
    setError('')
    const s = getSupabase()
    if (!s){ setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'); return }
    const { data, error } = await s.auth.signUp({ email, password, options: { data: { role: 'customer', fullName } } })
    if (error) { setError(error.message); return }
    const user = data.user
    if (!user) { setError('No user'); return }
    await s.from('profiles').insert({ user_id: user.id, email, role: 'customer' })
    await s.from('customers').insert({ full_name: fullName || email, email, plan: 'yearly', streams: 1, next_due_date: new Date().toISOString() })
    router.push('/customer')
  }

  return (
    <main className="p-6 flex items-center justify-center">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Register</h2>
        <input className="input mb-3" placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} />
        <input className="input mb-3" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="input mb-3" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div className="text-rose-400 text-sm mb-2">{error}</div>}
        <button className="btn w-full" onClick={register}>Create account</button>
        <div className="mt-3 text-sm text-slate-400">Already have an account? <Link className="text-brand" href="/login" prefetch={false}>Login</Link> or <Link className="text-brand" href="/customer/login" prefetch={false}>Customer Login</Link></div>
      </div>
    </main>
  )
}
