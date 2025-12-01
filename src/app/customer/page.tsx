"use client"
import { useEffect, useMemo, useState } from 'react'
import { calculatePrice, calculateNextDue, getTransactionFee, Plan } from '@/lib/pricing'
import dynamic from 'next/dynamic'
const PayPalButton = dynamic(() => import('@/components/PayPalButton'), { ssr: false })
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'
const ChatWidget = dynamic(() => import('@/components/chat/ChatWidget'), { ssr: false })

// Plan type imported from pricing includes 'three_year'

type Customer = {
  id: string
  fullName: string
  email: string
  plan: Plan
  streams: number
  startDate: string
  nextDueDate: string
  notes?: string
}

export default function CustomerPortal() {
  const [saving, setSaving] = useState(false)
  const [authState, setAuthState] = useState<'checking'|'unauth'|'ready'>('checking')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [paymentLock, setPaymentLock] = useState(false)
  const [customer, setCustomer] = useState<Customer>({
    id: 'demo',
    fullName: 'Demo User',
    email: 'demo@example.com',
    plan: 'monthly',
    streams: 1,
    startDate: new Date().toISOString(),
    nextDueDate: calculateNextDue('monthly', new Date()).toISOString(),
    notes: ''
  })

  useEffect(()=>{ 
    (async()=>{ 
      try{
        const res = await fetch('/api/admin/settings')
        if (res.ok){ const data = await res.json(); setPaymentLock(Boolean(data?.payment_lock)) }
      } catch{}
      if (typeof window !== 'undefined' && sessionStorage.getItem('customerDemo') === 'true') {
        const raw = localStorage.getItem('customerProfile')
        if (raw) {
          const p = JSON.parse(raw)
          setCustomer(c=>({
            ...c,
            fullName: p.fullName || c.fullName,
            email: p.email || c.email,
            plan: p.plan || c.plan,
            streams: p.streams || c.streams,
            startDate: new Date().toISOString(),
            nextDueDate: p.nextDueDate || calculateNextDue(p.plan || 'monthly', new Date()).toISOString(),
          }))
        }
        setAuthState('ready')
        return
      }
      const s = getSupabase(); 
      if (!s) { setAuthState('unauth'); return }
      const { data } = await s.auth.getUser(); 
      if (!data.user) { setAuthState('unauth'); return }
      try {
        const userEmail = data.user.email as string
        const { data: customerData, error } = await s
          .from('customers')
          .select('*')
          .eq('email', userEmail)
          .single();

        if (!error && customerData) {
          setCustomer({
            id: customerData.id,
            fullName: customerData.name,
            email: customerData.email,
            plan: customerData.subscription_type || 'monthly',
            streams: customerData.streams || 1,
            startDate: customerData.start_date || new Date().toISOString(),
            nextDueDate: customerData.next_payment_date || calculateNextDue(customerData.subscription_type || 'monthly', new Date()).toISOString(),
            notes: customerData.notes || ''
          })
        setHasSubscription(true)
        setAuthState('ready')
        try{
          const res = await fetch('/api/admin/settings')
          if (res.ok){ const data = await res.json(); setPaymentLock(Boolean(data?.payment_lock)) }
        } catch{}
        return
      }

        // Fallback: no customer record yet, build a default view from profile
        if (error && (error.code === 'PGRST116' || /no rows/i.test(error.message || ''))) {
          const { data: profile } = await s
            .from('profiles')
            .select('full_name')
            .eq('email', userEmail)
            .single()
          setCustomer(c => ({
            ...c,
            fullName: profile?.full_name || c.fullName,
            email: userEmail,
            plan: c.plan,
            streams: c.streams,
            startDate: new Date().toISOString(),
            nextDueDate: calculateNextDue(c.plan, new Date()).toISOString(),
          }))
        setHasSubscription(false)
        setAuthState('ready')
        try{
          const res = await fetch('/api/admin/settings')
          if (res.ok){ const data = await res.json(); setPaymentLock(Boolean(data?.payment_lock)) }
        } catch{}
        return
        }

        setAuthState('unauth')
      } catch { setAuthState('unauth') }
    })(); 
  }, [])

  const price = useMemo(() => calculatePrice(customer.plan, customer.streams), [customer])
  const status = useMemo(() => {
    if (!hasSubscription) return 'Inactive'
    const inactive = (customer as any).subscription_status === 'inactive'
    if (inactive) return 'Inactive'
    const due = new Date(customer.nextDueDate)
    const now = new Date()
    if (isNaN(due.getTime())) return 'Unknown'
    return now > due ? 'Overdue' : 'Active'
  }, [customer, hasSubscription])

  const canPay = useMemo(()=>{
    if (!paymentLock) return true
    if (!hasSubscription) return false
    const due = new Date(customer.nextDueDate)
    const now = new Date()
    const beforeDue = !isNaN(due.getTime()) ? now < due : false
    return status === 'Active' && beforeDue
  }, [paymentLock, hasSubscription, customer.nextDueDate, status])

  useEffect(() => {
    setCustomer(c => {
      if (!c.nextDueDate) {
        return { ...c, nextDueDate: calculateNextDue(c.plan, new Date(c.startDate)).toISOString() }
      }
      return c
    })
  }, [])

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      // Simulate saving to backend
      await new Promise(resolve => setTimeout(resolve, 1000))
      alert('Changes saved successfully!')
    } catch (error) {
      console.error('Error saving changes:', error)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (authState === 'unauth') {
    return (
      <main className="p-6 flex items-center justify-center min-h-[80vh]">
        <div className="glass p-6 rounded-2xl w-full max-w-md text-center">
          <div className="text-2xl font-semibold mb-2">Customer Portal</div>
          <div className="text-slate-400 mb-4">Please sign in to access your subscription</div>
          <a href="/customer/login" className="btn" data-no-prefetch>Go to Customer Login</a>
        </div>
        {paymentLock && (
          <div className="glass p-6 rounded-2xl w-full max-w-2xl mt-6 border border-cyan-500/30">
            <div className="text-slate-200 font-semibold mb-2">Notice</div>
            <p className="text-slate-300 text-sm mb-2">To keep the server running at a professional and stable level, we are not accepting new customers at the moment.</p>
            <p className="text-slate-300 text-sm mb-2">If you are interested, please click the chat icon in the bottom-right corner and send us a message with your details and email address. When new slots become available, we will contact you right away.</p>
            <p className="text-slate-300 text-sm">Thank you,</p>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold">Customer Portal</h2>
        <p className="text-slate-300">Manage your Plex subscription</p>
        <div className="mt-2">
          <a href="/customer/service-updates" className="text-brand underline" data-no-prefetch>Service Updates</a>
        </div>
        {paymentLock && !canPay && (
          <div className="glass p-4 rounded-lg mt-4 border border-cyan-500/30">
            <p className="text-slate-300 text-sm mb-2">To keep the server running at a professional and stable level, we are not accepting new customers at the moment.</p>
            <p className="text-slate-300 text-sm mb-2">If you are interested, please click the chat icon in the bottom-right corner and send us a message with your details and email address. When new slots become available, we will contact you right away.</p>
            <p className="text-slate-300 text-sm">Thank you,</p>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="card">
            <h3 className="card-title">Subscription</h3>
            <div className="space-y-3">
              <label className="label">Plan</label>
              <div className="flex gap-3">
                <button className={`btn ${customer.plan==='monthly'?'active':''}`} onClick={()=>setCustomer(c=>({
                  ...c,
                  plan:'monthly',
                  nextDueDate: calculateNextDue('monthly', new Date(c.startDate)).toISOString()
                }))}>Monthly</button>
                <button className={`btn ${customer.plan==='yearly'?'active':''}`} onClick={()=>setCustomer(c=>({
                  ...c,
                  plan:'yearly',
                  nextDueDate: calculateNextDue('yearly', new Date(c.startDate)).toISOString()
                }))}>Yearly</button>
                <button className={`btn ${customer.plan==='three_year'?'active':''}`} onClick={()=>setCustomer(c=>({
                  ...c,
                  plan:'three_year',
                  nextDueDate: calculateNextDue('three_year', new Date(c.startDate)).toISOString()
                }))}>3 Years</button>
              </div>
              <label className="label">Streams</label>
              <input type="number" min={1} value={customer.streams} onChange={e=>setCustomer(c=>({...c,streams:parseInt(e.target.value||'1',10)}))} className="input" />
              <div className="mt-2 text-slate-200">Total price: £{price.toFixed(2)}</div>
              <div className="text-xs text-slate-400">£{getTransactionFee(customer.plan)} transaction fee applies</div>
              <div className="mt-1 text-slate-300">Next due: {format(new Date(customer.nextDueDate), 'PPP')}</div>
              <div className={`mt-1 tag ${status.toLowerCase()}`}>Status: {status}</div>
            </div>
            <div className="mt-4 space-y-2" suppressHydrationWarning>
              {canPay ? (
                <PayPalButton amount={price} customerEmail={customer.email} onSuccess={()=>{ }} />
              ) : (
                <div className="glass p-4 rounded-lg border border-amber-500/30 bg-amber-900/20 text-amber-300 text-sm">
                  Payments are temporarily locked. Active subscribers can extend before their due date.
                </div>
              )}
              <div className="flex gap-3">
                <button 
                  className={`btn-outline ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={handleSaveChanges}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <h3 className="card-title">Account</h3>
            <div className="space-y-3">
              <label className="label">Full name</label>
              <input className="input" value={customer.fullName} onChange={e=>setCustomer(c=>({...c,fullName:e.target.value}))} />
              <label className="label">Email</label>
              <input className="input" value={customer.email} onChange={e=>setCustomer(c=>({...c,email:e.target.value}))} />
              <label className="label">Notes</label>
              <textarea className="input" value={customer.notes} onChange={e=>setCustomer(c=>({...c,notes:e.target.value}))} />
            </div>
          </div>
        </div>
        <div className="mt-6 glass p-4 rounded-lg border border-rose-500/30 bg-rose-900/10">
          <div className="text-rose-300 text-sm font-semibold mb-2">DISCLAIMER:</div>
          <p className="text-slate-300 text-xs mb-2">If you purchase 1 stream, it may only be used on one device at a time. Using multiple devices concurrently is strictly prohibited. We have a zero-tolerance policy for this, and violations will result in immediate disconnection with no refund.</p>
          <p className="text-slate-300 text-xs">If you need to use multiple devices, please purchase additional streams to avoid a ban.</p>
        </div>
      </div>
      <ChatWidget position="bottom-right" />
    </main>
  )
}
