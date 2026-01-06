"use client"
import { useEffect, useState, useRef } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { format } from 'date-fns'
import { Send, Trash2, Ban, Lock, Unlock } from 'lucide-react'

type Message = { id: string; user_email: string; user_name: string; content: string; created_at: string; is_deleted: boolean }

export default function GlobalChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ email: string; name?: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMod, setIsMod] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Fetch user & permissions
  useEffect(() => {
    (async () => {
        const s = getSupabase()
        if (!s) return
        const { data } = await s.auth.getUser()
        if (data.user?.email) {
            setCurrentUser({ email: data.user.email })
            
            // Check admin
            try {
                const res = await fetch('/api/admin/auth/session')
                if (res.ok) setIsAdmin(true)
            } catch {}
            
            // Check mod
            const { data: modData } = await s.from('global_chat_moderators').select('email').eq('email', data.user.email).single()
            if (modData) setIsMod(true)
        }
    })()
  }, [])

  // Fetch status & messages & sub
  useEffect(() => {
    fetchMessages()
    fetchStatus()
    
    const s = getSupabase()
    if (!s) return

    const ch = s.channel('global_chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat_messages' }, payload => {
            setMessages(prev => [payload.new as Message, ...prev])
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_chat_messages' }, payload => {
             setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_chat_settings', filter: "key=eq.is_open" }, payload => {
            setIsOpen(payload.new.value === 'true')
        })
        .subscribe()
        
    return () => { s.removeChannel(ch) }
  }, [])

  async function fetchMessages() {
      const res = await fetch('/api/chat/global')
      if (res.ok) {
          const data = await res.json()
          setMessages(data.items || [])
      }
      setLoading(false)
  }

  async function fetchStatus() {
      const res = await fetch('/api/chat/global/status')
      if (res.ok) {
          const data = await res.json()
          setIsOpen(data.is_open)
      }
  }

  async function send() {
      if (!input.trim() || sending) return
      setSending(true)
      try {
          const res = await fetch('/api/chat/global', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  email: currentUser?.email, 
                  content: input,
                  name: currentUser?.email?.split('@')[0] 
              })
          })
          const data = await res.json()
          if (!res.ok) {
              alert(data.error || 'Failed to send')
          } else {
              setInput('')
          }
      } catch (e) {
          alert('Network error')
      } finally {
          setSending(false)
      }
  }

  async function adminAction(action: string, payload: any) {
      if (!confirm('Are you sure?')) return
      await fetch('/api/chat/global/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...payload, mod_email: currentUser?.email })
      })
  }

  return (
    <div className="flex flex-col h-[600px] glass rounded-2xl border border-cyan-500/20 overflow-hidden relative">
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-900/50">
            <h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></span>
                Members Chatroom
            </h3>
            {isAdmin && (
                <button 
                    onClick={() => adminAction('toggle_open', { value: !isOpen })}
                    className={`btn-xs ${isOpen ? 'btn-outline-rose' : 'btn-outline-emerald'}`}
                >
                    {isOpen ? <Lock size={14} /> : <Unlock size={14} />}
                    {isOpen ? 'Close Chat' : 'Open Chat'}
                </button>
            )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse">
            {messages.map(m => (
                <div key={m.id} className={`group flex flex-col ${m.user_email === currentUser?.email ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-400">{m.user_name}</span>
                        <span className="text-[10px] text-slate-600">{format(new Date(m.created_at), 'HH:mm')}</span>
                        {(isAdmin || isMod) && !m.is_deleted && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button onClick={() => adminAction('delete', { target_id: m.id })} className="text-rose-400 hover:text-rose-300" title="Delete"><Trash2 size={12} /></button>
                                <button onClick={() => adminAction('ban', { target_email: m.user_email })} className="text-amber-400 hover:text-amber-300" title="Ban User"><Ban size={12} /></button>
                            </div>
                        )}
                    </div>
                    {m.is_deleted ? (
                        <div className="text-xs text-slate-600 italic border border-slate-800 rounded px-2 py-1">Message deleted</div>
                    ) : (
                        <div className={`px-4 py-2 rounded-2xl max-w-[85%] break-words text-sm ${
                            m.user_email === currentUser?.email 
                                ? 'bg-cyan-500/20 text-cyan-100 rounded-br-none border border-cyan-500/20' 
                                : 'bg-slate-800/50 text-slate-300 rounded-bl-none border border-slate-700/50'
                        }`}>
                            {m.content}
                        </div>
                    )}
                </div>
            ))}
            {messages.length === 0 && !loading && (
                <div className="text-center text-slate-500 py-10">No messages yet. Say hello!</div>
            )}
        </div>

        {/* Input */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
            {!isOpen ? (
                <div className="flex items-center justify-center gap-2 text-rose-400 text-sm py-2">
                    <Lock size={16} />
                    Chat is currently closed
                </div>
            ) : currentUser ? (
                <form onSubmit={e => { e.preventDefault(); send() }} className="flex gap-2">
                    <input 
                        className="input flex-1 bg-slate-950/50" 
                        placeholder="Type a message..." 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={sending}
                    />
                    <button type="submit" className="btn px-4" disabled={!input.trim() || sending}>
                        <Send size={18} />
                    </button>
                </form>
            ) : (
                <div className="text-center text-slate-500 text-sm">
                    Please <a href="/customer/login" className="text-cyan-400 hover:underline">login</a> to chat.
                </div>
            )}
        </div>
    </div>
  )
}
