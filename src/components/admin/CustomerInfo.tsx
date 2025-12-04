'use client'

import { User, Globe, Calendar, Info } from 'lucide-react'
import { Conversation, useChatStore } from '@/stores/chatStore'
import { format } from 'date-fns'

interface CustomerInfoProps {
  conversation: Conversation
}

export default function CustomerInfo({ conversation }: CustomerInfoProps) {
  const { sendMessage, updateConversationStatus, updateConversationMetadata } = useChatStore()
  const sendTemplate = async () => {
    await sendMessage(conversation.id, 'Thanks for reaching out! A team member will be with you shortly.', 'admin')
  }
  const transferChat = async () => {
    await updateConversationMetadata(conversation.id, { assigned_admin: 'support' })
  }
  const blockUser = async () => {
    await updateConversationMetadata(conversation.id, { blocked: true })
  }
  const resolve = async () => {
    await updateConversationStatus(conversation.id, 'waiting')
  }
  const close = async () => {
    await updateConversationStatus(conversation.id, 'closed')
  }
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Customer Info</h3>
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{(conversation as any).metadata?.full_name || (conversation as any).metadata?.email || `Customer #${conversation.id.slice(0, 8)}`}</p>
            {(conversation as any).metadata?.email && (
              <p className="text-sm text-gray-500">{(conversation as any).metadata?.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Session Info */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-800 flex items-center">
          <Info className="w-4 h-4 mr-2" />
          Session Details
        </h4>
        
        <div className="space-y-2 text-sm">
          {conversation.customer_ip && (
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">IP: {conversation.customer_ip}</span>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              Started: {format(new Date(conversation.created_at), 'dd/MM/yyyy')}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              Last update: {format(new Date(conversation.updated_at), 'dd/MM/yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-800">Conversation Status</h4>
        
        <div className="space-y-2">
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            conversation.status === 'active' ? 'bg-green-100 text-green-800' :
            conversation.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {conversation.status === 'active' ? 'Active' :
             conversation.status === 'waiting' ? 'Waiting for response' :
             'Closed'}
          </div>
          
          {conversation.closed_at && (
            <p className="text-sm text-gray-600">
              Closed: {format(new Date(conversation.closed_at), 'dd/MM/yyyy')}
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-800">Quick Actions</h4>
        
        <div className="space-y-2">
          <button onClick={sendTemplate} className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">
            Send Template
          </button>
          
          <button onClick={transferChat} className="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors">
            Transfer Chat
          </button>
          
          <button onClick={blockUser} className="w-full px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors">
            Block User
          </button>
        </div>
      </div>

      {/* Metadata */}
      {conversation.metadata && Object.keys(conversation.metadata).length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-800">Additional Info</h4>
          
          <div className="space-y-1 text-sm">
            {Object.entries(conversation.metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="text-gray-900">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
