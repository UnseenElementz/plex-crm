'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useChatStore } from '@/stores/chatStore'
import ConversationList from './ConversationList'
import ChatArea from './ChatArea'
import CustomerInfo from './CustomerInfo'
import { Conversation } from '@/stores/chatStore'

export default function AdminDashboard() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'closed' | 'waiting'>('active')
  const [isMobile, setIsMobile] = useState(false)
  const [chatOnline, setChatOnline] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const searchParams = useSearchParams()
  
  const {
    conversations,
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
    disconnectSocket
  } = useChatStore()

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
    connectSocket()
    ;(async()=>{ try{ const res = await fetch('/api/admin/settings'); if(res.ok){ const d = await res.json(); setChatOnline(Boolean(d?.chat_online ?? true)) } } catch{} })()
    
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
  }, [conversations, filterStatus, searchTerm, selectedConversation])

  // Live updates come from realtime subscriptions; manual fetch occurs on selection only.

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

  async function updateChatOnline(next: boolean){
    setSaving(true)
    try{
      const g = await fetch('/api/admin/settings')
      const cur = g.ok ? await g.json() : {}
      const payload = { ...cur, chat_online: next }
      const r = await fetch('/api/admin/settings', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) return
      setChatOnline(next)
    } catch{}
    finally{ setSaving(false) }
  }

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
            {chatOnline !== null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${chatOnline ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                {chatOnline ? 'Online' : 'Offline'}
              </span>
            )}
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={Boolean(chatOnline)} onChange={e=> updateChatOnline(e.target.checked)} disabled={saving || chatOnline===null} />
              <span className="text-xs text-slate-400">Chat Availability</span>
            </label>
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

      {/* Customer Info Sidebar */}
      {selectedConversation && !isMobile && (
        <div className="w-64 bg-slate-900/60 border-l border-slate-800">
          <CustomerInfo conversation={selectedConversation} />
        </div>
      )}
    </div>
  )
}
