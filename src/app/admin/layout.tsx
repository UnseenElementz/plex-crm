"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen">
      <nav className="glass border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/admin" className="text-xl font-bold gradient-text">
                Admin Panel
              </Link>
              <div className="flex space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-300 hover:text-cyan-400 hover:bg-slate-800/30'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="py-6">
        {children}
      </main>
    </div>
  )
}