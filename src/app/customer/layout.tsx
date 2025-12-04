"use client"
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
import { getStatus } from '@/lib/pricing'

export default function CustomerLayout({ children }: { children: React.ReactNode }){
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(()=>{
    (async()=>{
      try{
        const skip = pathname?.startsWith('/customer/login') || pathname?.startsWith('/customer/register')
        if (skip) { setChecking(false); return }
        if (typeof window !== 'undefined' && sessionStorage.getItem('customerDemo') === 'true'){
          setChecking(false); return
        }
        const s = getSupabase()
        if (!s){ router.replace('/customer/login'); return }
        const { data } = await s.auth.getUser()
        const email = data.user?.email || null
        if (!email){ router.replace('/customer/login'); return }
        // Route access requires login only; actions on recommendations are gated in APIs
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
