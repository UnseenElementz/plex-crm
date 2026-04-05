"use client"
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

  return <>{children}</>
}
