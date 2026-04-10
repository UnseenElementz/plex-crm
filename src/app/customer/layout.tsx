"use client"
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import GlobalPulse from '@/components/GlobalPulse'
import { getSupabase } from '@/lib/supabaseClient'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { CLOSED_COMMUNITY_BAN_HREF, getBannedHref, isPlanEndTerminationDue, shouldAutoBlockBanAttempt } from '@/lib/customerBan'
import { clearLocalAdminArtifacts } from '@/lib/localAdmin'

function isBanned(notes: unknown) {
  return parseCustomerNotes(notes).banned
}

async function trackBlockedAttempt(email: string, source: string, reason: string, notes?: unknown) {
  try {
    await fetch('/api/security/ip-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source,
        block: notes ? shouldAutoBlockBanAttempt(notes) : false,
        reason,
      }),
    })
  } catch {}
}

export default function CustomerLayout({ children }: { children: React.ReactNode }){
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

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
        const adminAlias = String(process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').trim().toLowerCase()
        const normalizedEmail = String(email).trim().toLowerCase()
        // Self-heal missing profile/customer links so portal data stays tied to Supabase.
        try{
          const { data: profile } = await s.from('profiles').select('role').eq('email', email).maybeSingle()
          const isAdminProfile = normalizedEmail === adminAlias || String(profile?.role || '').trim().toLowerCase() === 'admin'
          if (!isAdminProfile) {
            await fetch('/api/admin/auth/session', { method: 'DELETE' }).catch(() => null)
            clearLocalAdminArtifacts()
          }

          const fullName = String(user?.user_metadata?.fullName || user?.user_metadata?.full_name || '').trim()
          await s.from('profiles').upsert({ user_id: user?.id, email, role: 'customer', full_name: fullName || email.split('@')[0] }, { onConflict: 'email' })
          const { data: existingCustomer } = await s.from('customers').select('id,notes,start_date,next_payment_date,subscription_status').eq('email', email).maybeSingle()
          if (!existingCustomer){
            await s.auth.signOut().catch(() => {})
            router.replace('/customer/login?reason=invite-only')
            return
          } else if (isBanned(existingCustomer.notes)) {
            await trackBlockedAttempt(email, 'customer-portal-banned', 'Banned customer portal attempt', existingCustomer.notes)
            await s.auth.signOut().catch(() => {})
            router.replace(getBannedHref(existingCustomer.notes))
            return
          } else if (isPlanEndTerminationDue({
            notes: existingCustomer.notes,
            startDate: existingCustomer.start_date,
            nextPaymentDate: existingCustomer.next_payment_date,
            subscriptionStatus: existingCustomer.subscription_status,
          })) {
            await trackBlockedAttempt(
              email,
              String(existingCustomer.subscription_status || '').trim().toLowerCase() === 'inactive'
                ? 'customer-portal-inactive'
                : 'customer-portal-plan-ended',
              String(existingCustomer.subscription_status || '').trim().toLowerCase() === 'inactive'
                ? 'Inactive customer portal attempt'
                : 'Plan ended termination portal attempt'
            )
            await s.auth.signOut().catch(() => {})
            router.replace(CLOSED_COMMUNITY_BAN_HREF)
            return
          }
        } catch {}
        setChecking(false)
      }catch{ router.replace('/customer/login') }
    })()
  }, [pathname, router])

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

  return (
    <>
      {children}
      <GlobalPulse />
    </>
  )
}
