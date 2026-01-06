"use client"
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header(){
  const [email, setEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  
  useEffect(()=>{ 
    (async()=>{ 
      const s = getSupabase(); 
      const alias = (process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').toLowerCase()
      const cookieStr = typeof document !== 'undefined' ? (document.cookie || '') : ''
      const isAdminCookie = cookieStr.split(';').map(s=>s.trim()).some(s=> s.startsWith('admin_session=1'))
      if (!s){
        if (isAdminCookie){ setEmail('Admin'); setUserRole('admin') }
        return
      }
      const { data } = await s.auth.getUser(); 
      const userEmail = data.user?.email ?? null
      setEmail(userEmail)
      if (userEmail && (userEmail.toLowerCase() === alias || isAdminCookie)){
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
    try { router.replace('/') } catch { if (typeof window !== 'undefined') location.href = '/' }
  }
  
  return (
    <header className="flex items-center justify-between p-4">
      <div className="font-semibold"><Link href="/" prefetch={false}>Streamz R Us</Link></div>
      <div className="flex items-center gap-4">
        {email && userRole && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">{email}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              userRole === 'admin' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            }`}>
              {userRole.toUpperCase()}
            </span>
            {userRole === 'admin' && (
              <>
                <Link 
                  href="/admin" 
                  prefetch={false}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    pathname === '/admin' 
                      ? 'bg-cyan-500/30 text-cyan-300' 
                      : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                  }`}
                >
                  Chat
                </Link>
                <Link 
                  href="/admin/customers" 
                  prefetch={false}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    pathname?.startsWith('/admin/customers') 
                      ? 'bg-cyan-500/30 text-cyan-300' 
                      : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                  }`}
                >
                  Customers
                </Link>
                <Link 
                  href="/admin/settings" 
                  prefetch={false}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    pathname?.startsWith('/admin/settings') 
                      ? 'bg-cyan-500/30 text-cyan-300' 
                      : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                  }`}
                >
                  Settings
                </Link>
              </>
            )}
          </div>
        )}
        {email ? (
          <div className="flex items-center gap-2">
            {userRole === 'customer' && (
              <Link 
                href="/customer" 
                prefetch={false}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname?.startsWith('/customer') 
                    ? 'bg-cyan-500/30 text-cyan-300' 
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                }`}
              >
                Customer Portal
              </Link>
            )}
            {userRole === 'customer' && (
              <Link 
                href="/customer/recommendations" 
                prefetch={false}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname?.startsWith('/customer/recommendations') 
                    ? 'bg-cyan-500/30 text-cyan-300' 
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                }`}
              >
                Recommendations
              </Link>
            )}
            {userRole === 'customer' && (
              <Link 
                href="/customer/chat" 
                prefetch={false}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname === '/customer/chat'
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                }`}
              >
                Chat
              </Link>
            )}
            {userRole === 'customer' && (
              <Link 
                href="/customer/settings" 
                prefetch={false}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname === '/customer/settings'
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                }`}
              >
                Settings
              </Link>
            )}
            {userRole === 'customer' && (
              <Link 
                href="/customer/contact" 
                prefetch={false}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  pathname === '/customer/contact'
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30'
                }`}
              >
                Contact
              </Link>
            )}
            <form onSubmit={handleLogout}>
              <button className="btn-outline" type="submit">Logout</button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link className="btn-outline" href="/customer/login" prefetch={false}>Customer Login</Link>
            <Link className="btn-outline" href="/login" prefetch={false}>Admin Login</Link>
          </div>
        )}
      </div>
    </header>
  )
}
