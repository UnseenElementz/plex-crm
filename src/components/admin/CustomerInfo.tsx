'use client'

import { User, Globe, Calendar, Info } from 'lucide-react'
import { useState } from 'react'
import { Conversation, useChatStore } from '@/stores/chatStore'
import { format } from 'date-fns'

interface CustomerInfoProps {
  conversation: Conversation
}

export default function CustomerInfo({ conversation }: CustomerInfoProps) {
  const { sendMessage, updateConversationStatus, updateConversationMetadata } = useChatStore()
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [fetchedPlexUser, setFetchedPlexUser] = useState<string | null>(null)

  useState(() => {
      const email = (conversation as any).metadata?.email
      if (email && !(conversation as any).metadata?.plex_username) {
          fetch(`/api/admin/customers/details?email=${encodeURIComponent(email)}`)
              .then(res => res.ok ? res.json() : null)
              .then(data => {
                  if (data?.plex_username) setFetchedPlexUser(data.plex_username)
              })
              .catch(() => {})
      }
  })
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
  const sendSignedUp = async () => {
    try{
      setSending(true); setSendMsg('')
      const email = (conversation as any).metadata?.email || ''
      if (!email) { setSendMsg('No email found'); return }
      const res = await fetch('/api/onboarding/signed-up', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) })
      const data = await res.json().catch(()=>({}))
      if (!res.ok){
        const msg = data?.error || 'Failed to send'
        setSendMsg(msg.includes('SMTP not configured') ? 'Email service not configured' : msg)
      } else {
        setSendMsg('Setup email sent')
      }
    } catch(e:any){ setSendMsg(e?.message || 'Failed to send') }
    finally{ setSending(false); setTimeout(()=> setSendMsg(''), 4000) }
  }
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-200 mb-2">Customer Info</h3>
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-slate-200">{(conversation as any).metadata?.full_name || (conversation as any).metadata?.email || `Customer #${conversation.id.slice(0, 8)}`}</p>
            {(conversation as any).metadata?.email && (
              <p className="text-sm text-slate-400">{(conversation as any).metadata?.email}</p>
            )}
            {fetchedPlexUser && !(conversation as any).metadata?.plex_username && (
              <p className="text-sm text-slate-400">Plex: {fetchedPlexUser}</p>
            )}
          </div>
        </div>
      </div>

      {/* Session Info */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-300 flex items-center">
          <Info className="w-4 h-4 mr-2" />
          Session Details
        </h4>
        
        <div className="space-y-2 text-sm">
          {conversation.customer_ip && (
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">IP: {conversation.customer_ip}</span>
            </div>
          )}
          {(conversation as any).metadata?.plex_username && (
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Plex: {(conversation as any).metadata.plex_username}</span>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">
              Started: {format(new Date(conversation.created_at), 'dd/MM/yyyy')}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">
              Last update: {format(new Date(conversation.updated_at), 'dd/MM/yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-300">Conversation Status</h4>
        
        <div className="space-y-2">
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            conversation.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' :
            conversation.status === 'waiting' ? 'bg-amber-500/20 text-amber-300' :
            'bg-slate-700/50 text-slate-300'
          }`}>
            {conversation.status === 'active' ? 'Active' :
             conversation.status === 'waiting' ? 'Waiting for response' :
             'Closed'}
          </div>
          
          {conversation.closed_at && (
            <p className="text-sm text-slate-500">
              Closed: {format(new Date(conversation.closed_at), 'dd/MM/yyyy')}
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-300">Quick Actions</h4>
        
        <div className="space-y-2">
          <button onClick={sendTemplate} className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">
            Send Template
          </button>
          
          <button onClick={sendSignedUp} disabled={sending} className="w-full px-3 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            Signed up
          </button>
          {sendMsg && (<div className="text-xs text-slate-500">{sendMsg}</div>)}

          <button onClick={transferChat} className="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors">
            Transfer Chat
          </button>
          
          <button onClick={blockUser} className="w-full px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors">
            Block User
          </button>
        </div>
      </div>

      {/* Metadata */}
      {(conversation.metadata || fetchedPlexUser) && (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-300">Additional Info</h4>
          
          <div className="space-y-1 text-sm">
            {fetchedPlexUser && !(conversation as any).metadata?.plex_username && (
                 <div className="flex justify-between">
                    <span className="text-slate-400 capitalize">plex username:</span>
                    <span className="text-slate-200">{fetchedPlexUser}</span>
                 </div>
            )}
            {conversation.metadata && Object.entries(conversation.metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="text-slate-200">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
