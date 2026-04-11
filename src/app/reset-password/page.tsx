"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function ResetPasswordPage(){
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingLink, setCheckingLink] = useState(true)
  const [recoveryAccessToken, setRecoveryAccessToken] = useState('')
  const [recoveryRefreshToken, setRecoveryRefreshToken] = useState('')
  const [companyName, setCompanyName] = useState('Streamz R Us')
  const router = useRouter()

  useEffect(() => {
    void checkSession()
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data.company_name) setCompanyName(data.company_name)
        }
      } catch {}
    })()
  }, [])

  async function checkSession() {
    try {
      const s = getSupabase()
      if (!s) {
        setError('Supabase not configured')
        return
      }
      
      const query = new URLSearchParams(window.location.search)
      const hash = window.location.hash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const queryCode = query.get('code')
      const tokenHash = query.get('token_hash')
      const type = query.get('type')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (queryCode) {
        const { error: exchangeError, data } = await s.auth.exchangeCodeForSession(queryCode)
        if (exchangeError) {
          setError('Invalid or expired reset link. Please request a new password reset.')
          return
        }
        const sessionToken = data.session?.access_token || ''
        const nextRefreshToken = data.session?.refresh_token || ''
        if (sessionToken) setRecoveryAccessToken(sessionToken)
        if (nextRefreshToken) setRecoveryRefreshToken(nextRefreshToken)
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/reset-password')
        }
        return
      }

      if (tokenHash && type === 'recovery') {
        const { error: verifyError, data } = await s.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (verifyError) {
          setError('Invalid or expired reset link. Please request a new password reset.')
          return
        }
        const sessionToken = data.session?.access_token || ''
        const nextRefreshToken = data.session?.refresh_token || ''
        if (sessionToken) setRecoveryAccessToken(sessionToken)
        if (nextRefreshToken) setRecoveryRefreshToken(nextRefreshToken)
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/reset-password')
        }
        return
      }

      if (accessToken) {
        if (refreshToken) {
          const { error: sessionError } = await s.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) {
            setError('Invalid or expired reset link. Please request a new password reset.')
            return
          }
        }
        setRecoveryAccessToken(accessToken)
        if (refreshToken) setRecoveryRefreshToken(refreshToken)
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/reset-password')
        }
        return
      }

      const { data: sessionData } = await s.auth.getSession()
      const sessionToken = sessionData.session?.access_token || ''
      const nextRefreshToken = sessionData.session?.refresh_token || ''

      if (sessionToken) {
        setRecoveryAccessToken(sessionToken)
        if (nextRefreshToken) setRecoveryRefreshToken(nextRefreshToken)
      } else {
        setError('Invalid or expired reset link. Please request a new password reset.')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to validate reset link')
    } finally {
      setCheckingLink(false)
    }
  }

  async function handleResetPassword(){
    setError('')
    setMessage('')
    
    if (!password) {
      setError('Please enter a new password')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }
    
    setLoading(true)
    
    try {
      const s = getSupabase()
      if (!s) {
        setError('Supabase not configured')
        setLoading(false)
        return
      }

      let accessToken = recoveryAccessToken
      let refreshToken = recoveryRefreshToken
      const { data: sessionData } = await s.auth.getSession()
      if (sessionData.session?.access_token) {
        accessToken = sessionData.session.access_token
      }
      if (sessionData.session?.refresh_token) {
        refreshToken = sessionData.session.refresh_token
      }

      if (!accessToken) {
        setError('Invalid reset link. Please request a new password reset.')
        setLoading(false)
        return
      }

      if (!sessionData.session && refreshToken) {
        const { error: restoreError } = await s.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (restoreError) {
          setError(restoreError.message || 'Invalid reset link. Please request a new password reset.')
          setLoading(false)
          return
        }
      }

      const { error: updateError } = await s.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message || 'Failed to update password')
      } else {
        await s.auth.signOut().catch(() => null)
        setMessage('Password has been reset successfully! Redirecting to login...')
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      }
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && password && confirmPassword) {
      handleResetPassword()
    }
  }

  if (checkingLink) {
    return (
      <main className="page-section customer-auth-shell flex min-h-[calc(100svh-4.5rem)] items-start justify-center py-4 sm:min-h-[80vh] sm:items-center sm:py-8">
        <div className="glass customer-auth-card w-full max-w-md rounded-[24px] p-4 text-center sm:rounded-2xl sm:p-6">
          <div className="text-slate-400">Validating reset link...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-section customer-auth-shell flex min-h-[calc(100svh-4.5rem)] items-start justify-center py-4 sm:min-h-[80vh] sm:items-center sm:py-8">
      <div className="glass customer-auth-card w-full max-w-md rounded-[24px] p-4 sm:rounded-2xl sm:p-6">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-bold gradient-text mb-2 block">
            {companyName}
          </Link>
          <h2 className="text-xl font-semibold text-slate-200">Set New Password</h2>
          <p className="text-slate-400 text-sm mt-2">
            Enter your new password below.
          </p>
        </div>
        
        {error ? (
          <div className="space-y-4">
            <div className="bg-rose-500/20 border border-rose-500/30 rounded-lg p-3">
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
            <Link 
              href="/forgot-password" 
              className="btn w-full block text-center"
            >
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <input 
              className="input" 
              placeholder="New Password" 
              type="password"
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              onKeyPress={handleKeyPress}
            />
            
            <input 
              className="input" 
              placeholder="Confirm New Password" 
              type="password"
              value={confirmPassword} 
              onChange={e=>setConfirmPassword(e.target.value)} 
              onKeyPress={handleKeyPress}
            />
            
            {message && (
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3">
                <p className="text-emerald-300 text-sm">{message}</p>
              </div>
            )}
            
            <button 
              className="btn w-full" 
              onClick={handleResetPassword}
              disabled={loading}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            
            <div className="text-center">
              <Link 
                href="/login" 
                prefetch={false}
                className="text-brand hover:text-cyan-300 transition-colors text-sm"
              >
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
