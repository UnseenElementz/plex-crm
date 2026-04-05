"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function Header() {
  const [email, setEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('Streamz R Us')
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.company_name) setCompanyName(data.company_name)
        }
      } catch {}

      const s = getSupabase()
      const alias = (process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').toLowerCase()
      const cookieStr = typeof document !== 'undefined' ? document.cookie || '' : ''
      const isAdminCookie = cookieStr
        .split(';')
        .map((part) => part.trim())
        .some((part) => part.startsWith('admin_session=1'))

      if (!s) {
        if (isAdminCookie) {
          setEmail('Admin')
          setUserRole('admin')
        }
        return
      }

      const { data } = await s.auth.getUser()
      const userEmail = data.user?.email ?? null
      setEmail(userEmail)

      if (userEmail && (userEmail.toLowerCase() === alias || isAdminCookie)) {
        setUserRole('admin')
        return
      }

      if (userEmail) {
        const { data: profile } = await s.from('profiles').select('role').eq('email', userEmail).single()
        setUserRole(profile?.role || 'customer')
      }
    })()
  }, [])

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault()
    const s = getSupabase()
    if (s) {
      try {
        await s.auth.signOut({ scope: 'global' })
      } catch {}
    }
    setEmail(null)
    setUserRole(null)
    try {
      router.replace('/')
    } catch {
      if (typeof window !== 'undefined') location.href = '/'
    }
  }

  const navLinks = useMemo(() => {
    if (userRole === 'admin') {
      return [
        { href: '/admin', label: 'Live Support' },
        { href: '/admin/customers', label: 'Customers' },
        { href: '/admin/plex-tools', label: 'Plex Tools' },
        { href: '/admin/settings', label: 'Settings' },
      ]
    }

    if (userRole === 'customer') {
      return [
        { href: '/customer', label: 'Portal' },
        { href: '/customer/recommendations', label: 'Requests' },
        { href: '/customer/service-updates', label: 'Updates' },
        { href: '/customer/settings', label: 'Settings' },
      ]
    }

    return []
  }, [userRole])

  return (
    <header className="page-section pt-4">
      <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-[28px] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4">
          <Link href="/" prefetch={false} className="text-lg font-semibold tracking-[0.18em] text-slate-50 uppercase">
            {companyName}
          </Link>
          <div className="hidden h-8 w-px bg-white/10 sm:block" />
          <div className="hidden text-xs uppercase tracking-[0.28em] text-slate-500 sm:block">Private Media Hosting</div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {navLinks.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`rounded-2xl px-3 py-2 text-sm ${active ? 'bg-cyan-400/12 text-cyan-200 border border-cyan-400/25' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {item.label}
              </Link>
            )
          })}

          {email ? (
            <>
              <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 sm:block">
                {email}
              </div>
              {userRole ? (
                <div className={`tag ${userRole === 'admin' ? 'active' : ''} ${userRole === 'customer' ? '' : ''}`}>
                  {userRole}
                </div>
              ) : null}
              <form onSubmit={handleLogout}>
                <button className="btn-outline px-4 py-2" type="submit">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="btn-outline px-4 py-2" href="/customer/login" prefetch={false}>
                Customer Login
              </Link>
              <Link className="btn px-4 py-2" href="/login" prefetch={false}>
                Admin Login
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
