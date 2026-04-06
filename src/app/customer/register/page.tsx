"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

export default function CustomerRegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [plexUsername, setPlexUsername] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = String(searchParams?.get('ref') || '').trim()
    if (ref) setReferralCode(ref)
  }, [searchParams])

  async function register() {
    setError('')
    setLoading(true)

    const supabase = getSupabase()
    if (!supabase) {
      try {
        const profile = {
          fullName,
          email,
          plan: 'yearly',
          streams: 1,
          nextDueDate: new Date().toISOString(),
          plexUsername,
          referralCode: referralCode || 'STREAMZDEMO',
        }
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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'customer',
            fullName,
            plexUsername,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      const user = data.user
      if (!user) {
        setError('Registration failed. Please try again.')
        setLoading(false)
        return
      }

      const syncRes = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email,
          fullName,
          plexUsername,
          referralCode,
          createCustomer: true,
        }),
      })

      const syncPayload = await syncRes.json().catch(() => ({}))
      if (!syncRes.ok) {
        throw new Error(syncPayload?.error || 'Failed to prepare your customer account')
      }

      router.push('/customer')
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && email && password && fullName) {
      register()
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-lg rounded-[2rem] border border-cyan-500/20 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-300/80">Join The Orbit</div>
          <h1 className="mt-2 text-3xl font-bold text-slate-100">Customer Registration</h1>
          <p className="mt-2 text-slate-400">Create your account and start building referral credit straight away.</p>
        </div>

        {referralCode && (
          <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Referral code detected: <span className="font-mono font-semibold">{referralCode}</span>
          </div>
        )}

        <div className="space-y-4">
          <input
            className="input w-full"
            placeholder="Full Name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            onKeyPress={handleKeyPress}
          />

          <input
            className="input w-full"
            placeholder="Plex Username"
            value={plexUsername}
            onChange={(event) => setPlexUsername(event.target.value)}
            onKeyPress={handleKeyPress}
          />

          <input
            className="input w-full"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyPress={handleKeyPress}
          />

          <input
            className="input w-full"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyPress={handleKeyPress}
          />

          <input
            className="input w-full"
            placeholder="Referral Code (optional)"
            value={referralCode}
            onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
          />

          <div className="rounded-2xl border border-cyan-500/15 bg-slate-950/45 p-4 text-sm text-slate-300">
            Every successful signup is worth £10 to the referrer, with a maximum of £80 total credit on the account.
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <button className="btn w-full" onClick={register} disabled={!email || !password || !fullName || loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>

        <div className="mt-6 space-y-2 text-center text-sm text-slate-400">
          <div>
            Already have an account?{' '}
            <Link className="text-brand transition-colors hover:text-cyan-300" href="/customer/login">
              Sign In
            </Link>
          </div>
          <div>
            <Link className="transition-colors hover:text-slate-300" href="/login">
              Admin Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
