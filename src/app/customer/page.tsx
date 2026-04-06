"use client"

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { getSupabase } from '@/lib/supabaseClient'
import { calculateNextDue, calculatePrice, getTransactionFee, Plan } from '@/lib/pricing'
import { getRenewalTotals, REFERRAL_CREDIT_CAP_GBP, REFERRAL_REWARD_GBP } from '@/lib/referrals'

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
  subscriptionStatus?: string
  notes?: string
  downloads?: boolean
  referralCode?: string
  referralCreditBalance?: number
  referralCreditEarnedTotal?: number
  referralCreditRedeemedTotal?: number
  successfulReferralsCount?: number
}

export default function CustomerPortal() {
  const [saving, setSaving] = useState(false)
  const [authState, setAuthState] = useState<'checking' | 'unauth' | 'ready'>('checking')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [paymentLock, setPaymentLock] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [updateModal, setUpdateModal] = useState<{ id?: string; title: string; content: string } | null>(null)
  const [copiedState, setCopiedState] = useState<'code' | 'link' | null>(null)
  const [origin, setOrigin] = useState('')
  const [customer, setCustomer] = useState<Customer>({
    id: 'demo',
    fullName: 'Demo User',
    email: 'demo@example.com',
    plan: 'monthly',
    streams: 1,
    startDate: new Date().toISOString(),
    nextDueDate: calculateNextDue('monthly', new Date()).toISOString(),
    subscriptionStatus: 'active',
    notes: '',
    referralCode: 'STREAMZDEMO',
    referralCreditBalance: 0,
    referralCreditEarnedTotal: 0,
    referralCreditRedeemedTotal: 0,
    successfulReferralsCount: 0,
  })

  useEffect(() => {
    ;(async () => {
      try {
        const settingsRes = await fetch('/api/admin/settings')
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          setPaymentLock(Boolean(settings?.payment_lock))
          setPricingConfig(settings)
        }
      } catch {}

      if (typeof window !== 'undefined' && sessionStorage.getItem('customerDemo') === 'true') {
        const raw = localStorage.getItem('customerProfile')
        if (raw) {
          const profile = JSON.parse(raw)
          setCustomer((current) => ({
            ...current,
            fullName: profile.fullName || current.fullName,
            email: profile.email || current.email,
            plan: profile.plan || current.plan,
            streams: Math.min(5, profile.streams || current.streams),
            startDate: new Date().toISOString(),
            nextDueDate: profile.nextDueDate || calculateNextDue(profile.plan || 'monthly', new Date()).toISOString(),
            referralCode: profile.referralCode || current.referralCode,
            referralCreditBalance: Number(profile.referralCreditBalance || current.referralCreditBalance || 0),
            referralCreditEarnedTotal: Number(profile.referralCreditEarnedTotal || current.referralCreditEarnedTotal || 0),
            referralCreditRedeemedTotal: Number(profile.referralCreditRedeemedTotal || current.referralCreditRedeemedTotal || 0),
            successfulReferralsCount: Number(profile.successfulReferralsCount || current.successfulReferralsCount || 0),
          }))
        }
        setAuthState('ready')
        return
      }

      const supabase = getSupabase()
      if (!supabase) {
        setAuthState('unauth')
        return
      }

      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        setAuthState('unauth')
        return
      }

      try {
        await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            email: data.user.email,
            fullName: data.user.user_metadata?.fullName || data.user.user_metadata?.full_name || '',
            plexUsername: data.user.user_metadata?.plexUsername || data.user.user_metadata?.plex_username || '',
          }),
        })
      } catch {}

      try {
        const serviceUpdateRes = await fetch('/api/admin/service-updates', { cache: 'no-store' })
        if (serviceUpdateRes.ok) {
          const payload = await serviceUpdateRes.json().catch(() => ({}))
          const updates: any[] = payload?.updates || []
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
        const { data: customerData, error } = await supabase
          .from('customers')
          .select('*')
          .eq('email', userEmail)
          .single()

        if (!error && customerData) {
          setCustomer({
            id: customerData.id,
            fullName: customerData.name,
            email: customerData.email,
            plan: customerData.subscription_type || 'monthly',
            streams: Math.min(5, customerData.streams || 1),
            startDate: customerData.start_date || new Date().toISOString(),
            nextDueDate: customerData.next_payment_date || calculateNextDue(customerData.subscription_type || 'monthly', new Date()).toISOString(),
            subscriptionStatus: customerData.subscription_status || 'active',
            notes: customerData.notes || '',
            downloads: String(customerData.notes || '').includes('Downloads: Yes'),
            referralCode: customerData.referral_code || '',
            referralCreditBalance: Number(customerData.referral_credit_balance || 0),
            referralCreditEarnedTotal: Number(customerData.referral_credit_earned_total || 0),
            referralCreditRedeemedTotal: Number(customerData.referral_credit_redeemed_total || 0),
            successfulReferralsCount: Number(customerData.successful_referrals_count || 0),
          })
          setHasSubscription(true)
          setAuthState('ready')
          try {
            await fetch('/api/security/ip-log', { method: 'POST' })
          } catch {}
          return
        }

        if (error && (error.code === 'PGRST116' || /no rows/i.test(error.message || ''))) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('email', userEmail)
            .single()

          setCustomer((current) => ({
            ...current,
            fullName: profile?.full_name || current.fullName,
            email: userEmail,
            startDate: new Date().toISOString(),
            nextDueDate: calculateNextDue(current.plan, new Date()).toISOString(),
            subscriptionStatus: 'inactive',
          }))
          setHasSubscription(false)
          setAuthState('ready')
          try {
            await fetch('/api/security/ip-log', { method: 'POST' })
          } catch {}
          return
        }

        setAuthState('unauth')
      } catch {
        setAuthState('unauth')
      }
    })()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    setCustomer((current) => {
      if (!current.nextDueDate) {
        return { ...current, nextDueDate: calculateNextDue(current.plan, new Date(current.startDate)).toISOString() }
      }
      return current
    })
  }, [])

  const price = useMemo(
    () => calculatePrice(customer.plan, customer.streams, pricingConfig, customer.downloads),
    [customer, pricingConfig]
  )
  const renewalTotals = useMemo(
    () => getRenewalTotals(price, customer.referralCreditBalance),
    [price, customer.referralCreditBalance]
  )

  const status = useMemo(() => {
    if (!hasSubscription) return 'Inactive'
    const inactive = customer.subscriptionStatus === 'inactive'
    if (inactive) return 'Inactive'
    const due = new Date(customer.nextDueDate)
    if (isNaN(due.getTime())) return 'Unknown'
    return new Date() > due ? 'Overdue' : 'Active'
  }, [customer, hasSubscription])

  const canPay = useMemo(() => {
    if (!paymentLock) return true
    if (!hasSubscription) return false
    const due = new Date(customer.nextDueDate)
    const beforeDue = !isNaN(due.getTime()) ? new Date() < due : false
    return status === 'Active' && beforeDue
  }, [paymentLock, hasSubscription, customer.nextDueDate, status])

  const referralProgress = useMemo(() => {
    return Math.min(
      100,
      Math.round(((Number(customer.referralCreditEarnedTotal || 0) / REFERRAL_CREDIT_CAP_GBP) || 0) * 100)
    )
  }, [customer.referralCreditEarnedTotal])

  const inviteLink = useMemo(() => {
    if (!origin || !customer.referralCode) return ''
    return `${origin}/customer/register?ref=${encodeURIComponent(customer.referralCode)}`
  }, [customer.referralCode, origin])

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

      const response = await res.json()
      if (!res.ok) throw new Error(response.error || 'Failed to save')

      alert('Changes saved successfully!')
    } catch (error: any) {
      console.error('Error saving changes:', error)
      alert(error.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  function acknowledgeUpdate() {
    try {
      if (updateModal) {
        const supabase = getSupabase()
        const email = (supabase as any)?._auth?.currentUser?.email || customer.email || 'anon'
        const key = `svc_updates_seen:${email}`
        const value = String(updateModal.id || updateModal.title)
        localStorage.setItem(key, value)
      }
    } catch {}
    setUpdateModal(null)
  }

  async function copyReferralValue(type: 'code' | 'link') {
    const value = type === 'code' ? customer.referralCode || '' : inviteLink
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedState(type)
      setTimeout(() => setCopiedState(null), 1800)
    } catch {}
  }

  if (authState === 'unauth') {
    return (
      <main className="p-6 flex min-h-[80vh] items-center justify-center">
        <div className="glass w-full max-w-md rounded-2xl p-6 text-center">
          <div className="mb-2 text-2xl font-semibold">Customer Portal</div>
          <div className="mb-4 text-slate-400">Please sign in to access your subscription</div>
          <a href="/customer/login" className="btn" data-no-prefetch>
            Go to Customer Login
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="glass rounded-[2rem] p-6">
        <h2 className="text-2xl font-semibold">Customer Portal</h2>
        <p className="text-slate-300">Manage your Plex subscription, renewal credit, and account details.</p>

        <div className="mt-2 flex flex-wrap gap-4">
          <a href="/customer/service-updates" className="cta-outline shimmer" data-no-prefetch>
            Service Updates
          </a>
          <a href="/customer/recommendations" className="cta-btn shimmer" data-no-prefetch>
            Requests &amp; Issues
          </a>
        </div>

        {paymentLock && !canPay && (
          <div className="card-solid mt-4 rounded-lg border border-cyan-500/30 p-4">
            <p className="mb-2 text-sm text-slate-300">
              To keep the server running at a professional and stable level, we are not accepting new customers at the moment.
            </p>
            <p className="mb-2 text-sm text-slate-300">
              If you are interested, please click the chat icon in the bottom-right corner and send us a message with your details and email address. When new slots become available, we will contact you right away.
            </p>
            <p className="text-sm text-slate-300">Thank you,</p>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="card-solid">
            <h3 className="card-title">Subscription</h3>
            <div className="space-y-3">
              <label className="label">Plan</label>
              <div className="mb-4 grid grid-cols-1 gap-2">
                <button
                  className={`btn w-full ${customer.plan === 'yearly' ? 'active' : ''}`}
                  onClick={() =>
                    setCustomer((current) => ({
                      ...current,
                      plan: 'yearly',
                      nextDueDate: calculateNextDue('yearly', new Date(current.startDate)).toISOString(),
                    }))
                  }
                >
                  Full Package
                </button>
                <button
                  className={`btn w-full ${customer.plan === 'movies_only' ? 'active' : ''}`}
                  onClick={() =>
                    setCustomer((current) => ({
                      ...current,
                      plan: 'movies_only',
                      nextDueDate: calculateNextDue('movies_only', new Date(current.startDate)).toISOString(),
                    }))
                  }
                >
                  Movies Only
                </button>
                <button
                  className={`btn w-full ${customer.plan === 'tv_only' ? 'active' : ''}`}
                  onClick={() =>
                    setCustomer((current) => ({
                      ...current,
                      plan: 'tv_only',
                      nextDueDate: calculateNextDue('tv_only', new Date(current.startDate)).toISOString(),
                    }))
                  }
                >
                  TV Shows Only
                </button>
              </div>

              <div className="rounded-lg border border-cyan-500/30 bg-cyan-900/20 p-3 text-xs text-slate-300">
                <strong>Note:</strong> Movies Only and TV Shows Only packages still contain kids TV and other genres like sports.
              </div>

              <label className="label">Streams</label>
              <select
                className="input"
                value={customer.streams}
                onChange={(event) =>
                  setCustomer((current) => ({
                    ...current,
                    streams: Math.min(5, Math.max(1, parseInt(event.target.value || '1', 10))),
                  }))
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>

              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary"
                    checked={customer.downloads || false}
                    onChange={(event) => setCustomer((current) => ({ ...current, downloads: event.target.checked }))}
                  />
                  <div>
                    <div className="font-medium text-slate-200">Add Downloads</div>
                    <div className="text-xs text-slate-400">Enable downloads for +£20.00</div>
                  </div>
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-slate-950/55 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Renewal quote</div>
                {renewalTotals.appliedCredit > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-300">
                      <span>Base renewal</span>
                      <span>£{renewalTotals.baseAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-emerald-300">
                      <span>Referral credit applied</span>
                      <span>-£{renewalTotals.appliedCredit.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-lg font-semibold text-slate-100">
                      <span>Total to pay</span>
                      <span>£{renewalTotals.finalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between text-lg font-semibold text-slate-100">
                    <span>Total to pay</span>
                    <span>£{renewalTotals.finalAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400">£{getTransactionFee(customer.plan)} transaction fee applies</div>
              <div className="mt-1 text-slate-300">Next due: {format(new Date(customer.nextDueDate), 'dd/MM/yyyy')}</div>
              <div className={`mt-1 tag ${status.toLowerCase()}`}>Status: {status}</div>
              {renewalTotals.appliedCredit > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Your next renewal is reduced by £{renewalTotals.appliedCredit.toFixed(2)} from referral rewards.
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2" suppressHydrationWarning>
              {canPay ? (
                <PayPalButton
                  amount={renewalTotals.finalAmount}
                  plan={customer.plan}
                  streams={customer.streams}
                  downloads={customer.downloads}
                  customerEmail={customer.email}
                  onSuccess={() => {}}
                />
              ) : (
                <div className="glass rounded-lg border border-amber-500/30 bg-amber-900/20 p-4 text-sm text-amber-300">
                  Payments are temporarily locked. Active subscribers can extend before their due date.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  className={`btn-outline ${saving ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={handleSaveChanges}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-solid">
            <h3 className="card-title">Account</h3>
            <div className="space-y-3">
              <label className="label">Full name</label>
              <input className="input" value={customer.fullName} onChange={(event) => setCustomer((current) => ({ ...current, fullName: event.target.value }))} />
              <label className="label">Email</label>
              <input className="input" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} />
              <label className="label">Notes</label>
              <textarea className="input" value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-cyan-500/25 bg-[linear-gradient(160deg,rgba(8,20,42,0.95),rgba(4,10,20,0.88))] p-6 shadow-[0_28px_80px_rgba(2,6,23,0.4)]">
            <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-300/80">Referral Orbit</div>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-100">Invite friends. Build credit. Cut your renewal.</h3>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    Every successful signup adds £{REFERRAL_REWARD_GBP} to your credit balance. We cap the program at £{REFERRAL_CREDIT_CAP_GBP}, so eight friends takes you to the full reward ceiling.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-right">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">Available credit</div>
                  <div className="mt-1 text-3xl font-semibold text-emerald-200">£{Number(customer.referralCreditBalance || 0).toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-700/70 bg-slate-950/55 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Successful referrals</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">{Number(customer.successfulReferralsCount || 0)}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/70 bg-slate-950/55 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Lifetime earned</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">£{Number(customer.referralCreditEarnedTotal || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-slate-700/70 bg-slate-950/55 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Headroom left</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-100">
                    £{Math.max(0, REFERRAL_CREDIT_CAP_GBP - Number(customer.referralCreditEarnedTotal || 0)).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-cyan-500/20 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Your referral code</div>
                <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.18em] text-cyan-200">
                  {customer.referralCode || 'Generating'}
                </div>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-300">
                  {inviteLink || 'Your invite link will appear here after your referral code is ready.'}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button className="btn" onClick={() => copyReferralValue('link')} disabled={!inviteLink}>
                    {copiedState === 'link' ? 'Invite link copied' : 'Copy invite link'}
                  </button>
                  <button className="btn-outline" onClick={() => copyReferralValue('code')} disabled={!customer.referralCode}>
                    {copiedState === 'code' ? 'Code copied' : 'Copy code'}
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-500">
                  <span>Progress to max reward</span>
                  <span>
                    £{Number(customer.referralCreditEarnedTotal || 0).toFixed(2)} / £{REFERRAL_CREDIT_CAP_GBP.toFixed(2)}
                  </span>
                </div>
                <div className="mt-3 h-3 rounded-full bg-slate-900/80">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#60a5fa,#34d399)] shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                    style={{ width: `${referralProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card-solid border border-slate-700/70 bg-slate-950/70">
            <h3 className="card-title">How It Works</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                Share your code or invite link with a friend.
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                When they create an account with your code, £10 is added to your credit balance.
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                Your credit automatically lowers the amount due on your renewal quote.
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
                The maximum referral reward is £80 total, so the ceiling is reached after 8 successful referrals.
              </div>
            </div>
          </div>
        </div>

        <div className="card-solid mt-6 rounded-lg border border-rose-500/30 p-4">
          <div className="mb-2 text-sm font-semibold text-rose-300">DISCLAIMER:</div>
          <p className="mb-2 text-xs text-slate-300">
            If you purchase 1 stream, it may only be used on one device at a time. Using multiple devices concurrently is strictly prohibited. We have a zero-tolerance policy for this, and violations will result in immediate disconnection with no refund.
          </p>
          <p className="text-xs text-slate-300">
            If you need to use multiple devices, please purchase additional streams to avoid a ban.
          </p>
        </div>
      </div>

      {updateModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="glass max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900/80 p-4 sm:max-w-lg">
            <div className="mb-2 text-lg font-semibold text-slate-200">{updateModal.title || 'Service Announcement'}</div>
            <div className="mt-2 max-h-[55vh] overflow-y-auto space-y-2 pr-1 sm:max-h-[60vh]">
              {(updateModal.content || '')
                .replace(/\\n/g, '\n')
                .replace(/\r\n/g, '\n')
                .split(/\n{2,}/)
                .map((section) => section.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-slate-300">
                    {paragraph}
                  </p>
                ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <a href="/customer/service-updates" className="btn-xs-outline" onClick={acknowledgeUpdate} data-no-prefetch>
                View all updates
              </a>
              <button className="btn-xs" onClick={acknowledgeUpdate}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatWidget position="bottom-right" />
    </main>
  )
}
