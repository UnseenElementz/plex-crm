'use client'

import { Calendar, Globe, Info, ShieldAlert, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Conversation, useChatStore } from '@/stores/chatStore'

interface CustomerInfoProps {
  conversation: Conversation
}

type DetailState = {
  plex_username?: string
  full_name?: string
  status?: string
  subscription_type?: string
  streams?: number
  next_payment_date?: string | null
  notes?: string
  ip_history?: string[]
  blocked_ips?: string[]
}

export default function CustomerInfo({ conversation }: CustomerInfoProps) {
  const { sendMessage, updateConversationStatus, updateConversationMetadata } = useChatStore()
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [details, setDetails] = useState<DetailState | null>(null)
  const [blocking, setBlocking] = useState(false)

  useEffect(() => {
    const email = (conversation as any).metadata?.email
    if (!email) return
    fetch(`/api/admin/customers/details?email=${encodeURIComponent(email)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetails(data))
      .catch(() => {})
  }, [conversation])

  const currentIp = conversation.customer_ip || ''
  const isBlocked = Boolean(currentIp && details?.blocked_ips?.includes(currentIp))

  const sendTemplate = async () => {
    await sendMessage(conversation.id, 'Thanks for reaching out. A team member will review this and get back to you shortly.', 'admin')
  }

  const transferChat = async () => {
    await updateConversationMetadata(conversation.id, { assigned_admin: 'support' })
  }

  const resolve = async () => {
    await updateConversationStatus(conversation.id, 'waiting')
  }

  const close = async () => {
    await updateConversationStatus(conversation.id, 'closed')
  }

  const hardBanIp = async () => {
    if (!currentIp) return
    if (!confirm(`Hard block IP ${currentIp}?`)) return
    setBlocking(true)
    try {
      const res = await fetch('/api/admin/security/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: currentIp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendMsg(data?.error || 'Failed to block IP')
        return
      }
      setDetails((current) => ({ ...(current || {}), blocked_ips: data?.blocked_ips || [] }))
      await updateConversationMetadata(conversation.id, { blocked: true, blocked_ip: currentIp })
      setSendMsg(`Blocked ${currentIp}`)
    } catch (e: any) {
      setSendMsg(e?.message || 'Failed to block IP')
    } finally {
      setBlocking(false)
      setTimeout(() => setSendMsg(''), 4000)
    }
  }

  const sendSignedUp = async () => {
    try {
      setSending(true)
      setSendMsg('')
      const email = (conversation as any).metadata?.email || ''
      if (!email) {
        setSendMsg('No email found')
        return
      }
      const res = await fetch('/api/onboarding/signed-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await res.json().catch(() => ({}))
      setSendMsg(res.ok ? 'Setup email sent' : data?.error || 'Failed to send')
    } catch (e: any) {
      setSendMsg(e?.message || 'Failed to send')
    } finally {
      setSending(false)
      setTimeout(() => setSendMsg(''), 4000)
    }
  }

  return (
    <div className="space-y-6 p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Customer Profile</h3>
        <div className="mt-4 flex items-start gap-3">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-3 text-cyan-300">
            <User size={18} />
          </div>
          <div>
            <p className="font-medium text-slate-100">{(conversation as any).metadata?.full_name || (conversation as any).metadata?.email || `Customer #${conversation.id.slice(0, 8)}`}</p>
            {(conversation as any).metadata?.email ? <p className="text-sm text-slate-400">{(conversation as any).metadata?.email}</p> : null}
            {details?.plex_username ? <p className="text-sm text-slate-500">Plex: {details.plex_username}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="flex items-center gap-2 font-medium text-slate-300">
          <Info size={15} />
          Session Details
        </h4>
        <div className="space-y-2 text-sm">
          {currentIp ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2 text-slate-300">
                <Globe size={14} className="text-slate-500" />
                {currentIp}
              </div>
              {isBlocked ? <span className="tag inactive">blocked</span> : <span className="tag active">live</span>}
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={14} />
            Started: {format(new Date(conversation.created_at), 'dd/MM/yyyy HH:mm')}
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar size={14} />
            Updated: {format(new Date(conversation.updated_at), 'dd/MM/yyyy HH:mm')}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-slate-300">Account Context</h4>
        <div className="grid gap-2">
          <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-300">
            Status: <span className="text-slate-100">{details?.status || 'unknown'}</span>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-300">
            Package: <span className="text-slate-100">{details?.subscription_type || 'unknown'}</span>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-300">
            Streams: <span className="text-slate-100">{details?.streams ?? '-'}</span>
          </div>
          {details?.next_payment_date ? (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-300">
              Next payment: <span className="text-slate-100">{details.next_payment_date}</span>
            </div>
          ) : null}
        </div>
      </div>

      {details?.ip_history?.length ? (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-300">Known IP History</h4>
          <div className="space-y-2">
            {details.ip_history.map((ip) => (
              <div key={ip} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-slate-300">
                {ip}
                {details.blocked_ips?.includes(ip) ? <span className="ml-2 text-rose-300">blocked</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="font-medium text-slate-300">Quick Actions</h4>
        <div className="space-y-2">
          <button onClick={sendTemplate} className="btn-outline w-full">Send Template</button>
          <button onClick={sendSignedUp} disabled={sending} className="btn-outline w-full">{sending ? 'Sending...' : 'Send Setup Email'}</button>
          <button onClick={transferChat} className="btn-outline w-full">Transfer Chat</button>
          <button onClick={resolve} className="btn-outline w-full">Mark Waiting</button>
          <button onClick={close} className="btn-outline w-full">Close Conversation</button>
          <button onClick={hardBanIp} disabled={!currentIp || blocking} className="w-full rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 disabled:opacity-50">
            <span className="inline-flex items-center gap-2">
              <ShieldAlert size={15} />
              {blocking ? 'Blocking IP...' : 'Hard Ban Current IP'}
            </span>
          </button>
          {sendMsg ? <div className="text-xs text-slate-500">{sendMsg}</div> : null}
        </div>
      </div>

      {details?.notes ? (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-300">Notes</h4>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-3 text-sm leading-6 text-slate-300 whitespace-pre-wrap">{details.notes}</div>
        </div>
      ) : null}
    </div>
  )
}
