'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bell, MessageSquareMore, Sparkles, Trash2 } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import ConversationList from './ConversationList'
import ChatArea from './ChatArea'
import CustomerInfo from './CustomerInfo'
import { Conversation } from '@/stores/chatStore'
import DashboardStats from './DashboardStats'
import { shouldAutoWait } from '@/lib/chatIdle'

export default function AdminDashboard() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'closed' | 'waiting'>('active')
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [idleMinutes, setIdleMinutes] = useState(5)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const lastActiveNotifiedRef = useRef<number>(0)
  const searchParams = useSearchParams()

  const {
    conversations,
    stats,
    adminAvailability,
    fetchConversations,
    refreshConversations,
    fetchMessages,
    refreshMessages,
    createConversation,
    deleteConversation,
    isLoading,
    error,
    connectSocket,
    disconnectSocket,
    setAdminAvailability,
    hydrateAdminAvailability,
  } = useChatStore()

  useEffect(() => {
    try {
      const hasCookie = typeof document !== 'undefined' && document.cookie.includes('admin_session=')
      const localAdmin = typeof localStorage !== 'undefined' && !!localStorage.getItem('localAdmin')
      if (localAdmin && !hasCookie) {
        fetch('/api/admin/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'local',
            username: localStorage.getItem('localAdminUser') || '',
            password: localStorage.getItem('localAdminPass') || '',
          }),
        }).catch(() => {})
      }
    } catch {}

    fetchConversations()
    ;(async () => {
      await hydrateAdminAvailability()
      const avail = useChatStore.getState().adminAvailability
      if (avail !== 'off') connectSocket()
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' as any })
        if (res.ok) {
          const d = await res.json().catch(() => null)
          const n = Number(d?.chat_idle_timeout_minutes || 5)
          setIdleMinutes(Number.isFinite(n) && n > 0 ? n : 5)
        }
      } catch {}
    })()

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
    } catch {}

    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const interval = setInterval(() => {
      void refreshConversations()
    }, 2500)

    return () => {
      disconnectSocket()
      window.removeEventListener('resize', checkMobile)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (adminAvailability === 'off') disconnectSocket()
    else connectSocket()
  }, [adminAvailability, connectSocket, disconnectSocket])

  useEffect(() => {
    if (!selectedConversation) return
    void fetchMessages(selectedConversation.id)
  }, [fetchMessages, selectedConversation])

  useEffect(() => {
    if (!selectedConversation) return
    const interval = setInterval(() => {
      void refreshMessages(selectedConversation.id)
    }, 1500)
    return () => clearInterval(interval)
  }, [refreshMessages, selectedConversation])

  useEffect(() => {
    const openId = searchParams?.get('open')
    if (!openId) return
    const c = conversations.find((conv) => conv.id === openId)
    if (c) setSelectedConversation(c)
  }, [conversations, searchParams])

  useEffect(() => {
    if (selectedConversation) return
    if (filteredConversations[0]) setSelectedConversation(filteredConversations[0])
  }, [selectedConversation, conversations, filterStatus, searchTerm])

  useEffect(() => {
    const activeNow = stats.active
    if (adminAvailability !== 'waiting') {
      lastActiveNotifiedRef.current = activeNow
      return
    }
    if (activeNow > lastActiveNotifiedRef.current) {
      lastActiveNotifiedRef.current = activeNow
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New live chat', { body: 'A customer started a chat.' })
        }
      } catch {}
    }
  }, [adminAvailability, stats.active])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const list = useChatStore.getState().conversations || []
      list
        .filter((conv) => conv.status === 'active')
        .forEach((conv) => {
          const meta: any = conv.metadata || {}
          if (
            shouldAutoWait({
              lastAdminAt: meta.last_admin_at,
              lastCustomerAt: meta.last_customer_at,
              nowMs: now,
              idleMinutes,
            })
          ) {
            void useChatStore.getState().updateConversationStatus(conv.id, 'waiting')
          }
        })
    }, 60000)
    return () => clearInterval(interval)
  }, [idleMinutes])

  const filteredConversations = useMemo(() => {
    const byKey = new Map<string, Conversation>()
    for (const conversation of conversations) {
      const meta: any = conversation.metadata || {}
      const key = (meta.email || meta.full_name || conversation.id).toString().toLowerCase()
      const existing = byKey.get(key)
      if (!existing || new Date(conversation.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
        byKey.set(key, conversation)
      }
    }

    const query = searchTerm.toLowerCase()
    return Array.from(byKey.values())
      .filter((conversation) => filterStatus === 'all' || conversation.status === filterStatus)
      .filter((conversation) => {
        const meta: any = conversation.metadata || {}
        const name = (meta.full_name || '').toLowerCase()
        const email = (meta.email || '').toLowerCase()
        const id = conversation.id.toLowerCase()
        return !query || name.includes(query) || email.includes(query) || id.includes(query)
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [conversations, filterStatus, searchTerm])

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds])

  const availabilityLabel = useMemo(() => {
    if (adminAvailability === 'off') return { text: 'Offline', cls: 'bg-rose-500/12 text-rose-200 border-rose-400/20' }
    if (adminAvailability === 'waiting') return { text: 'Standby', cls: 'bg-amber-500/12 text-amber-200 border-amber-400/20' }
    return { text: 'Live', cls: 'bg-emerald-500/12 text-emerald-200 border-emerald-400/20' }
  }, [adminAvailability])

  const toggleSelect = (conversationId: string) => {
    setSelectedIds((prev) => ({ ...prev, [conversationId]: !prev[conversationId] }))
  }

  const bulkDelete = async () => {
    const ids = Object.entries(selectedIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} conversation(s) permanently?`)) return
    setSelectedConversation(null)
    for (const id of ids) {
      try {
        await deleteConversation(id)
      } catch {}
    }
    setSelectedIds({})
    setSelectMode(false)
    setTimeout(() => {
      void refreshConversations()
    }, 800)
  }

  async function updateAvailability(next: 'off' | 'waiting' | 'active') {
    setAdminAvailability(next)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('admin_chat_availability', next)
    } catch {}
    setSaving(true)
    try {
      const g = await fetch('/api/admin/settings', { cache: 'no-store' })
      const cur = g.ok ? await g.json() : {}
      const payload = { ...cur, chat_availability: next }
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {}
    setSaving(false)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
      <section className={`${isMobile && selectedConversation ? 'hidden' : 'block'} panel overflow-hidden`}>
        <div className="border-b border-white/8 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow">
                <Bell size={13} />
                Live Support
              </div>
              <h1 className="mt-4 text-2xl font-semibold text-white">Realtime customer inbox</h1>
              <p className="mt-2 text-sm text-slate-400">Track active chats, jump into waiting conversations, and keep support feeling premium.</p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${availabilityLabel.cls}`}>
              {availabilityLabel.text}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {(['off', 'waiting', 'active'] as const).map((state) => (
              <button
                key={state}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                  adminAvailability === state ? 'bg-cyan-400/14 text-cyan-100 border border-cyan-400/20' : 'bg-white/5 text-slate-400'
                }`}
                onClick={() => updateAvailability(state)}
                disabled={saving}
              >
                {state}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-white/8 p-5">
          <input
            type="text"
            placeholder="Search by name, email, or conversation ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="input">
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="waiting">Waiting</option>
              <option value="closed">Closed</option>
            </select>
            <button className="btn-outline" onClick={() => setSelectMode((value) => !value)}>
              {selectMode ? 'Cancel select' : 'Select chats'}
            </button>
          </div>

          {selectMode ? (
            <div className="mt-3 flex gap-2">
              <button
                className="btn-ghost flex-1"
                onClick={() =>
                  setSelectedIds((prev) => {
                    const next = { ...prev }
                    filteredConversations.forEach((conversation) => {
                      next[conversation.id] = true
                    })
                    return next
                  })
                }
              >
                Select all
              </button>
              <button className="btn-ghost flex-1" onClick={() => setSelectedIds({})}>
                Clear
              </button>
            </div>
          ) : null}

          {selectMode ? (
            <button
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 disabled:opacity-50"
              disabled={selectedCount === 0}
              onClick={bulkDelete}
            >
              <Trash2 size={15} />
              Delete selected ({selectedCount})
            </button>
          ) : null}

          {!isLoading && !error && conversations.length === 0 ? (
            <div className="mt-4 panel-strong p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-cyan-400/12 p-2 text-cyan-300">
                  <Sparkles size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100">No chats yet</div>
                  <p className="mt-1 text-xs text-slate-400">Create a demo conversation so the support console is not blank while testing.</p>
                  <button
                    className="btn-xs mt-3"
                    onClick={async () => {
                      const demo = await createConversation('127.0.0.1', {
                        full_name: 'Demo User',
                        email: 'demo@example.com',
                      })
                      if (demo) setSelectedConversation(demo)
                    }}
                  >
                    Start demo conversation
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="max-h-[62vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-5 text-sm text-slate-400">Loading conversations...</div>
          ) : error ? (
            <div className="p-5 text-sm text-rose-300">{error}</div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedConversation={selectedConversation}
              onSelectConversation={setSelectedConversation}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          )}
        </div>
      </section>

      <section className={`${isMobile && !selectedConversation ? 'hidden' : 'flex'} panel-strong min-h-[72vh] flex-col overflow-hidden`}>
        {selectedConversation ? (
          <>
            <div className="border-b border-white/8 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Conversation</div>
                  <div className="mt-1 flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">#{selectedConversation.id.slice(0, 8)}</h2>
                    <span className={`tag ${selectedConversation.status === 'active' ? 'active' : selectedConversation.status === 'waiting' ? 'due-soon' : 'inactive'}`}>
                      {selectedConversation.status}
                    </span>
                  </div>
                </div>
                {isMobile ? (
                  <button className="btn-outline px-4 py-2" onClick={() => setSelectedConversation(null)}>
                    Back to inbox
                  </button>
                ) : null}
              </div>
            </div>
            <ChatArea conversation={selectedConversation} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center">
            <div>
              <div className="mx-auto mb-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 p-4 text-cyan-300">
                <MessageSquareMore size={26} />
              </div>
              <h3 className="text-2xl font-semibold text-white">Choose a conversation</h3>
              <p className="mt-2 max-w-md text-sm text-slate-400">Your modern support workspace is ready. Pick a chat from the inbox to jump into the thread.</p>
            </div>
          </div>
        )}
      </section>

      {!isMobile ? (
        <aside className="space-y-6">
          <div className="panel p-5">
            <DashboardStats conversations={filteredConversations} stats={stats} onOpenConversation={setSelectedConversation} />
          </div>
          {selectedConversation ? (
            <div className="panel overflow-hidden">
              <CustomerInfo conversation={selectedConversation} />
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
