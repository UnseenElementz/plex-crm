'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { format } from 'date-fns'
import { useChatStore } from '@/stores/chatStore'
import { Conversation } from '@/stores/chatStore'
import FileAttachment from '@/components/chat/FileAttachment'
import FileUpload from '@/components/chat/FileUpload'
import { fileService } from '@/services/fileService'
import { polishWritingDraft } from '@/lib/writingAssistant'

interface ChatAreaProps {
  conversation: Conversation
}

export default function ChatArea({ conversation }: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, isLoading, error, sendMessage, markMessagesAsRead } = useChatStore()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    void markMessagesAsRead(conversation.id)
  }, [conversation.id, markMessagesAsRead])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newMessage.trim()
    if (!trimmed) return
    await sendMessage(conversation.id, trimmed, 'admin')
    setNewMessage('')
  }

  async function handleFileUploaded(result: { url: string; fileName: string; fileSize: number; fileType: string }) {
    const sizeLabel = fileService.formatFileSize(result.fileSize)
    const attachmentTag = `[File: ${result.fileName} (${sizeLabel})](${result.url})`
    const content = newMessage.trim() ? `${newMessage.trim()} ${attachmentTag}` : attachmentTag
    await sendMessage(conversation.id, content, 'admin')
    setNewMessage('')
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="panel mx-auto max-w-lg p-5 text-center">
            <div className="text-base font-semibold text-slate-100">No messages yet</div>
            <p className="mt-2 text-sm text-slate-400">This thread is ready for a fast first reply.</p>
          </div>
        ) : (
          messages.map((message) => {
            const fileRegex = /\[File: ([^\]]+) \(([^\)]+)\)\]\(([^\)]+)\)/g
            const match = fileRegex.exec(message.content)
            const displayContent = match ? message.content.replace(fileRegex, '').trim() : message.content

            return (
              <div key={message.id} className={`flex ${message.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-[24px] px-4 py-3 ${
                    message.sender_type === 'admin'
                      ? 'bg-[linear-gradient(135deg,#67e8f9,#38bdf8)] text-slate-950'
                      : 'border border-white/10 bg-white/5 text-slate-100'
                  }`}
                >
                  {displayContent ? <p className="text-sm leading-6">{displayContent}</p> : null}
                  {match ? (
                    <div className="mt-3">
                      <FileAttachment
                        url={match[3]}
                        fileName={match[1]}
                        fileSize={match[2]}
                        fileType={['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some((ext) => match[1].toLowerCase().endsWith(ext)) ? `image/${match[1].split('.').pop()}` : 'application/octet-stream'}
                      />
                    </div>
                  ) : null}
                  <div className={`mt-2 text-[11px] ${message.sender_type === 'admin' ? 'text-slate-900/70' : 'text-slate-500'}`}>
                    {format(new Date(message.timestamp), 'dd/MM/yyyy HH:mm')}
                    {!message.is_read && message.sender_type === 'customer' ? <span className="ml-2">Unread</span> : null}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/8 bg-slate-950/65 p-5">
        <form onSubmit={handleSendMessage} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Reply to the customer..."
            className="input min-w-[240px] flex-1"
            disabled={isLoading}
            spellCheck
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-outline px-4 py-3"
              onClick={() => setNewMessage((current) => polishWritingDraft(current))}
              disabled={!newMessage.trim()}
            >
              Polish
            </button>
            <FileUpload conversationId={conversation.id} onFileUploaded={handleFileUploaded} onError={(message) => useChatStore.getState().setError(message)} />
            <button type="submit" disabled={!newMessage.trim() || isLoading} className="btn px-4 py-3 disabled:opacity-50">
              <Send size={16} />
            </button>
          </div>
        </form>
        {error ? <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
      </div>
    </div>
  )
}
