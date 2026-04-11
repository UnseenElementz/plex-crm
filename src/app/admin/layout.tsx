"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalPulse from '@/components/GlobalPulse'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/admin', label: 'Live Support' },
    { href: '/admin/dashboard', label: 'Accounts' },
    { href: '/admin/payments', label: 'PayPal' },
    { href: '/admin/requests', label: 'Requests' },
    { href: '/admin/plex-tools', label: 'Hosting Tools' },
    { href: '/admin/email', label: 'Mail' },
    { href: '/admin/security', label: 'Security' },
    { href: '/admin/settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen pb-6 sm:pb-8">
      <div className="page-section pt-3 sm:pt-4">
        <nav className="glass sticky top-3 z-40 rounded-[24px] px-3 py-3 sm:top-4 sm:rounded-[28px] sm:px-4 sm:py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="lg:mr-4">
              <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200 sm:text-sm sm:tracking-[0.32em]">
                Hosting Command
              </Link>
              <div className="mt-1 text-xs text-slate-500">Live operations and customer control</div>
            </div>
            <div className="-mx-1 flex-1 overflow-x-auto px-1">
              <div className="flex min-w-max gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-3 py-2 text-xs whitespace-nowrap sm:rounded-2xl sm:py-2.5 sm:text-sm ${
                      active ? 'border border-cyan-400/25 bg-cyan-400/12 text-cyan-100' : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
              </div>
            </div>
          </div>
        </nav>
      </div>

      <main className="page-section pt-4 sm:pt-6">
        {children}
      </main>
      <GlobalPulse />
    </div>
  )
}
