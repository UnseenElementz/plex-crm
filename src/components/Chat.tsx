"use client"
import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

type Message = { id: string; chat_id: string; sender: 'customer'|'admin'; text: string; created_at: string; attachment_url?: string }

export default function Chat({ chatId, role }: { chatId: string; role: 'customer'|'admin' }){
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = getSupabase()
    if (!s) return
    const channel = (s as any)
      .channel('public:messages')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload: any) => {
        const msg = payload?.new as Message
        setMessages((m)=>[...m, msg])
      })
      .subscribe()
    ;(async ()=>{
      const { data } = await s.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true })
      setMessages(data as Message[] || [])
    })()
    return ()=>{ try { s.removeChannel(channel) } catch{} }
  }, [chatId])

  useEffect(()=>{ bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(){
    if (!text.trim()) return
    const s = getSupabase(); if (!s) return
    await s.from('messages').insert({ chat_id: chatId, sender: role, text })
    setText('')
  }

  return (
    <div className="glass p-4 rounded-2xl h-[480px] flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-2">
        {messages.map(m=> (
          <div key={m.id} className={`max-w-[70%] p-2 rounded-xl ${m.sender==='customer'?'bg-slate-800':'bg-slate-700 ml-auto'} shadow-glow`}>
            <div className="text-xs text-slate-400">{new Date(m.created_at).toLocaleString()}</div>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input flex-1" value={text} onChange={e=>setText(e.target.value)} placeholder="Type a message" />
        <button className="btn" onClick={send}>Send</button>
      </div>
    </div>
  )}
