import Chat from '@/components/Chat'

export default function CustomerChatPage(){
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Support Chat</h2>
      <Chat chatId="demo-chat" role="customer" />
    </main>
  )
}