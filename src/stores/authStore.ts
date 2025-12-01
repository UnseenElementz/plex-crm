import { create } from 'zustand'
import { getSupabase } from '@/lib/supabaseClient'

export interface AdminUser {
  id: string
  email: string
  name: string
  permissions: Record<string, any>
  created_at: string
}

export interface AuthState {
  user: AdminUser | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean

  // Actions
  setUser: (user: AdminUser | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // API calls
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const s = getSupabase()
      if (!s) throw new Error('Supabase not configured')
      const { data, error } = await s.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      const u = data.user
      if (!u) throw new Error('No user returned')
      const admin: AdminUser = {
        id: u.id,
        email: u.email || email,
        name: u.user_metadata?.name || 'Admin User',
        permissions: {},
        created_at: u.created_at
      }
      set({ user: admin, isAuthenticated: true, isLoading: false })
      return true
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      return false
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null })
    try {
      const s = getSupabase()
      if (s) await s.auth.signOut()
      set({ user: null, isAuthenticated: false, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      const s = getSupabase()
      if (!s) { set({ user: null, isAuthenticated: false, isLoading: false }); return }
      const { data } = await s.auth.getUser()
      const u = data.user
      if (u) {
        const admin: AdminUser = {
          id: u.id,
          email: u.email || '',
          name: u.user_metadata?.name || 'Admin User',
          permissions: {},
          created_at: u.created_at
        }
        set({ user: admin, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false, error: (error as Error).message })
    }
  }
}))
