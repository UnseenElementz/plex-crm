'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { format } from 'date-fns'
import { getSupabase } from '@/lib/supabaseClient'
import { useChatStore } from '@/stores/chatStore'
import FileAttachment from './FileAttachment'
import FileUpload from './FileUpload'
import { fileService } from '@/services/fileService'

interface ChatWidgetProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor?: string
  welcomeMessage?: string
}

export default function ChatWidget({
  position = 'bottom-right',
  primaryColor = '#67e8f9',
  welcomeMessage = 'Hello! How can we help you today?',
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [identity, setIdentity] = useState<{ email?: string; full_name?: string } | null>(null)
  const [chatOnline, setChatOnline] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isLoading,
    error,
    fetchMessages,
    refreshMessages,
    sendMessage,
    createConversation,
    setCurrentConversation,
    connectSocket,
    disconnectSocket,
  } = useChatStore()

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const s = getSupabase()
    if (!s) {
      setIsAuthorized(false)
      return () => window.removeEventListener('resize', checkMobile)
    }

    s.auth.getUser().then(async ({ data }) => {
      const email = data?.user?.email || undefined
      if (!email) {
        setIsAuthorized(false)
        return
      }

      setIsAuthorized(true)
      try {
        const { data: prof } = await s.from('profiles').select('full_name').eq('email', email).limit(1)
        setIdentity({ email, full_name: prof?.[0]?.full_name || undefined })
      } catch {
        setIdentity({ email })
      }
    })

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!isOpen || !conversationId) return
    const interval = setInterval(() => {
      void refreshMessages(conversationId)
    }, 1500)
    return () => clearInterval(interval)
  }, [conversationId, isOpen, refreshMessages])

  useEffect(() => {
    if (isOpen) connectSocket()
    else disconnectSocket()
  }, [connectSocket, disconnectSocket, isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const avail = String(data?.chat_availability ?? (data?.chat_online === false ? 'off' : 'active')).toLowerCase()
        setChatOnline(avail !== 'off')
      } catch {}
    })()
  }, [])

  const ensureConversation = async () => {
    if (conversationId) return conversationId
    const conversation = await createConversation(undefined, identity || undefined)
    if (!conversation) return null
    setConversationId(conversation.id)
    setCurrentConversation(conversation)
    await fetchMessages(conversation.id)
    return conversation.id
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || !chatOnline) return

    const id = await ensureConversation()
    if (!id) return

    await sendMessage(id, trimmed, 'customer')
    setMessage('')
  }

  const handleFileUpload = async (result: { fileName: string; fileSize: number; url: string }) => {
    const id = await ensureConversation()
    if (!id) return
    const fileMessage = `[File: ${result.fileName} (${fileService.formatFileSize(result.fileSize)})](${result.url})`
    await sendMessage(id, fileMessage, 'customer')
  }

  const parseFileAttachment = (content: string) => {
    const fileRegex = /\[File: ([^\]]+) \(([^\)]+)\)\]\(([^\)]+)\)/g
    const matches = fileRegex.exec(content)
    if (!matches) return null
    const fileName = matches[1]
    const fileSize = matches[2]
    const url = matches[3]
    const lower = fileName.toLowerCase()
    const isImg = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some((ext) => lower.endsWith(ext))
    const fileType = isImg ? `image/${lower.split('.').pop() || 'jpeg'}` : 'application/octet-stream'
    return { fileName, fileSize, url, fileType }
  }

  const positionClasses = {
    'bottom-right': 'bottom-5 right-5',
    'bottom-left': 'bottom-5 left-5',
    'top-right': 'top-5 right-5',
    'top-left': 'top-5 left-5',
  }

  return (
    <>
      {!isOpen && isAuthorized && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed ${positionClasses[position]} z-50 rounded-full border border-cyan-300/30 p-4 text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.35)]`}
          style={{ background: `linear-gradient(135deg, ${primaryColor}, #60a5fa)` }}
          aria-label="Open live chat"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {isOpen && isAuthorized && (
        <div
          className={`fixed ${positionClasses[position]} z-50 flex flex-col overflow-hidden border border-cyan-400/20 bg-slate-950/95 shadow-[0_30px_90px_rgba(8,145,178,0.35)] backdrop-blur-2xl ${
            isMobile ? 'left-0 top-0 h-full w-full rounded-none' : 'h-[38rem] w-[25rem] rounded-[28px]'
          }`}
        >
          <div className="border-b border-white/8 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(15,23,42,0.72))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Support online</div>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">Live Chat</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {chatOnline ? welcomeMessage : 'We are offline right now. Leave your message and email and we will reply.'}
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="rounded-2xl border border-white/10 p-2 text-slate-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="panel p-4">
                <div className="text-sm font-medium text-slate-100">Start a conversation</div>
                <p className="mt-1 text-sm text-slate-400">
                  Ask about your plan, payments, service issues, or anything else and we will pick it up quickly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const fileAttachment = parseFileAttachment(msg.content)
                  const displayContent = fileAttachment ? msg.content.replace(/\[File: [^\]]+ \([^\)]+\)\]\([^\)]+\)/g, '').trim() : msg.content

                  return (
                    <div key={msg.id} className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-[24px] px-4 py-3 ${
                          msg.sender_type === 'customer'
                            ? 'bg-[linear-gradient(135deg,#67e8f9,#38bdf8)] text-slate-950'
                            : 'border border-white/10 bg-white/5 text-slate-100'
                        }`}
                      >
                        {displayContent ? <p className="text-sm leading-6">{displayContent}</p> : null}
                        {fileAttachment ? (
                          <div className="mt-2">
                            <FileAttachment
                              url={fileAttachment.url}
                              fileName={fileAttachment.fileName}
                              fileSize={fileAttachment.fileSize}
                              fileType={fileAttachment.fileType}
                            />
                          </div>
                        ) : null}
                        <p className={`mt-2 text-[11px] ${msg.sender_type === 'customer' ? 'text-slate-800/70' : 'text-slate-500'}`}>
                          {format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {isLoading ? (
              <div className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                Updating conversation...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="border-t border-white/8 bg-slate-950/90 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSendMessage(e as unknown as React.FormEvent)
                  }
                }}
                placeholder={chatOnline ? 'Type your message...' : 'Leave a message and your email'}
                className="input flex-1"
              />
              <FileUpload
                conversationId={conversationId || undefined}
                ensureConversationId={ensureConversation}
                onFileUploaded={handleFileUpload}
                onError={(uploadError) => console.error('File upload error:', uploadError)}
              />
              <button type="submit" disabled={!message.trim() || isLoading || !chatOnline} className="btn px-4 py-3 disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
            {error ? <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
          </form>
        </div>
      )}
    </>
  )
}
