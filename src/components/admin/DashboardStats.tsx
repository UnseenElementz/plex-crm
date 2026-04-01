'use client'

import { format } from 'date-fns'
import { Conversation, useChatStore } from '@/stores/chatStore'

export default function DashboardStats({
  conversations,
  stats,
  onOpenConversation
}: {
  conversations: Conversation[]
  stats: { waiting: number; active: number }
  onOpenConversation: (c: Conversation) => void
}) {
  const updateConversationMetadata = useChatStore(s => s.updateConversationMetadata)

  const rows = (conversations || [])
    .filter(c => c.status === 'waiting' || c.status === 'active')
    .slice(0, 15)

  async function open(c: Conversation) {
    const meta: any = (c as any).metadata || {}
    const email = String(meta.email || '').trim()
    if (email) {
      try {
        const res = await fetch(`/api/admin/customers/details?email=${encodeURIComponent(email)}`, { cache: 'no-store' as any })
        if (res.ok) {
          const d = await res.json().catch(()=>null)
          const merged = {
            ...meta,
            plex_username: d?.plex_username || meta.plex_username,
            full_name: d?.full_name || meta.full_name,
            subscription_type: d?.subscription_type || meta.subscription_type,
            streams: d?.streams || meta.streams,
            subscription_status: d?.status || meta.subscription_status,
            next_payment_date: d?.next_payment_date || meta.next_payment_date
          }
          if (JSON.stringify(merged) !== JSON.stringify(meta)) {
            await updateConversationMetadata(c.id, merged)
          }
        }
      } catch {}
    }
    onOpenConversation(c)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Dashboard</div>
        <div className="text-[11px] text-slate-400">Live</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="glass p-2 rounded-lg border border-amber-500/20">
          <div className="text-[10px] text-slate-400">Waiting</div>
          <div className="text-amber-300 font-semibold">{stats.waiting}</div>
        </div>
        <div className="glass p-2 rounded-lg border border-emerald-500/20">
          <div className="text-[10px] text-slate-400">Active</div>
          <div className="text-emerald-300 font-semibold">{stats.active}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs text-slate-400 mb-2">Waiting / Active</div>
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-2 py-2 text-[10px] text-slate-500 bg-slate-900/50 border-b border-slate-800">
            <div className="col-span-5">Customer</div>
            <div className="col-span-3">Package</div>
            <div className="col-span-4">Last</div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {rows.map(c => {
              const meta: any = (c as any).metadata || {}
              const email = String(meta.email || '').trim()
              const name = String(meta.full_name || email || '').trim() || `#${c.id.slice(0, 8)}`
              const pack = String(meta.subscription_type || '').trim() || '-'
              const last = meta.last_message_at || c.updated_at
              return (
                <button
                  key={c.id}
                  onClick={() => open(c)}
                  className="w-full text-left grid grid-cols-12 gap-2 px-2 py-2 text-xs border-b border-slate-900/60 hover:bg-slate-800/40"
                >
                  <div className="col-span-5 truncate">
                    <div className="text-slate-200 truncate">{name}</div>
                    {email && <div className="text-[10px] text-slate-500 truncate">{email}</div>}
                  </div>
                  <div className="col-span-3 truncate text-slate-300">{pack}</div>
                  <div className="col-span-4 truncate text-slate-400">{last ? format(new Date(last), 'dd/MM HH:mm') : '-'}</div>
                </button>
              )
            })}
            {rows.length === 0 && (
              <div className="p-3 text-xs text-slate-500">No live chats</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

