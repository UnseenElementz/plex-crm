"use client"
import Script from 'next/script'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function PayPalButton({ amount, currency = 'GBP', customerEmail, plan, streams, onSuccess }: { amount: number; currency?: string; customerEmail?: string; plan?: 'monthly'|'yearly'|'two_year'|'three_year'; streams?: number; onSuccess?: (orderId: string) => void }){
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const renderedRef = useRef(false)
  const lastOrderIdRef = useRef<string | null>(null)
  const isWebView = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '')

  const createOrder = useCallback(async ()=>{
    const res = await fetch('/api/paypal/create-order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ amount, currency, plan, streams }) })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { throw new Error('Invalid response from payment server') }
    if (!res.ok) throw new Error(data?.error || 'Failed to create order')
    if (!data.id) throw new Error('Invalid order ID received')
    lastOrderIdRef.current = data.id
    return data.id
  }, [amount, currency, plan, streams])

  const captureOrder = useCallback(async (orderId: string)=>{
    const res = await fetch('/api/paypal/capture-order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ orderId, customerEmail }) })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { throw new Error('Invalid response from payment server') }
    if (!res.ok) throw new Error(data?.error || 'Failed to capture order')
    onSuccess?.(orderId)
    return data
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
      if (!paypal.Buttons) {
        throw new Error('PayPal SDK not loaded')
      }
      paypal.Buttons({
        style: { label: 'checkout', layout: 'vertical', color: 'gold', shape: 'rect', height: 48 },
        createOrder: async ()=> {
          try {
            return await createOrder()
          } catch (error: any) {
            setError(error?.message || 'Failed to create order')
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
      
      {isConfigured && (
        <>
          <Script 
            src={`https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=buttons&intent=CAPTURE&disable-funding=card,venmo`}
            strategy="lazyOnload"
            crossOrigin="anonymous"
            onLoad={()=>setReady(true)} 
            onError={async ()=>{
              setError('Failed to load PayPal SDK')
              try {
                const s1 = document.createElement('script')
                s1.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=buttons&intent=CAPTURE&disable-funding=card,venmo`
                s1.async = true
                s1.crossOrigin = 'anonymous'
                s1.onload = ()=> setReady(true)
                s1.onerror = ()=>{ /* keep fallback to manual link only */ }
                document.head.appendChild(s1)
              } catch {}
              try {
                const id = await createOrder()
                lastOrderIdRef.current = id
                setMessage('PayPal fallback link is ready')
              } catch {}
            }} 
          />
          {!ready && (
            <div className="w-full flex justify-center mt-2">
              <div className="h-12 w-64 rounded-lg bg-amber-500/20 animate-pulse" />
            </div>
          )}
          <div className="w-full flex justify-center mt-2">
            <div id="paypal-button-container" className="min-h-12" />
          </div>
          {lastOrderIdRef.current && (
            <div className="w-full flex justify-center">
              <a className="text-xs text-brand underline mt-2 inline-block" href={`https://www.paypal.com/checkoutnow?token=${lastOrderIdRef.current}`} target="_blank" rel="noreferrer">
                Continue checkout (fallback link)
              </a>
            </div>
          )}
        </>
      )}
      {!isConfigured && (
        <div className="glass p-4 rounded-lg border border-slate-700/40 bg-slate-900/30 text-slate-300 text-xs">
          PayPal not ready. Configure real sandbox credentials to test payments.
        </div>
      )}
      {isConfigured && error && (
        <div className="mt-2 w-full flex justify-center">
          <button
            className="px-5 py-2 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition"
            onClick={async ()=>{
              try{
                const id = await createOrder()
                lastOrderIdRef.current = id
                window.open(`https://www.paypal.com/checkoutnow?token=${id}`, '_blank')
              }catch(e:any){ setError(e?.message || 'Fallback checkout failed') }
            }}
          >
            PayPal Checkout
          </button>
        </div>
      )}
      {/* merchant email note intentionally hidden to keep only the big button */}
      {message && <div className="text-slate-300 text-xs mt-2 text-center">{message}</div>}
      {error && <div className="text-rose-400 text-xs mt-1 text-center">{error}</div>}
    </div>
  )
}
