"use client"
import GlobalChat from '@/components/GlobalChat'

export default function ChatPage() {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold gradient-text">Members Chatroom</h1>
        <p className="text-slate-400">Connect with other members in real-time.</p>
      </div>
      <GlobalChat />
    </div>
  )
}
