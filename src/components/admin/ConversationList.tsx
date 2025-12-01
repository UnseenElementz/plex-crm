'use client'

import { formatDistanceToNow } from 'date-fns'
import { MessageCircle, Clock, User } from 'lucide-react'
import { Conversation } from '@/stores/chatStore'

interface ConversationListProps {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  onSelectConversation: (conversation: Conversation) => void
}

export default function ConversationList({
  conversations,
  selectedConversation,
  onSelectConversation
}: ConversationListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'waiting':
        return 'bg-yellow-500'
      case 'closed':
        return 'bg-gray-500'
      default:
        return 'bg-blue-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active'
      case 'waiting':
        return 'Waiting'
      case 'closed':
        return 'Closed'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="divide-y divide-gray-200">
      {conversations.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No conversations found</p>
        </div>
      ) : (
        conversations.map((conversation) => (
          <div
            key={conversation.id}
            onClick={() => onSelectConversation(conversation)}
            className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
              selectedConversation?.id === conversation.id ? 'bg-blue-50 border-r-2 border-blue-600' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {(conversation as any).metadata?.full_name || (conversation as any).metadata?.email || `Customer #${conversation.id.slice(0, 8)}`}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    conversation.status === 'active' ? 'bg-green-100 text-green-800' :
                    conversation.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {getStatusText(conversation.status)}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}</span>
                </div>
              </div>
              
              <div className="ml-3">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(conversation.status)}`}></div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
