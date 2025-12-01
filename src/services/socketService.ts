import { io, Socket } from 'socket.io-client'
import { Message } from '@/stores/chatStore'

class SocketService {
  private socket: Socket | null = null
  private isConnected = false

  connect() {
    // For demo purposes, we'll simulate Socket.IO behavior
    // In production, you would connect to your actual Socket.IO server
    this.socket = {
      connected: true,
      on: (event: string, callback: Function) => {
        console.log(`Listening for event: ${event}`)
        // Simulate receiving messages
        if (event === 'new-message') {
          setInterval(() => {
            const mockMessage: Message = {
              id: crypto.randomUUID(),
              conversation_id: 'demo-conversation',
              sender_id: 'demo-admin',
              sender_type: 'admin',
              content: 'This is a demo message from the admin',
              timestamp: new Date().toISOString(),
              is_read: false,
              metadata: {}
            }
            callback(mockMessage)
          }, 10000) // Simulate a message every 10 seconds
        }
      },
      emit: (event: string, data: any) => {
        console.log(`Emitting event: ${event}`, data)
        // Simulate sending messages
        return true
      },
      disconnect: () => {
        console.log('Disconnecting from Socket.IO')
        this.isConnected = false
      }
    } as any

    this.isConnected = true
    console.log('Connected to Socket.IO (simulated)')
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
    }
  }

  onNewMessage(callback: (message: Message) => void) {
    if (this.socket) {
      this.socket.on('new-message', callback)
    }
  }

  onConversationUpdate(callback: (conversation: any) => void) {
    if (this.socket) {
      this.socket.on('conversation-update', callback)
    }
  }

  sendMessage(conversationId: string, content: string, senderType: 'customer' | 'admin') {
    if (this.socket) {
      this.socket.emit('send-message', {
        conversationId,
        content,
        senderType,
        timestamp: new Date().toISOString()
      })
    }
  }

  joinConversation(conversationId: string) {
    if (this.socket) {
      this.socket.emit('join-conversation', { conversationId })
    }
  }

  leaveConversation(conversationId: string) {
    if (this.socket) {
      this.socket.emit('leave-conversation', { conversationId })
    }
  }

  getConnectionStatus() {
    return this.isConnected
  }
}

export const socketService = new SocketService()