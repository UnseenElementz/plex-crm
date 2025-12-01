"use client"
import Script from 'next/script'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function PayPalButton({ amount, currency = 'GBP', customerEmail, onSuccess }: { amount: number; currency?: string; customerEmail?: string; onSuccess?: (orderId: string) => void }){
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const renderedRef = useRef(false)
  const isWebView = typeof navigator !== 'undefined' && /Electron|Trae/i.test(navigator.userAgent || '')

  const createOrder = useCallback(async ()=>{
    try {
      const res = await fetch('/api/paypal/create-order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ amount, currency }) })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Invalid response from payment server')
      }
      if (!res.ok) throw new Error(data?.error || 'Failed to create order')
      if (!data.id) throw new Error('Invalid order ID received')
      return data.id
    } catch (error: any) {
      console.error('Create order error:', error)
      throw error
    }
  }, [amount, currency])

  const captureOrder = useCallback(async (orderId: string)=>{
    try {
      const res = await fetch('/api/paypal/capture-order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orderId, customerEmail }) })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Invalid response from payment server')
      }
      if (!res.ok) throw new Error(data?.error || 'Failed to capture order')
      onSuccess?.(orderId)
      return data
    } catch (error: any) {
      console.error('Capture order error:', error)
      throw error
    }
  }, [onSuccess, customerEmail])

  const clientId = useMemo(()=>process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'sb', [])
  const merchantEmail = useMemo(()=>process.env.NEXT_PUBLIC_PAYPAL_MERCHANT_EMAIL || '', [])

  // Check if PayPal is properly configured
  const isConfigured = useMemo(() => {
    const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ''
    return !!id && id !== 'sb'
  }, [])

  useEffect(()=>{
    if (!ready || renderedRef.current) return
    const paypal = (window as any).paypal
    if (!paypal) {
      setError('PayPal SDK not loaded')
      return
    }
    try{
      paypal.Buttons({
        createOrder: async ()=> {
          try {
            return await createOrder()
          } catch (error: any) {
            console.error('PayPal create order error:', error)
            setError(error.message || 'Failed to create order')
            throw error
          }
        },
        onApprove: async (data: any)=> {
          setMessage('Capturing payment...')
          try {
            await captureOrder(data.orderID)
            setMessage('Payment captured successfully')
            setError('')
          } catch(e: any){
            setError(e?.message || 'Payment capture failed')
            setMessage('')
          }
        },
        onError: (err: any)=> { 
          console.error('PayPal button error:', err)
          setError('PayPal error: ' + (err?.message || 'Unknown error occurred'))
          setMessage('') 
        },
        onCancel: ()=> { 
          setMessage('Payment cancelled')
          setError('') 
        }
      }).render('#paypal-button-container')
      renderedRef.current = true
    } catch(e: any){ 
      console.error('PayPal render error:', e)
      setError(e?.message || 'PayPal failed to render') 
    }
  }, [ready, createOrder, captureOrder])

  return (
    <div>
      {!isConfigured && (
        <div className="glass p-4 rounded-lg border border-amber-500/30 bg-amber-900/20">
          <div className="text-amber-400 text-sm font-medium mb-2">Payment System Notice</div>
          <div className="text-amber-300 text-xs">
            PayPal payment system is currently in demo mode. 
            {merchantEmail && <span>Payments would normally go to {merchantEmail}</span>}
          </div>
        </div>
      )}
      
      {!isWebView && isConfigured && (
        <>
          <Script src={`https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`} onReady={()=>setReady(true)} />
          <div id="paypal-button-container" />
        </>
      )}
      {(!isConfigured || isWebView) && (
        <div className="glass p-4 rounded-lg border border-slate-700/40 bg-slate-900/30 text-slate-300 text-xs">
          PayPal not ready. Configure real sandbox credentials to test payments.
        </div>
      )}
      {merchantEmail && isConfigured && <div className="text-[11px] text-slate-500 mt-1">Payments go to {merchantEmail}</div>}
      {message && <div className="text-slate-400 text-xs mt-2">{message}</div>}
      {error && <div className="text-rose-400 text-xs mt-1">{error}</div>}
    </div>
  )
}
