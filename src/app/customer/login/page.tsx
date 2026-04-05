"use client"
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

function isBanned(notes: unknown) {
  return /Access:\s*Banned/i.test(String(notes || ''))
}

export default function CustomerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const success = searchParams?.get('registered')

  async function login() {
    setError('')
    setLoading(true)

    const s = getSupabase()
    const normalizedEmail = email.trim().toLowerCase()

    if (!s) {
      setError('Customer login requires Supabase to be configured correctly.')
      setLoading(false)
      return
    }

    const { data, error } = await s.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const user = data.user
    if (!user?.email) {
      setError('Login failed. Please try again.')
      setLoading(false)
      return
    }

    try {
      const fullName = String(user.user_metadata?.fullName || user.user_metadata?.full_name || '').trim()
      const plexUsername = String(user.user_metadata?.plexUsername || user.user_metadata?.plex_username || '').trim()

      await s.from('profiles').upsert(
        {
          user_id: user.id,
          email: user.email,
          role: 'customer',
          full_name: fullName || user.email.split('@')[0],
        },
        { onConflict: 'email' }
      )

      const { data: existingCustomer } = await s
        .from('customers')
        .select('id,name,notes,subscription_status')
        .eq('email', user.email)
        .maybeSingle()

      if (!existingCustomer) {
        await s.from('customers').insert({
          name: fullName || user.email,
          email: user.email,
          subscription_type: 'yearly',
          streams: 1,
          subscription_status: 'inactive',
          notes: plexUsername ? `Plex: ${plexUsername}` : '',
        })
      } else if (isBanned((existingCustomer as any).notes)) {
        await s.auth.signOut().catch(() => {})
        if (typeof window !== 'undefined') {
          window.location.href = '/customer/banned'
        }
        return
      } else if (fullName || plexUsername) {
        const currentNotes = String((existingCustomer as any).notes || '')
        const cleanedNotes = currentNotes.replace(/Plex:\s*[^\n]+\n?/gi, '').trim()
        const mergedNotes = [cleanedNotes || undefined, plexUsername ? `Plex: ${plexUsername}` : undefined].filter(Boolean).join('\n')
        await s
          .from('customers')
          .update({
            name: fullName || (existingCustomer as any).name || user.email,
            notes: mergedNotes,
          })
          .eq('email', user.email)
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.location.href = '/customer'
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email && password) {
      void login()
    }
  }

  return (
    <main className="page-section flex min-h-screen items-center justify-center py-10">
      <div className="glass w-full max-w-md rounded-[32px] p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2 text-white">Customer Portal</h1>
          <p className="text-slate-400">Sign in with the same email your customer account uses in the system.</p>
        </div>

        <div className="space-y-4">
          <input className="input w-full" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} />

          {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">Account created. You can sign in now.</div> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div> : null}

          <button className="btn w-full" onClick={login} disabled={!email || !password || loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="text-cyan-200 font-semibold mb-1">Important</div>
          <p className="text-sm text-cyan-100/80">If your details already exist in the CRM, register with that exact customer email once and the portal will attach to your existing account data.</p>
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
        </div>
      </div>
    </main>
  )
}
