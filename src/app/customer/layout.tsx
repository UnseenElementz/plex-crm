"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

function isBanned(notes: unknown) {
  return /Access:\s*Banned/i.test(String(notes || ''))
}

export default function CustomerLayout({ children }: { children: React.ReactNode }){
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const isAuthPage = pathname?.startsWith('/customer/login') || pathname?.startsWith('/customer/register')

  useEffect(()=>{
    (async()=>{
      try{
        const skip =
          pathname?.startsWith('/customer/login') ||
          pathname?.startsWith('/customer/register') ||
          pathname?.startsWith('/customer/banned')
        if (skip) { setChecking(false); return }
        if (typeof window !== 'undefined' && sessionStorage.getItem('customerDemo') === 'true'){
          setChecking(false); return
        }
        const s = getSupabase()
        if (!s){ router.replace('/customer/login'); return }
        const { data } = await s.auth.getUser()
        const user = data.user
        const email = user?.email || null
        if (!email){ router.replace('/customer/login'); return }
        // Self-heal missing profile/customer links so portal data stays tied to Supabase.
        try{
          const fullName = String(user?.user_metadata?.fullName || user?.user_metadata?.full_name || '').trim()
          await s.from('profiles').upsert({ user_id: user?.id, email, role: 'customer', full_name: fullName || email.split('@')[0] }, { onConflict: 'email' })
          const { data: existingCustomer } = await s.from('customers').select('id,notes').eq('email', email).maybeSingle()
          if (!existingCustomer){
            await s.from('customers').insert({
              name: fullName || email,
              email,
              subscription_type: 'yearly',
              streams: 1,
              subscription_status: 'inactive',
              notes: ''
            })
          } else if (isBanned(existingCustomer.notes)) {
            await s.auth.signOut().catch(() => {})
            router.replace('/customer/banned')
            return
          }
        } catch {}
        setChecking(false)
      }catch{ router.replace('/customer/login') }
    })()
  }, [isAuthPage, pathname, router])

  if (checking){
    return (
      <main className="p-6 flex items-center justify-center min-h-[80vh]">
        <div className="glass p-6 rounded-2xl w-full max-w-md text-center">
          <div className="text-2xl font-semibold mb-2">Loading...</div>
          <div className="text-slate-400">Checking subscription status</div>
        </div>
      </main>
    )
  }

  if (isAuthPage) {
    return (
      <div className="relative">
        <CosmicBackdrop variant="portal" />
        <div className="relative z-10">{children}</div>
      </div>
    )
  }

  const navItems = [
    { href: '/customer', label: 'Portal' },
    { href: '/customer/payments', label: 'Payments' },
    { href: '/customer/service-updates', label: 'Updates' },
    { href: '/customer/recommendations', label: 'Requests' },
    { href: '/customer/settings', label: 'Settings' },
    { href: '/customer/contact', label: 'Support' },
  ]

  return (
    <div className="relative">
      <CosmicBackdrop variant="portal" />
      <div className="relative z-10 px-4 pb-12 pt-5 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="glass rounded-[2rem] border border-cyan-500/20 bg-slate-950/45 px-5 py-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
                  Customer Command Deck
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-slate-100 md:text-3xl">
                  Streaming management inside a cosmic control room
                </h1>
                <p className="mt-2 max-w-xl text-sm text-slate-300">
                  Renew, track referral credit, review updates, and send requests from one shared customer hub.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/55 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Referral bonus</div>
                <div className="mt-1 text-xl font-semibold text-cyan-300">Earn up to £80</div>
                <div className="text-xs text-slate-400">£10 per successful signup</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`rounded-2xl border px-4 py-2 text-sm font-medium transition-all ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
                        : 'border-slate-700/70 bg-slate-950/45 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-6">{children}</div>
      </div>
    </div>
  )
}
