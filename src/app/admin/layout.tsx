"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [notif, setNotif] = useState<{ conversation_id: string; content: string } | null>(null)
  const audioPlayedRef = useRef(false)
  useEffect(()=>{
    if (!supabase) return
    const ch = supabase.channel('admin:messages')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, (payload: any)=>{
        const row = payload?.new
        if (row && row.sender_type === 'customer'){
          setNotif({ conversation_id: row.conversation_id, content: row.content })
          try {
            if (!audioPlayedRef.current) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
              const o = ctx.createOscillator()
              const g = ctx.createGain()
              o.type = 'sine'
              o.frequency.setValueAtTime(880, ctx.currentTime)
              g.gain.setValueAtTime(0.001, ctx.currentTime)
              g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
              g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.6)
              o.connect(g)
              g.connect(ctx.destination)
              o.start()
              o.stop(ctx.currentTime + 0.65)
              audioPlayedRef.current = true
              setTimeout(()=>{ audioPlayedRef.current = false }, 500)
            }
          } catch {}
        }
      })
      .subscribe()
    return ()=> { try{ supabase.removeChannel(ch) }catch{} }
  }, [])
  
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
        {notif && pathname !== '/admin' && (
          <div className="fixed bottom-4 right-4 z-50 glass p-4 rounded-xl border border-cyan-500/30 bg-slate-900/60">
            <div className="text-slate-200 text-sm mb-2">New customer message</div>
            <div className="text-slate-400 text-xs line-clamp-2">{notif.content}</div>
            <div className="mt-3 flex gap-2">
              <a className="btn-xs" href={`/admin?open=${encodeURIComponent(notif.conversation_id)}`}>Open Chat</a>
              <button className="btn-xs-outline" onClick={()=> setNotif(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
