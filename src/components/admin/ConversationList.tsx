'use client'

import { formatDistanceToNow } from 'date-fns'
import { Clock3, User } from 'lucide-react'
import { Conversation } from '@/stores/chatStore'

interface ConversationListProps {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  onSelectConversation: (conversation: Conversation) => void
  selectMode?: boolean
  selectedIds?: Record<string, boolean>
  onToggleSelect?: (conversationId: string) => void
}

export default function ConversationList({
  conversations,
  selectedConversation,
  onSelectConversation,
  selectMode = false,
  selectedIds = {},
  onToggleSelect,
}: ConversationListProps) {
  if (!conversations.length) {
    return <div className="p-5 text-sm text-slate-500">No conversations found.</div>
  }

  return (
    <div className="divide-y divide-white/6">
      {conversations.map((conversation) => {
        const meta: any = conversation.metadata || {}
        const active = selectedConversation?.id === conversation.id
        const statusClass =
          conversation.status === 'active'
            ? 'bg-emerald-400/12 text-emerald-200 border-emerald-400/20'
            : conversation.status === 'waiting'
              ? 'bg-amber-400/12 text-amber-200 border-amber-400/20'
              : 'bg-slate-500/12 text-slate-300 border-slate-500/20'

        return (
          <button
            key={conversation.id}
            onClick={() => {
              if (selectMode) onToggleSelect?.(conversation.id)
              else onSelectConversation(conversation)
            }}
            className={`w-full px-5 py-4 text-left ${
              active ? 'bg-cyan-400/10' : 'hover:bg-white/5'
            }`}
          >
            <div className="flex items-start gap-3">
              {selectMode ? (
                <input
                  type="checkbox"
                  checked={Boolean(selectedIds[conversation.id])}
                  onChange={() => onToggleSelect?.(conversation.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
              ) : null}

              <div className="mt-0.5 rounded-2xl border border-white/8 bg-white/5 p-2 text-slate-400">
                <User size={15} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {meta.full_name || meta.email || `Customer #${conversation.id.slice(0, 8)}`}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass}`}>
                    {conversation.status}
                  </span>
                </div>
                {meta.email ? <div className="mt-1 truncate text-xs text-slate-500">{meta.email}</div> : null}
                <div className="mt-3 flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <Clock3 size={12} />
                  {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
