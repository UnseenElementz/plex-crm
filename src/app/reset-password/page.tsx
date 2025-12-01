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
  const [isValidSession, setIsValidSession] = useState(false)
  const router = useRouter()

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const s = getSupabase()
      if (!s) {
        setError('Supabase not configured')
        return
      }
      
      // Check if there's an access token in the URL
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      
      if (accessToken) {
        setIsValidSession(true)
      } else {
        setError('Invalid or expired reset link. Please request a new password reset.')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to validate reset link')
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
      // Get the access token from the URL hash
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      
      if (!accessToken) {
        setError('Invalid reset link. Please request a new password reset.')
        setLoading(false)
        return
      }
      
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, accessToken })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to update password')
      } else {
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

  if (!isValidSession && !error) {
    return (
      <main className="p-6 flex items-center justify-center min-h-[80vh]">
        <div className="glass p-6 rounded-2xl w-full max-w-md text-center">
          <div className="text-slate-400">Validating reset link...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="p-6 flex items-center justify-center min-h-[80vh]">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-bold gradient-text mb-2 block">
            Streamz R Us
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
