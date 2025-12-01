'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, Paperclip, Smile } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { format } from 'date-fns'
import { getSupabase } from '@/lib/supabaseClient'
import FileUpload from './FileUpload'
import FileAttachment from './FileAttachment'
import { fileService } from '@/services/fileService'

interface ChatWidgetProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  primaryColor?: string
  welcomeMessage?: string
}

export default function ChatWidget({
  position = 'bottom-right',
  primaryColor = '#0ea5e9',
  welcomeMessage = 'Hello! How can we help you today?'
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [customerId, setCustomerId] = useState<string>('')
  const [conversationId, setConversationId] = useState<string>('')
  const [isMobile, setIsMobile] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [identity, setIdentity] = useState<{ email?: string; full_name?: string } | null>(null)
  const [chatOnline, setChatOnline] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const {
    messages,
    currentConversation,
    isLoading,
    error,
    fetchMessages,
    refreshMessages,
    sendMessage,
    createConversation,
    addMessage,
    setCurrentConversation,
    connectSocket,
    disconnectSocket
  } = useChatStore()

  useEffect(() => {
    // Check if mobile device
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    // Require Supabase-authenticated customer
    const s = getSupabase()
    if (!s) {
      setIsAuthorized(false)
    } else {
      s.auth.getUser().then(async ({ data }) => {
        const email = data?.user?.email || undefined
        if (!email) { setIsAuthorized(false); return }
        setIsAuthorized(true)
        // Try to get profile full_name
        try {
          const { data: prof } = await s.from('profiles').select('full_name').eq('email', email).limit(1)
          const full_name = prof?.[0]?.full_name || undefined
          setIdentity({ email, full_name })
        } catch {
          setIdentity({ email })
        }
        // Customer ID for local session
        let storedCustomerId = localStorage.getItem('chat_customer_id')
        if (!storedCustomerId) {
          storedCustomerId = crypto.randomUUID()
          localStorage.setItem('chat_customer_id', storedCustomerId)
        }
        setCustomerId(storedCustomerId)
      })
    }
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isAuthorized && isOpen && customerId && !currentConversation) {
      initializeConversation()
    }
  }, [isOpen, customerId, isAuthorized])

  useEffect(() => {
    if (!isOpen || !conversationId) return
    const interval = setInterval(() => {
      try { refreshMessages(conversationId) } catch {}
    }, 1500)
    return () => clearInterval(interval)
  }, [isOpen, conversationId])

  useEffect(() => {
    if (isOpen) {
      connectSocket()
    } else {
      disconnectSocket()
    }
  }, [isOpen])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/admin/settings')
        if (res.ok){
          const data = await res.json()
          setChatOnline(Boolean(data?.chat_online ?? true))
        }
      } catch{}
    })()
  }, [])

  const initializeConversation = async () => {
    try {
      // Create new conversation for customer
      const conversation = await createConversation(undefined, identity || undefined)
      if (conversation) {
        setConversationId(conversation.id)
        setCurrentConversation(conversation)
        await fetchMessages(conversation.id)
        // Add welcome message
        const welcomeMsg = {
          id: crypto.randomUUID(),
          conversation_id: conversation.id,
          sender_id: 'system',
          sender_type: 'admin' as const,
          content: welcomeMessage,
          timestamp: new Date().toISOString(),
          is_read: false,
          metadata: {}
        }
        addMessage(welcomeMsg)
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !conversationId) return

    try {
      await sendMessage(conversationId, message, 'customer')
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleFileUpload = async (result: any) => {
    // Send a message with the file URL
    const fileMessage = `[File: ${result.fileName} (${fileService.formatFileSize(result.fileSize)})](${result.url})`
    await sendMessage(conversationId, fileMessage, 'customer')
  }

  const handleFileError = (error: string) => {
    console.error('File upload error:', error)
  }

  const parseFileAttachment = (content: string) => {
    // Simple regex to parse file attachments in format: [File: filename (size)](url)
    const fileRegex = /\[File: ([^\]]+) \(([^\)]+)\)\]\(([^\)]+)\)/g
    const matches = fileRegex.exec(content)
    
    if (matches) {
      return {
        fileName: matches[1],
        fileSize: matches[2],
        url: matches[3]
      }
    }
    
    return null
  }

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  }

  return (
    <>
      {/* Chat Button */}
      {!isOpen && isAuthorized && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed ${positionClasses[position]} z-50 rounded-full p-4 shadow-glow transition-all duration-200 hover:scale-105 bg-cyan-600 hover:bg-cyan-700 text-white`}
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && isAuthorized && (
        <div className={`fixed ${positionClasses[position]} z-50 ${
          isMobile ? 'w-full h-full top-0 left-0' : 'w-80 h-96'
        } glass rounded-lg shadow-2xl flex flex-col border border-cyan-500/20`}>
          {/* Header */}
          <div className="p-4 rounded-t-lg flex justify-between items-center bg-slate-900/40">
            <div>
              <h3 className="font-semibold text-slate-200">Live Chat</h3>
              {chatOnline ? (
                <p className="text-xs text-slate-400">We&apos;re here to help</p>
              ) : (
                <p className="text-xs text-amber-300">We are currently offline. Please leave a message with your email and we will get back to you.</p>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 transition-colors text-slate-300 hover:text-cyan-300"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const fileAttachment = parseFileAttachment(msg.content)
              const displayContent = fileAttachment ? 
                msg.content.replace(/\[File: [^\]]+ \([^\)]+\)\]\([^\)]+\)/g, '') : 
                msg.content

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                  className={`max-w-xs px-3 py-2 rounded-lg ${
                      msg.sender_type === 'customer'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-200'
                    } shadow-glow`}
                  >
                    {displayContent && (
                      <p className="text-sm">{displayContent}</p>
                    )}
                    
                    {fileAttachment && (
                      <div className="mt-2">
                        <FileAttachment
                          url={fileAttachment.url}
                          fileName={fileAttachment.fileName}
                          fileSize={fileAttachment.fileSize}
                          fileType="application/octet-stream" // Default type
                        />
                      </div>
                    )}
                    
                    <p className={`text-xs mt-1 ${
                      msg.sender_type === 'customer' ? 'text-cyan-100' : 'text-slate-400'
                    }`}>
                      {format(new Date(msg.timestamp), 'HH:mm')}
                    </p>
                  </div>
                </div>
              )
            })}
            {isLoading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200">
                  <p className="text-sm">Typing...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/40">
            <div className="flex space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && message.trim()) { e.preventDefault(); handleSendMessage(e as any) } }}
                placeholder={chatOnline ? 'Type your message...' : 'We are offline — leave your message and email'}
                className="flex-1 input"
              />
              {conversationId && (
                <FileUpload
                  conversationId={conversationId}
                  onFileUploaded={handleFileUpload}
                  onError={handleFileError}
                />
              )}
              <button
                type="submit"
                disabled={!message.trim() || isLoading}
                className="btn disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </form>

          {error && (
            <div className="px-4 py-2 bg-rose-500/20 text-rose-300 text-sm">
              {error}
            </div>
          )}
        </div>
      )}
    </>
  )
}
