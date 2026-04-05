"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

function isBanned(notes: unknown) {
  return /Access:\s*Banned/i.test(String(notes || ''))
}

export default function CustomerRegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [plexUsername, setPlexUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function register() {
    setError('')
    setLoading(true)

    const s = getSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = fullName.trim()
    const trimmedPlex = plexUsername.trim()

    if (!s) {
      setError('Customer registration requires Supabase to be configured correctly.')
      setLoading(false)
      return
    }

    try {
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
          await s.auth.signOut().catch(() => {})
          router.push('/customer/banned')
          return
        }
        const currentNotes = String((existingCustomer as any).notes || '')
        const cleanedNotes = currentNotes.replace(/Plex:\s*[^\n]+\n?/gi, '').trim()
        const nextNotes = [cleanedNotes || undefined, trimmedPlex ? `Plex: ${trimmedPlex}` : undefined].filter(Boolean).join('\n')
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
          notes: trimmedPlex ? `Plex: ${trimmedPlex}` : '',
        })
      }

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
    <main className="page-section flex min-h-screen items-center justify-center py-10">
      <div className="glass w-full max-w-md rounded-[32px] p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2 text-white">Customer Registration</h1>
          <p className="text-slate-400">Use the same email that exists in your customer record so your portal details stay synced.</p>
        </div>

        <div className="space-y-4">
          <input className="input w-full" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" placeholder="Plex Username" value={plexUsername} onChange={(e) => setPlexUsername(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} />
          <input className="input w-full" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} />

          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div> : null}

          <button className="btn w-full" onClick={register} disabled={!email || !password || !fullName || loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-slate-400 space-y-2">
          <div>
            Already have an account?{' '}
            <Link className="text-brand hover:text-cyan-300 transition-colors" href="/customer/login" prefetch={false}>
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
