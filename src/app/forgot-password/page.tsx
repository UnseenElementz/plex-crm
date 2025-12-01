"use client"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

export default function ForgotPasswordPage(){
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleResetPassword(){
    setError('')
    setMessage('')
    setLoading(true)
    
    if (!email) {
      setError('Please enter your email address')
      setLoading(false)
      return
    }
    
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to send reset email')
      } else {
        setMessage(data.message || 'Password reset instructions have been sent to your email. Please check your inbox and follow the link to reset your password.')
      }
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && email) {
      handleResetPassword()
    }
  }

  return (
    <main className="p-6 flex items-center justify-center min-h-[80vh]">
      <div className="glass p-6 rounded-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-bold gradient-text mb-2 block">
            Streamz R Us
          </Link>
          <h2 className="text-xl font-semibold text-slate-200">Reset Password</h2>
          <p className="text-slate-400 text-sm mt-2">
            Enter your email address and we&apos;ll send you instructions to reset your password.
          </p>
        </div>
        
        <div className="space-y-4">
          <input 
            className="input" 
            placeholder="Enter your email address" 
            type="email"
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            onKeyPress={handleKeyPress}
          />
          
          {error && (
            <div className="bg-rose-500/20 border border-rose-500/30 rounded-lg p-3">
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
          )}
          
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
            {loading ? 'Sending...' : 'Send Reset Instructions'}
          </button>
          
          <div className="text-center">
            <Link 
              href="/login" 
              className="text-brand hover:text-cyan-300 transition-colors text-sm"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
