"use client"

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { calculateNextDue, calculatePrice, getTransactionFee, Plan } from '@/lib/pricing'
import { getSupabase } from '@/lib/supabaseClient'

const PayPalButton = dynamic(() => import('@/components/PayPalButton'), { ssr: false })
const ChatWidget = dynamic(() => import('@/components/chat/ChatWidget'), { ssr: false })

type Customer = {
  id: string
  fullName: string
  email: string
  plan: Plan
  streams: number
  startDate: string
  nextDueDate: string
  notes?: string
  downloads?: boolean
}

const planCards: Array<{ id: Plan; title: string; subtitle: string }> = [
  { id: 'yearly', title: 'Full Package', subtitle: 'The complete premium library experience.' },
  { id: 'movies_only', title: 'Movies Only', subtitle: 'Film-first access with family favourites included.' },
  { id: 'tv_only', title: 'TV Shows Only', subtitle: 'Series-focused access with broad genre coverage.' },
]

export default function CustomerPortal() {
  const [saving, setSaving] = useState(false)
  const [authState, setAuthState] = useState<'checking' | 'unauth' | 'ready'>('checking')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [paymentLock, setPaymentLock] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [updateModal, setUpdateModal] = useState<{ id?: string; title: string; content: string } | null>(null)
  const [customer, setCustomer] = useState<Customer>({
    id: 'demo',
    fullName: 'Demo User',
    email: 'demo@example.com',
    plan: 'monthly',
    streams: 1,
    startDate: new Date().toISOString(),
    nextDueDate: calculateNextDue('monthly', new Date()).toISOString(),
    notes: '',
  })

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          setPaymentLock(Boolean(data?.payment_lock))
          setPricingConfig(data)
        }
      } catch {}

      if (typeof window !== 'undefined' && sessionStorage.getItem('customerDemo') === 'true') {
        const raw = localStorage.getItem('customerProfile')
        if (raw) {
          const p = JSON.parse(raw)
          setCustomer((c) => ({
            ...c,
            fullName: p.fullName || c.fullName,
            email: p.email || c.email,
            plan: p.plan || c.plan,
            streams: Math.min(5, p.streams || c.streams),
            startDate: new Date().toISOString(),
            nextDueDate: p.nextDueDate || calculateNextDue(p.plan || 'monthly', new Date()).toISOString(),
          }))
        }
        setAuthState('ready')
        return
      }

      const s = getSupabase()
      if (!s) {
        setAuthState('unauth')
        return
      }

      const { data } = await s.auth.getUser()
      if (!data.user) {
        setAuthState('unauth')
        return
      }

      try {
        const res = await fetch('/api/admin/service-updates', { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json().catch(() => ({}))
          const updates: any[] = j?.updates || []
          if (updates.length) {
            const latest = updates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
            const key = `svc_updates_seen:${data.user.email}`
            const seen = localStorage.getItem(key)
            const latestId = latest.id || latest.created_at
            if (!seen || seen !== String(latestId)) {
              setUpdateModal({ id: latest.id, title: latest.title, content: latest.content })
            }
          }
        }
      } catch {}

      try {
        const userEmail = data.user.email as string
        const { data: customerData, error } = await s.from('customers').select('*').eq('email', userEmail).single()

        if (!error && customerData) {
          setCustomer({
            id: customerData.id,
            fullName: customerData.name,
            email: customerData.email,
            plan: customerData.subscription_type || 'monthly',
            streams: Math.min(5, customerData.streams || 1),
            startDate: customerData.start_date || new Date().toISOString(),
            nextDueDate: customerData.next_payment_date || calculateNextDue(customerData.subscription_type || 'monthly', new Date()).toISOString(),
            notes: customerData.notes || '',
            downloads: (customerData.notes || '').includes('Downloads: Yes'),
          })
          setHasSubscription(true)
          setAuthState('ready')
          try {
            await fetch('/api/security/ip-log', { method: 'POST' })
          } catch {}
          return
        }

        if (error && (error.code === 'PGRST116' || /no rows/i.test(error.message || ''))) {
          const { data: profile } = await s.from('profiles').select('full_name').eq('email', userEmail).single()
          setCustomer((c) => ({
            ...c,
            fullName: profile?.full_name || c.fullName,
            email: userEmail,
            startDate: new Date().toISOString(),
            nextDueDate: calculateNextDue(c.plan, new Date()).toISOString(),
          }))
          setHasSubscription(false)
          setAuthState('ready')
          return
        }

        setAuthState('unauth')
      } catch {
        setAuthState('unauth')
      }
    })()
  }, [])

  const price = useMemo(() => calculatePrice(customer.plan, customer.streams, pricingConfig, customer.downloads), [customer, pricingConfig])
  const status = useMemo(() => {
    if (!hasSubscription) return 'Inactive'
    const due = new Date(customer.nextDueDate)
    if (isNaN(due.getTime())) return 'Unknown'
    return new Date() > due ? 'Overdue' : 'Active'
  }, [customer.nextDueDate, hasSubscription])

  const canPay = useMemo(() => {
    if (!paymentLock) return true
    if (!hasSubscription) return false
    const due = new Date(customer.nextDueDate)
    const beforeDue = !isNaN(due.getTime()) ? new Date() < due : false
    return status === 'Active' && beforeDue
  }, [customer.nextDueDate, hasSubscription, paymentLock, status])

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      const payload = {
        full_name: customer.fullName,
        email: customer.email,
        plan: customer.plan,
        streams: customer.streams,
        downloads: customer.downloads,
        notes: customer.notes,
        next_due_date: customer.nextDueDate,
      }

      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      alert('Changes saved successfully!')
    } catch (error: any) {
      alert(error.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  function acknowledgeUpdate() {
    try {
      if (updateModal) {
        const key = `svc_updates_seen:${customer.email || 'anon'}`
        localStorage.setItem(key, String(updateModal.id || updateModal.title))
      }
    } catch {}
    setUpdateModal(null)
  }

  if (authState === 'unauth') {
    return (
      <main className="page-section py-12">
        <div className="panel mx-auto max-w-3xl p-8 text-center">
          <div className="eyebrow mx-auto">Customer Access</div>
          <h1 className="mt-5 text-4xl font-semibold text-white">Sign in to manage your subscription</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Access your plan details, payment tools, service announcements, and direct support in one place.
          </p>
          <a href="/customer/login" className="btn mt-8" data-no-prefetch>
            Go to Customer Login
          </a>
          {paymentLock ? (
            <div className="mt-8 rounded-[28px] border border-cyan-400/15 bg-cyan-400/8 p-5 text-left text-sm text-slate-300">
              We are not accepting new customers right now. Use the live chat button after logging in to leave your details and we will
              contact you when availability opens up.
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <main className="page-section py-8">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="panel-strong overflow-hidden p-7">
            <div className="eyebrow">Member Access</div>
            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-semibold text-white">Manage your hosted service in one place.</h1>
                <p className="mt-3 max-w-2xl text-slate-400">
                  Billing, updates, and support for your premium video hosting account.
                </p>
              </div>
              <div className={`tag ${status.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{status}</div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Plan</div>
                <div className="mt-2 text-xl font-semibold text-white">{customer.plan.replace('_', ' ')}</div>
              </div>
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Streams</div>
                <div className="mt-2 text-xl font-semibold text-white">{customer.streams}</div>
              </div>
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Next Due</div>
                <div className="mt-2 text-xl font-semibold text-white">{format(new Date(customer.nextDueDate), 'dd/MM/yyyy')}</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/customer/service-updates" className="cta-outline" data-no-prefetch>
                Service Updates
              </a>
              <a href="/customer/recommendations" className="cta-btn" data-no-prefetch>
                Requests & Issues
              </a>
            </div>
          </div>

          <div className="card-solid p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="card-title">Choose your package</h2>
              <div className="text-sm text-slate-400">Premium access, cleaner pricing</div>
            </div>
            <div className="mt-5 grid gap-3">
              {planCards.map((plan) => (
                <button
                  key={plan.id}
                  className={`rounded-[24px] border p-4 text-left ${
                    customer.plan === plan.id ? 'border-cyan-400/35 bg-cyan-400/10' : 'border-white/8 bg-white/[0.03]'
                  }`}
                  onClick={() =>
                    setCustomer((current) => ({
                      ...current,
                      plan: plan.id,
                      nextDueDate: calculateNextDue(plan.id, new Date(current.startDate)).toISOString(),
                    }))
                  }
                >
                  <div className="text-base font-semibold text-white">{plan.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{plan.subtitle}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-[24px] border border-cyan-400/12 bg-cyan-400/8 p-4 text-sm text-slate-300">
              Movies Only and TV Shows Only packages still include kids content and other shared genres such as sports.
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label">Streams</label>
                <select
                  className="input"
                  value={customer.streams}
                  onChange={(e) =>
                    setCustomer((current) => ({
                      ...current,
                      streams: Math.min(5, Math.max(1, parseInt(e.target.value || '1', 10))),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </div>

              <div className="panel p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={customer.downloads || false}
                    onChange={(e) => setCustomer((current) => ({ ...current, downloads: e.target.checked }))}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">Add downloads</div>
                    <div className="text-xs text-slate-400">Enable downloads for an extra GBP 20.00.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-solid p-6">
            <h2 className="card-title">Billing overview</h2>
            <div className="mt-5 rounded-[28px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,0.3))] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Current total</div>
              <div className="mt-2 text-4xl font-semibold text-white">GBP {price.toFixed(2)}</div>
              <div className="mt-2 text-sm text-slate-400">Transaction fee: GBP {getTransactionFee(customer.plan)}</div>
              <div className="mt-2 text-sm text-slate-400">Next due date: {format(new Date(customer.nextDueDate), 'dd/MM/yyyy')}</div>
            </div>

            <div className="mt-5 space-y-3">
              {canPay ? (
                <PayPalButton
                  amount={price}
                  plan={customer.plan}
                  streams={customer.streams}
                  downloads={customer.downloads}
                  customerEmail={customer.email}
                  onSuccess={() => {}}
                />
              ) : (
                <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Payments are temporarily locked. Active subscribers can extend before their due date.
                </div>
              )}
              <button className={`btn-outline w-full ${saving ? 'opacity-50' : ''}`} onClick={handleSaveChanges} disabled={saving}>
                {saving ? 'Saving...' : 'Save account changes'}
              </button>
            </div>
          </div>

          <div className="card-solid p-6">
            <h2 className="card-title">Account details</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={customer.fullName} onChange={(e) => setCustomer((current) => ({ ...current, fullName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" value={customer.email} onChange={(e) => setCustomer((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[120px]" value={customer.notes} onChange={(e) => setCustomer((current) => ({ ...current, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-rose-400/15 bg-rose-500/8 p-5 text-sm text-slate-300">
            If you purchase one stream, it may only be used on one device at a time. Multiple concurrent devices without the matching
            stream count can lead to removal without refund.
          </div>

          {paymentLock && !canPay ? (
            <div className="rounded-[28px] border border-cyan-400/15 bg-cyan-500/8 p-5 text-sm text-slate-300">
              New customer slots are temporarily paused so service quality stays high. Use live chat to leave your details and we will
              contact you when capacity opens.
            </div>
          ) : null}
        </div>
      </section>

      {updateModal ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="glass-strong w-full max-w-2xl rounded-[32px] p-6 shadow-[0_30px_120px_rgba(8,145,178,0.22)]">
            <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-200">
              New Service Update
            </div>
            <div className="mt-4 text-xl font-semibold text-white">{updateModal.title || 'Service Announcement'}</div>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-2">
              {updateModal.content
                .replace(/\\n/g, '\n')
                .replace(/\r\n/g, '\n')
                .split(/\n{2,}/)
                .map((chunk) => chunk.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index} className="text-sm leading-7 text-slate-300">
                    {paragraph}
                  </p>
                ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <a href="/customer/service-updates" className="btn-xs-outline" onClick={acknowledgeUpdate} data-no-prefetch>
                Update history
              </a>
              <button className="btn-xs" onClick={acknowledgeUpdate}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ChatWidget position="bottom-right" />
    </main>
  )
}
