'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'closed' | 'waiting'>('all')
  const [showUnreadOnly, setShowUnreadOnly] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [idleMinutes, setIdleMinutes] = useState(5)
  const lastActiveNotifiedRef = useRef<number>(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
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
    updateConversationStatus,
    endConversation,
    deleteConversation,
    isLoading,
    error,
    connectSocket,
    disconnectSocket,
    setAdminAvailability,
    hydrateAdminAvailability
  } = useChatStore()

  const hasUnreadMessages = (conversation: Conversation) => {
    const unreadCount = Number((conversation as any).metadata?.unread_customer_count || 0)
    const unreadFlag = Boolean((conversation as any).metadata?.has_unread_customer_message)
    return unreadCount > 0 || unreadFlag
  }

  // Handle deletion safely
  const handleDelete = async () => {
    if (!selectedConversation) return
    if (!confirm('Delete this conversation permanently?')) return
    
    // Optimistic UI update - go back to list immediately
    const id = selectedConversation.id
    setSelectedConversation(null)
    
    // Perform deletion
    await deleteConversation(id)
    
    // Force refresh list to ensure sync
    setTimeout(() => refreshConversations(), 1000)
  }

  useEffect(() => {
    try{
      const hasCookie = typeof document !== 'undefined' && document.cookie.includes('admin_session=')
      const localAdmin = typeof localStorage !== 'undefined' && !!localStorage.getItem('localAdmin')
      if (localAdmin && !hasCookie) {
        fetch('/api/admin/auth/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mode: 'local', username: localStorage.getItem('localAdminUser') || '', password: localStorage.getItem('localAdminPass') || '' }) }).catch(()=>{})
      }
    }catch{}
    fetchConversations()
    ;(async()=>{
      await hydrateAdminAvailability()
      const avail = useChatStore.getState().adminAvailability
      if (avail !== 'off') connectSocket()
      try{
        const res = await fetch('/api/admin/settings', { cache: 'no-store' as any })
        if(res.ok){
          const d = await res.json().catch(()=>null)
          const n = Number(d?.chat_idle_timeout_minutes || 5)
          setIdleMinutes(Number.isFinite(n) && n > 0 ? n : 5)
        }
      } catch{}
    })()
    try{ if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(()=>{}) } catch {}
    
    // Check for mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    const interval = setInterval(() => { refreshConversations() }, 2500)
    return () => {
      disconnectSocket()
      window.removeEventListener('resize', checkMobile)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (adminAvailability === 'off') {
      disconnectSocket()
    } else {
      connectSocket()
    }
  }, [adminAvailability])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  useEffect(() => {
    if (!selectedConversation) return
    const interval = setInterval(() => { refreshMessages(selectedConversation.id) }, 1500)
    return () => clearInterval(interval)
  }, [selectedConversation])

  // Preselect conversation from query param
  useEffect(()=>{
    const openId = searchParams?.get('open')
    if (!openId) return
    const c = conversations.find(c=> c.id === openId)
    if (c) setSelectedConversation(c)
  }, [searchParams, conversations])

  useEffect(()=>{
    if (selectedConversation) return
    const byKey = new Map<string, Conversation>()
    for (const c of conversations) {
      const meta: any = (c as any).metadata || {}
      const key = (meta.email || meta.full_name || c.id).toString().toLowerCase()
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, c)
      } else {
        const a = new Date(existing.updated_at).getTime()
        const b = new Date(c.updated_at).getTime()
        if (b > a) byKey.set(key, c)
      }
    }
    const arr = Array.from(byKey.values())
      .filter(c => !showUnreadOnly || hasUnreadMessages(c))
      .filter(c => (filterStatus === 'all' || c.status === filterStatus))
      .filter(c => {
        const meta: any = (c as any).metadata || {}
        const name = (meta.full_name || '').toLowerCase()
        const email = (meta.email || '').toLowerCase()
        const id = c.id.toLowerCase()
        const q = searchTerm.toLowerCase()
        return !q || name.includes(q) || email.includes(q) || id.includes(q)
      })
      .sort((a,b)=> new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    const first = arr[0]
    if (first) setSelectedConversation(first)
  }, [conversations, filterStatus, searchTerm, selectedConversation, showUnreadOnly])

  // Live updates come from realtime subscriptions; manual fetch occurs on selection only.

  useEffect(() => {
    const activeNow = stats.active
    if (adminAvailability !== 'waiting') {
      lastActiveNotifiedRef.current = activeNow
      return
    }
    if (activeNow > lastActiveNotifiedRef.current) {
      lastActiveNotifiedRef.current = activeNow
      try{
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New live chat', { body: 'A customer started a chat.' })
        }
      } catch {}
    }
  }, [stats.active, adminAvailability])

  useEffect(() => {
    const interval = setInterval(() => {
      const mins = idleMinutes
      if (!mins || mins <= 0) return
      const now = Date.now()
      const list = useChatStore.getState().conversations || []
      list
        .filter(c => c.status === 'active')
        .forEach(c => {
          const meta: any = (c as any).metadata || {}
          if (shouldAutoWait({ lastAdminAt: meta.last_admin_at, lastCustomerAt: meta.last_customer_at, nowMs: now, idleMinutes: mins })) {
            useChatStore.getState().updateConversationStatus(c.id, 'waiting')
          }
        })
    }, 60000)
    return () => clearInterval(interval)
  }, [idleMinutes])
  const filteredConversations = (() => {
    const byKey = new Map<string, Conversation>()
    for (const c of conversations) {
      const meta: any = (c as any).metadata || {}
      const key = (meta.email || meta.full_name || c.id).toString().toLowerCase()
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, c)
      } else {
        const a = new Date(existing.updated_at).getTime()
        const b = new Date(c.updated_at).getTime()
        if (b > a) byKey.set(key, c)
      }
    }
    const arr = Array.from(byKey.values())
    return arr
      .filter(c => !showUnreadOnly || hasUnreadMessages(c))
      .filter(c => (filterStatus === 'all' || c.status === filterStatus))
      .filter(c => {
        const meta: any = (c as any).metadata || {}
        const name = (meta.full_name || '').toLowerCase()
        const email = (meta.email || '').toLowerCase()
        const id = c.id.toLowerCase()
        const q = searchTerm.toLowerCase()
        return !q || name.includes(q) || email.includes(q) || id.includes(q)
      })
      .sort((a,b)=> new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  })()

  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation)
  }

  const toggleSelect = (conversationId: string) => {
    setSelectedIds(prev => ({ ...prev, [conversationId]: !prev[conversationId] }))
  }

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds])

  const bulkDelete = async () => {
    const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([id]) => id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} conversation(s) permanently?`)) return
    setSelectedConversation(null)
    for (const id of ids) {
      try { await deleteConversation(id) } catch {}
    }
    setSelectedIds({})
    setSelectMode(false)
    setTimeout(() => refreshConversations(), 800)
  }

  async function updateAvailability(next: 'off' | 'waiting' | 'active'){
    setAdminAvailability(next)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('admin_chat_availability', next) } catch {}
    setSaving(true)
    try{
      const g = await fetch('/api/admin/settings')
      const cur = g.ok ? await g.json() : {}
      const payload = { ...cur, chat_availability: next }
      const r = await fetch('/api/admin/settings', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) return
    } catch{}
    finally{ setSaving(false) }
  }

  const availabilityLabel = useMemo(() => {
    if (adminAvailability === 'off') return { text: 'Off', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
    if (adminAvailability === 'waiting') return { text: 'Waiting', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
    return { text: 'Active', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
  }, [adminAvailability])

  return (
    <div className="flex h-[calc(100vh-9rem)] md:h-[calc(100vh-10rem)] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
      {/* Sidebar - Conversation List */}
      <div className={`${
        isMobile && selectedConversation ? 'hidden' : 'block'
      } w-full lg:w-80 bg-slate-900/60 border-r border-slate-800 flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-xl font-semibold text-slate-200">Live Chat Admin</h1>
          <p className="text-sm text-slate-400">Manage customer conversations</p>
          
          <div className="mt-3 flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${availabilityLabel.cls}`}>
              {availabilityLabel.text}
            </span>
            <div className="inline-flex rounded-lg overflow-hidden border border-slate-700">
              <button
                className={`px-2 py-1 text-[11px] ${adminAvailability === 'off' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}
                onClick={() => updateAvailability('off')}
                disabled={saving}
              >Off</button>
              <button
                className={`px-2 py-1 text-[11px] ${adminAvailability === 'waiting' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}
                onClick={() => updateAvailability('waiting')}
                disabled={saving}
              >Waiting</button>
              <button
                className={`px-2 py-1 text-[11px] ${adminAvailability === 'active' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}
                onClick={() => updateAvailability('active')}
                disabled={saving}
              >Active</button>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="p-4 space-y-3">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full"
          />
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="input w-full"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="waiting">Waiting</option>
            <option value="closed">Closed</option>
          </select>
          <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
            <span>Unread only</span>
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="checkbox checkbox-sm checkbox-info"
            />
          </label>
          <div className="flex gap-2">
            <button
              className="btn-ghost text-xs border border-slate-700 hover:bg-slate-800 flex-1"
              onClick={() => { setSelectMode(v => !v); setSelectedIds({}) }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
            <button
              className="btn-ghost text-xs border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 flex-1 disabled:opacity-50"
              disabled={!selectMode || selectedCount === 0}
              onClick={bulkDelete}
            >
              Delete ({selectedCount})
            </button>
          </div>
          {selectMode && (
            <div className="flex gap-2">
              <button
                className="btn-ghost text-xs border border-slate-700 hover:bg-slate-800 flex-1"
                onClick={() => {
                  setSelectedIds(prev => {
                    const next = { ...prev }
                    filteredConversations.forEach(c => { next[c.id] = true })
                    return next
                  })
                }}
              >
                Select All
              </button>
              <button
                className="btn-ghost text-xs border border-slate-700 hover:bg-slate-800 flex-1"
                onClick={() => setSelectedIds({})}
              >
                Clear
              </button>
            </div>
          )}
          {!isLoading && !error && conversations.length === 0 && (
            <div className="mt-2">
              <button
                className="btn w-full"
                onClick={async()=>{
                  try{
                    const demo = await createConversation('127.0.0.1', { full_name: 'Demo User', email: 'demo@example.com' })
                    if (demo) setSelectedConversation(demo)
                  } catch{}
                }}
              >Start Demo Conversation</button>
              <div className="text-[11px] text-slate-400 mt-1">Creates a test chat so the dashboard isn’t blank.</div>
            </div>
          )}

          {/* removed demo conversation seed button */}


        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-slate-400">Loading conversations...</div>
          ) : error ? (
            <div className="p-4 text-center text-rose-400">{error}</div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedConversation={selectedConversation}
              onSelectConversation={handleConversationSelect}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`${
        isMobile && !selectedConversation ? 'hidden' : 'block'
      } flex-1 flex flex-col bg-slate-900/60`}> 
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-slate-900/60 border-b border-slate-800 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">
                    Conversation #{selectedConversation.id.slice(0, 8)}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Status: <span className={`capitalize ${
                      selectedConversation.status === 'active' ? 'text-emerald-400' :
                      selectedConversation.status === 'waiting' ? 'text-amber-400' :
                      'text-slate-400'
                    }`}>{selectedConversation.status}</span>
                  </p>
                </div>
                <div className="flex space-x-2">
                  {isMobile && (
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm hover:bg-slate-700"
                    >
                      ← Back
                    </button>
                  )}
                  {/* removed header MP3 uploader */}
                  <button onClick={() => useChatStore.getState().updateConversationStatus(selectedConversation.id, 'waiting')} className="px-3 py-1 bg-cyan-600 text-white rounded text-sm hover:bg-cyan-700">
                    Resolve
                  </button>
                  <button onClick={() => { useChatStore.getState().endConversation(selectedConversation.id); setSelectedConversation(null) }} className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm hover:bg-slate-700">
                    Close
                  </button>
                  <button onClick={() => { if (confirm('Delete this conversation permanently?')) { useChatStore.getState().deleteConversation(selectedConversation.id); setSelectedConversation(null) } }} className="px-3 py-1 bg-rose-600 text-white rounded text-sm hover:bg-rose-700">
                    Delete
                  </button>
                </div>
              </div>
            </div>

          {/* Chat Messages */}
          <ChatArea conversation={selectedConversation} />
          {/* removed header upload progress bar */}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-900/60">
            <div className="text-center">
              <div className="text-slate-500 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-200 mb-2">Select a conversation</h3>
              <p className="text-slate-400">Choose a conversation from the sidebar to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {!isMobile && (
        <div className="w-80 bg-slate-900/60 border-l border-slate-800 overflow-y-auto">
          <div className="p-4 border-b border-slate-800">
            <DashboardStats conversations={filteredConversations} stats={stats} onOpenConversation={handleConversationSelect} />
          </div>
          {selectedConversation && (
            <CustomerInfo conversation={selectedConversation} />
          )}
        </div>
      )}
    </div>
  )
}
