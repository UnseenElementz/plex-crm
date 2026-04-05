"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [notif, setNotif] = useState<{ conversation_id: string; content: string } | null>(null)
  const audioPlayedRef = useRef(false)

  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('admin:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
        const row = payload?.new
        if (row && row.sender_type === 'customer') {
          setNotif({ conversation_id: row.conversation_id, content: row.content })
          try {
            if (!audioPlayedRef.current) {
              const Ctx = window.AudioContext || (window as any).webkitAudioContext
              const ctx = new Ctx()
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.type = 'sine'
              osc.frequency.setValueAtTime(920, ctx.currentTime)
              gain.gain.setValueAtTime(0.001, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03)
              gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.42)
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.start()
              osc.stop(ctx.currentTime + 0.45)
              audioPlayedRef.current = true
              setTimeout(() => {
                audioPlayedRef.current = false
              }, 400)
            }
          } catch {}
        }
      })
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(ch)
      } catch {}
    }
  }, [])

  const navItems = [
    { href: '/admin', label: 'Live Support' },
    { href: '/admin/dashboard', label: 'Revenue' },
    { href: '/admin/requests', label: 'Requests' },
    { href: '/admin/customers', label: 'Customers' },
    { href: '/admin/plex-tools', label: 'Plex Tools' },
    { href: '/admin/email', label: 'Mail' },
    { href: '/admin/security', label: 'Security' },
    { href: '/admin/settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen pb-8">
      <div className="page-section pt-4">
        <nav className="glass sticky top-4 z-40 rounded-[28px] px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="mr-4">
              <Link href="/admin" className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200">
                Plex Command
              </Link>
              <div className="mt-1 text-xs text-slate-500">Live operations and customer control</div>
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      active ? 'border border-cyan-400/25 bg-cyan-400/12 text-cyan-100' : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>
      </div>

      <main className="page-section pt-6">
        {children}
        {notif && pathname !== '/admin' ? (
          <div className="glass-strong fixed bottom-5 right-5 z-50 w-[22rem] rounded-[28px] p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Incoming support</div>
            <div className="mt-2 text-base font-semibold text-slate-50">New customer message</div>
            <div className="mt-2 line-clamp-3 text-sm text-slate-400">{notif.content}</div>
            <div className="mt-4 flex gap-2">
              <a className="btn-xs" href={`/admin?open=${encodeURIComponent(notif.conversation_id)}`}>
                Open Chat
              </a>
              <button className="btn-xs-outline" onClick={() => setNotif(null)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
