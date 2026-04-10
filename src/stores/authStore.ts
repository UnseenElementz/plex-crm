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

function getAdminAliasEmail() {
  return String(process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local').trim().toLowerCase()
}

function mapAdminUser(user: {
  id: string
  email?: string | null
  created_at: string
  user_metadata?: Record<string, any>
}): AdminUser {
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || 'Admin User',
    permissions: {},
    created_at: user.created_at,
  }
}

async function resolveAdminUser(user: {
  id: string
  email?: string | null
  created_at: string
  user_metadata?: Record<string, any>
}) {
  const email = String(user.email || '').trim().toLowerCase()
  if (!email) return null
  if (email === getAdminAliasEmail()) return mapAdminUser(user)

  const supabase = getSupabase()
  if (!supabase) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('email', email)
    .maybeSingle()

  if (error || profile?.role !== 'admin') return null
  return mapAdminUser(user)
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
      const admin = await resolveAdminUser(u)
      if (!admin) {
        await s.auth.signOut().catch(() => null)
        throw new Error('Admin access required')
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
      if (!s) {
        try{
          const r = await fetch('/api/admin/auth/session')
          if (r.ok){ set({ user: { id:'local', email:'', name:'Admin User', permissions:{}, created_at: new Date().toISOString() }, isAuthenticated: true, isLoading: false }); return }
        } catch{}
        set({ user: null, isAuthenticated: false, isLoading: false }); return
      }
      const { data } = await s.auth.getUser()
      const u = data.user
      if (u) {
        const admin = await resolveAdminUser(u)
        if (admin) {
          set({ user: admin, isAuthenticated: true, isLoading: false, error: null })
        } else {
          set({ user: null, isAuthenticated: false, isLoading: false, error: null })
        }
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false, error: (error as Error).message })
    }
  }
}))
