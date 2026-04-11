"use client"
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { mergeCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { getSupabase } from '@/lib/supabaseClient'
import { SERVER_FULL_BAN_HREF, getBannedHref, shouldAutoBlockBanAttempt } from '@/lib/customerBan'

type InviteStatus =
  | {
      ok: true
      mode: 'existing-customer' | 'invite-only' | 'community-access'
      customerEmail: string | null
      referralCode: string
      referrerEmail: string | null
      referrerName: string | null
      message: string
      grantsDiscount: boolean
      communityCode: string | null
      lockedEmail: string | null
    }
  | {
      ok: false
      reason: string
      message: string
    }

const closedCommunityMessage =
  'This is now a closed community. Existing customers can attach portal access with the email already on their account. New members need either a referral invite from a current customer or a one-time private access code from admin.'

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
        source: 'customer-register-banned',
        block: shouldAutoBlockBanAttempt(notes),
        reason: 'Banned customer registration attempt',
      }),
    })
  } catch {}
}

async function fetchInviteStatus(input: { email?: string; referralCode?: string }) {
  const response = await fetch('/api/customer/invite-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(input.email || '').trim().toLowerCase(),
      referralCode: String(input.referralCode || '').trim().toUpperCase(),
    }),
  })

  const payload = await response.json().catch(() => ({ message: 'Invite access could not be checked.' }))
  if (!response.ok) return payload as InviteStatus
  return payload as InviteStatus
}

