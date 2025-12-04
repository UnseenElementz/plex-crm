'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Smile } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { Conversation, Message } from '@/stores/chatStore'
import { format } from 'date-fns'
import FileAttachment from '@/components/chat/FileAttachment'
import FileUpload from '@/components/chat/FileUpload'
import { fileService } from '@/services/fileService'

interface ChatAreaProps {
  conversation: Conversation
}

export default function ChatArea({ conversation }: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    markMessagesAsRead
  } = useChatStore()

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Mark messages as read when conversation is opened
    markMessagesAsRead(conversation.id)
  }, [conversation.id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    try {
      await sendMessage(conversation.id, newMessage, 'admin')
      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  async function handleFileUploaded(result: { url: string; fileName: string; fileSize: number; fileType: string }){
    try{
      const sizeLabel = fileService.formatFileSize(result.fileSize)
      const attachmentTag = `[File: ${result.fileName} (${sizeLabel})](${result.url})`
      const content = newMessage.trim() ? `${newMessage.trim()} ${attachmentTag}` : attachmentTag
      await sendMessage(conversation.id, content, 'admin')
      setNewMessage('')
    } catch (error){
      try{ useChatStore.getState().setError((error as Error).message) }catch{}
    }
  }

  function handleUploadError(message: string){
    try{ useChatStore.getState().setError(message) }catch{}
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.sender_type === 'admin'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {(() => {
                  const fileRegex = /\[File: ([^\]]+) \(([^\)]+)\)\]\(([^\)]+)\)/g
                  const m = fileRegex.exec(message.content)
                  if (m) {
                    const fileName = m[1]
                    const fileSize = m[2]
                    const url = m[3]
                    const lower = fileName.toLowerCase()
                    const isImg = ['.jpg','.jpeg','.png','.gif','.webp','.bmp'].some(ext=> lower.endsWith(ext))
                    const fileType = isImg ? 'image/' + (lower.split('.').pop() || 'jpeg') : 'application/octet-stream'
                    const displayContent = message.content.replace(fileRegex, '')
                    return (
                      <>
                        {displayContent && (<p className="text-sm">{displayContent}</p>)}
                        <div className="mt-2">
                          <FileAttachment url={url} fileName={fileName} fileSize={fileSize} fileType={fileType} />
                        </div>
                      </>
                    )
                  }
                  return (<p className="text-sm">{message.content}</p>)
                })()}
                <p className={`text-xs mt-1 ${
                  message.sender_type === 'admin' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {format(new Date(message.timestamp), 'dd/MM/yyyy')}
                  {!message.is_read && message.sender_type === 'customer' && (
                    <span className="ml-2 text-xs">●</span>
                  )}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSendMessage} className="flex space-x-3">
          <div className="flex-1">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
            disabled={isLoading}
          />
          </div>
          <div className="flex space-x-2">
            <FileUpload conversationId={conversation.id} onFileUploaded={handleFileUploaded} onError={handleUploadError} />
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Add emoji"
            >
              <Smile size={20} />
            </button>
            <button
              type="submit"
              disabled={!newMessage.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-2 p-2 bg-red-50 text-red-600 text-sm rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
