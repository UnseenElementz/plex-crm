import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
let __msgChannel: any = null
let __convChannel: any = null

export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Participant = Database['public']['Tables']['participants']['Row']
export type Attachment = Database['public']['Tables']['attachments']['Row']

export interface ChatState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  participants: Participant[]
  isLoading: boolean
  error: string | null
  isConnected: boolean
  hasLoaded: boolean
  
  // Actions
  setConversations: (conversations: Conversation[]) => void
  setCurrentConversation: (conversation: Conversation | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setConnected: (connected: boolean) => void
  
  // API calls
  fetchConversations: () => Promise<void>
  refreshConversations: () => Promise<void>
  fetchMessages: (conversationId: string) => Promise<void>
  refreshMessages: (conversationId: string) => Promise<void>
  sendMessage: (conversationId: string, content: string, senderType: 'customer' | 'admin') => Promise<void>
  createConversation: (customerIp?: string, metadata?: Record<string, any>) => Promise<Conversation | null>
  markMessagesAsRead: (conversationId: string) => Promise<void>
  
  // Socket operations
  connectSocket: () => void
  disconnectSocket: () => void
  updateConversationStatus: (conversationId: string, status: 'active'|'closed'|'waiting') => Promise<void>
  updateConversationMetadata: (conversationId: string, metadata: Record<string, any>) => Promise<void>
  endConversation: (conversationId: string) => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  participants: [],
  isLoading: false,
  error: null,
  isConnected: false,
  hasLoaded: false,

  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setConnected: (isConnected) => set({ isConnected }),

  fetchConversations: async () => {
    const { hasLoaded } = get()
    set({ isLoading: hasLoaded ? false : true, error: null })
    try {
      const res = await fetch('/api/chat/conversations')
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      set({ conversations: data || [], isLoading: false, hasLoaded: true })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  refreshConversations: async () => {
    try {
      const res = await fetch('/api/chat/conversations')
      if (!res.ok) return
      const data: Conversation[] = await res.json()
      const prev = get().conversations
      const prevSig = JSON.stringify(prev.map(c=>({ id: c.id, updated_at: c.updated_at, status: c.status })))
      const nextSig = JSON.stringify((data||[]).map(c=>({ id: c.id, updated_at: c.updated_at, status: c.status })))
      if (prevSig !== nextSig) {
        set({ conversations: data || [] })
      }
    } catch {}
  },

  fetchMessages: async (conversationId: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}`)
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      set({ messages: data || [], isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  refreshMessages: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}`)
      if (!res.ok) return
      const data: Message[] = await res.json()
      const prev = get().messages
      if (!prev.length && !data.length) return
      const lastPrev = prev[prev.length-1]?.id
      const lastNext = data[data.length-1]?.id
      if (lastPrev !== lastNext || prev.length !== data.length) {
        set({ messages: data || [] })
      }
    } catch {}
  },

  sendMessage: async (conversationId: string, content: string, senderType: 'customer' | 'admin') => {
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, sender_type: senderType, content })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      get().addMessage(data)
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  createConversation: async (customerIp?: string, metadata?: Record<string, any>) => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ip: customerIp, metadata })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      return data as Conversation
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  markMessagesAsRead: async (conversationId: string) => {
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  updateConversationStatus: async (conversationId: string, status: 'active'|'closed'|'waiting') => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const row = await res.json()
      const { conversations } = get()
      const updated = conversations.some(c=>c.id===conversationId) ? conversations.map(c=> c.id===conversationId ? row : c) : [row, ...conversations]
      set({ conversations: updated })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  updateConversationMetadata: async (conversationId: string, metadata: Record<string, any>) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const row = await res.json()
      const { conversations } = get()
      const updated = conversations.map(c=> c.id===conversationId ? row : c)
      set({ conversations: updated })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  endConversation: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' })
      })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const row = await res.json()
      const { conversations } = get()
      const updated = conversations.map(c=> c.id===conversationId ? row : c)
      set({ conversations: updated, currentConversation: null })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(()=>({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const { conversations, currentConversation } = get()
      const updated = conversations.filter(c => c.id !== conversationId)
      set({ conversations: updated, currentConversation: currentConversation && currentConversation.id === conversationId ? null : currentConversation })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  connectSocket: () => {
    if (__msgChannel) return
    __msgChannel = supabase?.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
        const msg = payload?.new as Message
        const { currentConversation } = get()
        if (currentConversation && msg && msg.conversation_id === currentConversation.id) {
          get().addMessage(msg)
        }
      })
      .subscribe()
    __convChannel = supabase?.channel('public:conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload: any) => {
        const row = payload?.new as Conversation
        const { conversations } = get()
        if (!row) return
        const exists = conversations.some(c => c.id === row.id)
        if (!exists && payload.eventType === 'INSERT') {
          set({ conversations: [row, ...conversations] })
        } else if (exists && payload.eventType === 'UPDATE') {
          const updated = conversations.map(c => c.id === row.id ? row : c)
          set({ conversations: updated })
        }
      })
      .subscribe()
    set({ isConnected: true })
  },

  disconnectSocket: () => {
    try { if (__msgChannel && supabase) supabase.removeChannel(__msgChannel) } catch {}
    try { if (__convChannel && supabase) supabase.removeChannel(__convChannel) } catch {}
    __msgChannel = null
    __convChannel = null
    set({ isConnected: false })
  }
}))
