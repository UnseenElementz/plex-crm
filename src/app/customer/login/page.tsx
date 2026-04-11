"use client"
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { CLOSED_COMMUNITY_BAN_HREF, getBannedHref, isPlanEndTerminationDue, shouldAutoBlockBanAttempt } from '@/lib/customerBan'
import { clearLocalAdminArtifacts } from '@/lib/localAdmin'

const inviteOnlyMessage =
  'This portal is now a closed community. Existing customers can sign in with the email already on their account. New members need a valid invite link or code from a current customer.'

function isBanned(notes: unknown) {
  return parseCustomerNotes(notes).banned
}

async function trackBlockedAttempt(email: string, notes: unknown) {
  try {
    await fetch('/api/security/ip-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'customer-login-banned',
        block: shouldAutoBlockBanAttempt(notes),
        reason: 'Banned customer login attempt',
      }),
    })
  } catch {}
}

async function trackInactiveAttempt(email: string) {
  try {
    await fetch('/api/security/ip-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'customer-login-inactive',
        block: false,
        reason: 'Inactive customer login attempt',
      }),
    })
  } catch {}
}

export default function CustomerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const success = searchParams?.get('registered')
  const inviteOnlyReason = searchParams?.get('reason') === 'invite-only'

  useEffect(() => {
    clearLocalAdminArtifacts()
    fetch('/api/admin/auth/session', { method: 'DELETE' }).catch(() => null)
  }, [])

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

    clearLocalAdminArtifacts()
    await fetch('/api/admin/auth/session', { method: 'DELETE' }).catch(() => null)

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
        .select('id,name,notes,start_date,next_payment_date,subscription_status')
        .eq('email', user.email)
        .maybeSingle()

      if (!existingCustomer) {
        await s.auth.signOut().catch(() => {})
        setError(inviteOnlyMessage)
        setLoading(false)
        return
      } else if (isBanned((existingCustomer as any).notes)) {
        await trackBlockedAttempt(user.email, (existingCustomer as any).notes)
        await s.auth.signOut().catch(() => {})
        if (typeof window !== 'undefined') {
          window.location.href = getBannedHref((existingCustomer as any).notes)
        }
        return
      } else if (isPlanEndTerminationDue({
        notes: (existingCustomer as any).notes,
        startDate: (existingCustomer as any).start_date,
        nextPaymentDate: (existingCustomer as any).next_payment_date,
        subscriptionStatus: (existingCustomer as any).subscription_status,
      })) {
        await trackInactiveAttempt(user.email)
        await s.auth.signOut().catch(() => {})
        if (typeof window !== 'undefined') {
          window.location.href = CLOSED_COMMUNITY_BAN_HREF
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

    try {
      await fetch('/api/security/ip-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, source: 'customer-login' }),
      })
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
    <main className="page-section customer-auth-shell flex min-h-[calc(100svh-4.5rem)] items-start justify-center py-4 sm:min-h-screen sm:items-center sm:py-10">
      <div className="glass customer-auth-card w-full max-w-md rounded-[24px] p-4 sm:rounded-[32px] sm:p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2 text-white">Member Login</h1>
          <p className="text-slate-400">Existing customers sign in here. New access now happens through private member invites only.</p>
        </div>

        <div className="space-y-4">
          <input className="input w-full" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} />

          {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">Account created. You can sign in now.</div> : null}
          {inviteOnlyReason ? <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">{inviteOnlyMessage}</div> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div> : null}

          <button className="btn w-full" onClick={login} disabled={!email || !password || loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="text-cyan-200 font-semibold mb-1">Closed Community</div>
          <p className="text-sm text-cyan-100/80">{inviteOnlyMessage}</p>
        </div>

        <div className="mt-6 text-center text-sm text-slate-400 space-y-2">
          <div>
            Need portal access from an invite?{' '}
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/customer/register" prefetch={false}>
              Use Invite Link
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
