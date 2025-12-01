import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rpbmhfnreolhtvsngusy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYm1oZm5yZW9saHR2c25ndXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NzY0NDIsImV4cCI6MjA3OTU1MjQ0Mn0.Ra7QQcillkDkjuytKe_ZZgavOI92EI6IEVQIj1d_nVc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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