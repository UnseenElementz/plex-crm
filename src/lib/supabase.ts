import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : (null as any)

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string
          status: 'active' | 'closed' | 'waiting'
          created_at: string
          updated_at: string
          closed_at: string | null
          customer_ip: string | null
          metadata: Record<string, any>
        }
        Insert: {
          id?: string
          status?: 'active' | 'closed' | 'waiting'
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          customer_ip?: string | null
          metadata?: Record<string, any>
        }
        Update: {
          id?: string
          status?: 'active' | 'closed' | 'waiting'
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          customer_ip?: string | null
          metadata?: Record<string, any>
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          sender_type: 'customer' | 'admin'
          content: string
          timestamp: string
          is_read: boolean
          metadata: Record<string, any>
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          sender_type: 'customer' | 'admin'
          content: string
          timestamp?: string
          is_read?: boolean
          metadata?: Record<string, any>
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          sender_type?: 'customer' | 'admin'
          content?: string
          timestamp?: string
          is_read?: boolean
          metadata?: Record<string, any>
        }
      }
      participants: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          user_type: 'customer' | 'admin'
          joined_at: string
          last_seen: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          user_type: 'customer' | 'admin'
          joined_at?: string
          last_seen?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          user_type?: 'customer' | 'admin'
          joined_at?: string
          last_seen?: string
        }
      }
      attachments: {
        Row: {
          id: string
          message_id: string
          file_url: string
          file_type: string
          file_size: number
          file_name: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          message_id: string
          file_url: string
          file_type: string
          file_size: number
          file_name: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          file_url?: string
          file_type?: string
          file_size?: number
          file_name?: string
          uploaded_at?: string
        }
      }
    }
  }
}