export default function CustomerRegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [plexUsername, setPlexUsername] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteHint, setInviteHint] = useState('')
  const [inviteReady, setInviteReady] = useState<InviteStatus | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = String(searchParams?.get('ref') || '').trim().toUpperCase()
    if (ref) setReferralCode(ref)
  }, [searchParams])

  useEffect(() => {
    const code = referralCode.trim().toUpperCase()
    if (code.length < 4) {
      setInviteHint('')
      setInviteReady(null)
      return
    }

    let cancelled = false
    ;(async () => {
      const result = await fetchInviteStatus({ referralCode: code })
      if (cancelled) return
      setInviteReady(result)
      if (result.ok && result.mode === 'invite-only') {
        setInviteHint(result.referrerName ? `Private invite ready from ${result.referrerName}.` : 'Private invite ready.')
        return
      }
      if (result.ok && result.mode === 'community-access') {
        setInviteHint(result.message)
        return
      }
      setInviteHint(result.message || '')
    })()

    return () => {
      cancelled = true
    }
  }, [referralCode])

  async function register() {
    setError('')
    setLoading(true)

    const s = getSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = fullName.trim()
    const trimmedPlex = plexUsername.trim()
    const normalizedCode = referralCode.trim().toUpperCase()

    if (!s) {
      setError('Customer registration requires Supabase to be configured correctly.')
      setLoading(false)
      return
    }

    try {
      const inviteStatus = await fetchInviteStatus({
        email: normalizedEmail,
        referralCode: normalizedCode,
      })

      setInviteReady(inviteStatus)

      if (!inviteStatus.ok) {
        if (inviteStatus.reason === 'capacity_reached') {
          router.push(SERVER_FULL_BAN_HREF)
          setLoading(false)
          return
        }
        setError(inviteStatus.message || closedCommunityMessage)
        setLoading(false)
        return
      }

      const referralToStore = inviteStatus.grantsDiscount ? inviteStatus.referralCode || '' : ''
      const claimTimestamp = referralToStore ? new Date().toISOString() : null

      const { data, error } = await s.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            role: 'customer',
            fullName: trimmedName,
            plexUsername: trimmedPlex,
          },
        },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const user = data.user
      if (!user) {
        setError('Registration failed. Please try again.')
        setLoading(false)
        return
      }

      await s.from('profiles').upsert(
        {
          user_id: user.id,
          email: normalizedEmail,
          role: 'customer',
          full_name: trimmedName,
        },
        { onConflict: 'email' }
      )

      const { data: existingCustomer } = await s
        .from('customers')
        .select('id,name,notes,subscription_type,streams,start_date,next_payment_date,subscription_status')
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (existingCustomer) {
        if (isBanned((existingCustomer as any).notes)) {
          await trackBlockedAttempt(normalizedEmail, (existingCustomer as any).notes)
          await s.auth.signOut().catch(() => {})
          router.push(getBannedHref((existingCustomer as any).notes))
          return
        }
        const parsedNotes = parseCustomerNotes((existingCustomer as any).notes || '')
        const nextNotes = mergeCustomerNotes({
          existing: (existingCustomer as any).notes || '',
          plexUsername: trimmedPlex,
          joinAccessMode:
            inviteStatus.mode !== 'existing-customer'
              ? inviteStatus.mode
              : parsedNotes.joinAccessMode,
          joinAccessGrantedAt:
            inviteStatus.mode !== 'existing-customer'
              ? parsedNotes.joinAccessGrantedAt || new Date().toISOString()
              : parsedNotes.joinAccessGrantedAt,
          referredBy: parsedNotes.referredBy || referralToStore,
          referralClaimedAt: parsedNotes.referralClaimedAt || claimTimestamp,
        })
        await s
          .from('customers')
          .update({
            name: trimmedName || (existingCustomer as any).name || normalizedEmail,
            notes: nextNotes,
          })
          .eq('id', (existingCustomer as any).id)
      } else {
        await s.from('customers').insert({
          name: trimmedName || normalizedEmail,
          email: normalizedEmail,
          subscription_type: 'yearly',
          streams: 1,
          start_date: null,
          next_payment_date: null,
          subscription_status: 'inactive',
          notes: mergeCustomerNotes({
            existing: '',
            plexUsername: trimmedPlex,
            joinAccessMode: inviteStatus.mode !== 'existing-customer' ? inviteStatus.mode : '',
            joinAccessGrantedAt: inviteStatus.mode !== 'existing-customer' ? new Date().toISOString() : null,
            referredBy: referralToStore,
            referralClaimedAt: claimTimestamp,
          }),
        })
      }

      if (inviteStatus.communityCode) {
        await fetch('/api/customer/community-access-code/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: inviteStatus.communityCode,
            email: normalizedEmail,
          }),
        }).catch(() => null)
      }

      await fetch('/api/security/ip-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, source: 'customer-register' }),
      }).catch(() => null)

      router.push('/customer/login?registered=1')
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email && password && fullName) {
      void register()
    }
  }

  return (
    <main className="page-section customer-auth-shell flex min-h-[calc(100svh-4.5rem)] items-start justify-center py-4 sm:min-h-screen sm:items-center sm:py-10">
      <div className="glass customer-auth-card w-full max-w-xl rounded-[24px] p-4 sm:rounded-[32px] sm:p-6">
        <div className="text-center mb-6">
          <div className="eyebrow mx-auto">Invite Only</div>
          <h1 className="mt-4 text-2xl font-bold mb-2 text-white">Member Access Registration</h1>
          <p className="text-slate-400">{closedCommunityMessage}</p>
        </div>

        <div className="mb-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100/85">
          Existing customers can activate portal access with the same email already stored on their account. Brand-new members need a valid referral invite or a one-time private access code before signup will go through. Private access codes unlock signup only and do not add referral credit.
        </div>

        {inviteHint ? (
          <div className={`mb-4 rounded-2xl border p-3 text-sm ${inviteReady?.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'}`}>
            {inviteHint}
          </div>
        ) : null}

        <div className="space-y-4">
          <input className="input w-full" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" placeholder="Plex Username" value={plexUsername} onChange={(e) => setPlexUsername(e.target.value)} onKeyPress={handleKeyPress} />
          <input
            className="input w-full"
            placeholder="Invite Code"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
          />
          <input className="input w-full" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} />

          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div> : null}

          <button className="btn w-full" onClick={register} disabled={!email || !password || !fullName || loading}>
            {loading ? 'Creating Access...' : 'Create Portal Access'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-slate-400 space-y-2">
          <div>
            Already have access?{' '}
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/customer/login" prefetch={false}>
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
