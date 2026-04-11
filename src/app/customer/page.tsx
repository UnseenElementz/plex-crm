"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { useSearchParams } from 'next/navigation'
import { calculateNextDue, calculatePrice, getTransactionFee, inferUniformDiscountPercentage, Plan } from '@/lib/pricing'
import { getSupabase } from '@/lib/supabaseClient'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { SERVER_FULL_BAN_HREF } from '@/lib/customerBan'

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
  terminateAtPlanEnd?: boolean
  terminationScheduledAt?: string | null
}

type ActiveMembership = {
  plan: Plan
  streams: number
  nextDueDate: string
  downloads: boolean
}

type ReferralDashboard = {
  code: string
  shareUrl: string
  availableCredit: number
  creditCap: number
  rewardValue: number
  successfulReferrals: number
  linkedReferrals?: number
  slotLimit?: number
  rewardHistory: Array<{ email: string; at: string; amount: number; label: string }>
  referredBy: string | null
  claimed: boolean
  canClaim: boolean
}

type CheckoutStatus = {
  allowed: boolean
  reason: string
  atCapacity: boolean
  activeCustomerCount: number
  customerLimit: number
  pendingInviteAccess: boolean
  newJoin: boolean
}

type PaymentHistoryRow = {
  id: string
  amount: number
  currency: string
  provider: string
  status: string
  created_at: string | null
  order_id?: string | null
  capture_id?: string | null
  note?: string | null
}

const planCards: Array<{ id: Plan; title: string; subtitle: string }> = [
  { id: 'yearly', title: 'Full Access', subtitle: '12-month full media access.' },
  { id: 'movies_only', title: 'Movies Only', subtitle: '12-month film-first access.' },
  { id: 'tv_only', title: 'TV Shows Only', subtitle: '12-month series-focused access.' },
]

function hasPaidPortalMembership(row: {
  start_date?: string | null
  next_payment_date?: string | null
  subscription_status?: string | null
}) {
  const status = String(row.subscription_status || '').trim().toLowerCase()
  if (status && status !== 'inactive') return true
  return Boolean(String(row.start_date || '').trim() || String(row.next_payment_date || '').trim())
}

function getRenewalPreviewDate(plan: Plan, currentNextDueDate: string) {
  const now = new Date()
  const currentDue = new Date(currentNextDueDate)
  const base = !Number.isNaN(currentDue.getTime()) && currentDue > now ? currentDue : now
  return calculateNextDue(plan, base)
}

export default function CustomerPortal() {
  const searchParams = useSearchParams()
  const captureAttemptRef = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [authState, setAuthState] = useState<'checking' | 'unauth' | 'ready'>('checking')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [paymentLock, setPaymentLock] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [pricingLoaded, setPricingLoaded] = useState(false)
  const [downloadsEnabled, setDownloadsEnabled] = useState(false)
  const [streamAddonTarget, setStreamAddonTarget] = useState(1)
  const [updateModal, setUpdateModal] = useState<{ id?: string; title: string; content: string } | null>(null)
  const [billingMessage, setBillingMessage] = useState('')
  const [capturingPayment, setCapturingPayment] = useState(false)
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null)
  const [referral, setReferral] = useState<ReferralDashboard | null>(null)
  const [referralLoading, setReferralLoading] = useState(false)
  const [referralMessage, setReferralMessage] = useState('')
  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [applyingCredit, setApplyingCredit] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([])
  const [activeMembership, setActiveMembership] = useState<ActiveMembership>({
    plan: 'yearly',
    streams: 1,
    nextDueDate: calculateNextDue('yearly', new Date()).toISOString(),
    downloads: false,
  })
  const [customer, setCustomer] = useState<Customer>({
    id: 'demo',
    fullName: 'Demo User',
    email: 'demo@example.com',
    plan: 'monthly',
    streams: 1,
    startDate: new Date().toISOString(),
      nextDueDate: calculateNextDue('monthly', new Date()).toISOString(),
      notes: '',
      terminateAtPlanEnd: false,
      terminationScheduledAt: null,
  })

  async function loadReferralDashboard(accessToken?: string | null) {
    setReferralLoading(true)
    try {
      const res = await fetch('/api/referrals/me', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReferral(null)
        return
      }
      setReferral(data)
    } catch {
      setReferral(null)
    } finally {
      setReferralLoading(false)
    }
  }

  async function loadPaymentHistory(accessToken?: string | null) {
    if (!accessToken) {
      setPaymentHistory([])
      return
    }

    try {
      const res = await fetch('/api/payments/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ([]))
      if (!res.ok) {
        setPaymentHistory([])
        return
      }
      setPaymentHistory(Array.isArray(data) ? data : [])
    } catch {
      setPaymentHistory([])
    }
  }

  async function refreshCustomerState(email: string) {
    const s = getSupabase()
    if (!s || !email) return
    const { data: refreshed } = await s.from('customers').select('*').eq('email', email).single()
    if (!refreshed) return
    const parsedNotes = parseCustomerNotes(refreshed.notes || '')
    setActiveMembership({
      plan: refreshed.subscription_type || customer.plan,
      streams: Math.min(5, refreshed.streams || customer.streams || 1),
      nextDueDate: refreshed.next_payment_date || customer.nextDueDate,
      downloads: parsedNotes.downloads,
    })
    setCustomer({
      id: refreshed.id,
      fullName: refreshed.name,
      email: refreshed.email,
      plan: refreshed.subscription_type || customer.plan,
      streams: Math.min(5, refreshed.streams || customer.streams || 1),
      startDate: refreshed.start_date || customer.startDate,
      nextDueDate: refreshed.next_payment_date || customer.nextDueDate,
      notes: parsedNotes.visibleNotes || '',
      downloads: parsedNotes.downloads,
      terminateAtPlanEnd: parsedNotes.terminateAtPlanEnd,
      terminationScheduledAt: parsedNotes.terminationScheduledAt,
    })
    setDownloadsEnabled(parsedNotes.downloads)
    setStreamAddonTarget(Math.min(5, Math.max(1, refreshed.streams || customer.streams || 1)))
    setHasSubscription(hasPaidPortalMembership(refreshed))
  }

  async function loadCheckoutStatus(email: string) {
    if (!email) return
    try {
      const res = await fetch('/api/customer/checkout-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCheckoutStatus(null)
        return
      }
      setCheckoutStatus(data)
    } catch {
      setCheckoutStatus(null)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setPaymentLock(Boolean(data?.payment_lock))
          setPricingConfig(data)
        }
      } catch {}
      finally {
        setPricingLoaded(true)
      }

      const s = getSupabase()
      if (!s) {
        setAuthState('unauth')
        return
      }

      const { data } = await s.auth.getUser()
      const { data: sessionData } = await s.auth.getSession()
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
        const loadCustomer = async () => {
          return s.from('customers').select('*').eq('email', userEmail).single()
        }

        const { data: customerData, error } = await loadCustomer()

        if (!error && customerData) {
          const parsedNotes = parseCustomerNotes(customerData.notes || '')
          const paidMembership = hasPaidPortalMembership(customerData)
          setActiveMembership({
            plan: customerData.subscription_type || 'monthly',
            streams: Math.min(5, customerData.streams || 1),
            nextDueDate: customerData.next_payment_date || calculateNextDue(customerData.subscription_type || 'monthly', new Date()).toISOString(),
            downloads: parsedNotes.downloads,
          })
          setCustomer({
            id: customerData.id,
            fullName: customerData.name,
            email: customerData.email,
            plan: customerData.subscription_type || 'monthly',
            streams: Math.min(5, customerData.streams || 1),
            startDate: customerData.start_date || new Date().toISOString(),
            nextDueDate: customerData.next_payment_date || calculateNextDue(customerData.subscription_type || 'monthly', new Date()).toISOString(),
            notes: parsedNotes.visibleNotes || '',
            downloads: parsedNotes.downloads,
            terminateAtPlanEnd: parsedNotes.terminateAtPlanEnd,
            terminationScheduledAt: parsedNotes.terminationScheduledAt,
          })
          setDownloadsEnabled(parsedNotes.downloads)
          setStreamAddonTarget(Math.min(5, Math.max(1, customerData.streams || 1)))
          setHasSubscription(paidMembership)
          setAuthState('ready')
          await loadReferralDashboard(sessionData.session?.access_token || null)
          await loadPaymentHistory(sessionData.session?.access_token || null)
          await loadCheckoutStatus(customerData.email)
          try {
            await fetch('/api/security/ip-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: userEmail, source: 'customer-portal' }),
            })
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
          await loadReferralDashboard(sessionData.session?.access_token || null)
          await loadPaymentHistory(sessionData.session?.access_token || null)
          await loadCheckoutStatus(userEmail)
          return
        }

        setAuthState('unauth')
      } catch {
        setAuthState('unauth')
      }
    })()
  }, [])

  useEffect(() => {
    if (!checkoutStatus?.reason || !checkoutStatus?.newJoin) return
    if (checkoutStatus.reason !== 'capacity_reached') return
    const s = getSupabase()
    s?.auth.signOut().catch(() => null)
    if (typeof window !== 'undefined') {
      window.location.href = SERVER_FULL_BAN_HREF
    }
  }, [checkoutStatus])

  useEffect(() => {
    const token = String(searchParams?.get('token') || '').trim()
    const paypalState = String(searchParams?.get('paypal') || '').trim()
    if (paypalState === 'cancelled') {
      setBillingMessage('PayPal checkout was cancelled.')
      return
    }
    if (!token || paypalState !== 'success' || capturingPayment) return
    if (captureAttemptRef.current === token) return

    ;(async () => {
      captureAttemptRef.current = token
      setCapturingPayment(true)
      setBillingMessage('')
      try {
        const res = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: token,
            customerEmail: customer.email,
            plan: customer.plan,
            streams: customer.streams,
            downloads: customer.downloads,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          captureAttemptRef.current = null
          setBillingMessage(data?.error || 'Payment capture failed.')
          return
        }

        const resolvedEmail = String(data?.customerEmail || customer.email || '').trim().toLowerCase()
        const s = getSupabase()
        if (s) {
          const session = await s.auth.getSession()
          if (resolvedEmail) {
            await refreshCustomerState(resolvedEmail)
          }
          if (session.data.session?.access_token) {
            await loadReferralDashboard(session.data.session.access_token)
            await loadPaymentHistory(session.data.session.access_token)
          }
        }

        setBillingMessage(
          data?.mode === 'downloads_addon'
            ? 'Downloads have been added to your account and Plex access is being updated.'
            : data?.mode === 'streams_addon'
              ? 'Extra streams have been added to the current account without changing the plan end date.'
            : resolvedEmail
              ? 'Payment received and your account has been updated.'
              : 'Payment received. If the portal does not refresh automatically, sign in again and your account will sync.'
        )
        if (typeof window !== 'undefined') {
          const next = new URL(window.location.href)
          next.searchParams.delete('token')
          next.searchParams.delete('PayerID')
          next.searchParams.delete('paypal')
          window.history.replaceState({}, '', next.toString())
        }
      } catch (e: any) {
        captureAttemptRef.current = null
        setBillingMessage(e?.message || 'Payment capture failed.')
      } finally {
        setCapturingPayment(false)
      }
    })()
  }, [capturingPayment, customer.downloads, customer.email, customer.plan, customer.streams, searchParams])

  const price = useMemo(() => calculatePrice(customer.plan, customer.streams, pricingConfig, customer.downloads), [customer, pricingConfig])
  const downloadsAddonPrice = useMemo(() => Number(pricingConfig?.downloads_price || 20), [pricingConfig])
  const extraStreamPrice = useMemo(() => Number(pricingConfig?.stream_yearly_price || 20), [pricingConfig])
  const activeDiscountPercentage = useMemo(() => inferUniformDiscountPercentage(pricingConfig), [pricingConfig])
  const referralCreditApplied = useMemo(() => Math.min(price, Number(referral?.availableCredit || 0)), [price, referral?.availableCredit])
  const payableToday = useMemo(() => Math.max(0, Number((price - referralCreditApplied).toFixed(2))), [price, referralCreditApplied])
  const streamAddonCount = useMemo(() => Math.max(0, streamAddonTarget - activeMembership.streams), [activeMembership.streams, streamAddonTarget])
  const streamAddonTotal = useMemo(() => Math.max(0, streamAddonTarget - activeMembership.streams) * extraStreamPrice, [activeMembership.streams, extraStreamPrice, streamAddonTarget])
  const renewalPreviewDate = useMemo(() => getRenewalPreviewDate(customer.plan, activeMembership.nextDueDate), [activeMembership.nextDueDate, customer.plan])
  const checkoutFee = useMemo(() => (payableToday > 0 ? getTransactionFee(customer.plan) : 0), [customer.plan, payableToday])
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

  const pendingInviteCheckout = useMemo(() => {
    if (hasSubscription) return false
    return Boolean(checkoutStatus?.pendingInviteAccess && checkoutStatus?.allowed)
  }, [checkoutStatus, hasSubscription])

  const canOpenCheckout = useMemo(() => {
    if (canPay) return true
    return pendingInviteCheckout
  }, [canPay, pendingInviteCheckout])

  const serverFullForNewJoin = useMemo(() => {
    return Boolean(checkoutStatus?.reason === 'capacity_reached' && checkoutStatus?.newJoin)
  }, [checkoutStatus])

  const canPurchaseDownloadsAddon = useMemo(() => {
    return hasSubscription && status === 'Active' && !downloadsEnabled && canPay
  }, [canPay, downloadsEnabled, hasSubscription, status])

  const canPurchaseStreamsAddon = useMemo(() => {
    return hasSubscription && status === 'Active' && streamAddonTarget > activeMembership.streams && canPay
  }, [activeMembership.streams, canPay, hasSubscription, status, streamAddonTarget])

  const planTerminationNotice = useMemo(() => {
    if (!customer.terminateAtPlanEnd) return null
    const due = new Date(customer.nextDueDate)
    const dueLabel = !isNaN(due.getTime()) ? format(due, 'dd/MM/yyyy') : 'your plan end date'
    return {
      dueLabel,
      scheduledLabel:
        customer.terminationScheduledAt && !isNaN(new Date(customer.terminationScheduledAt).getTime())
          ? format(new Date(customer.terminationScheduledAt), 'dd/MM/yyyy HH:mm')
          : '',
    }
  }, [customer.nextDueDate, customer.terminateAtPlanEnd, customer.terminationScheduledAt])

  const recentPayments = useMemo(() => paymentHistory.slice(0, 4), [paymentHistory])

  async function copyReferralValue(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      setReferralMessage(message)
      setTimeout(() => setReferralMessage(''), 3000)
    } catch {
      setReferralMessage('Copy failed. Please copy it manually.')
      setTimeout(() => setReferralMessage(''), 3000)
    }
  }

  async function claimReferralCode() {
    const code = referralCodeInput.trim().toUpperCase()
    if (!code) {
      setReferralMessage('Enter a member invite code first.')
      return
    }
    const s = getSupabase()
    const token = (await s?.auth.getSession())?.data.session?.access_token
    try {
      const res = await fetch('/api/referrals/me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ referralCode: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReferralMessage(data?.error || 'Member invite code could not be linked.')
        return
      }
      setReferral(data.dashboard)
      setReferralCodeInput('')
      setReferralMessage('Member invite code linked to your account.')
      setTimeout(() => setReferralMessage(''), 3000)
    } catch (e: any) {
      setReferralMessage(e?.message || 'Member invite code could not be linked.')
    }
  }

  async function applyReferralCreditRenewal() {
    const s = getSupabase()
    const token = (await s?.auth.getSession())?.data.session?.access_token
    if (!token) {
      setBillingMessage('You must be signed in to renew with credit.')
      return
    }

    setApplyingCredit(true)
    setBillingMessage('')
    try {
      const res = await fetch('/api/payments/referral-credit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: customer.plan,
          streams: customer.streams,
          downloads: customer.downloads,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBillingMessage(data?.error || 'Referral credit could not be applied.')
        return
      }
      await refreshCustomerState(customer.email)
      await loadReferralDashboard(token)
      await loadPaymentHistory(token)
      setBillingMessage(`Renewal completed using GBP ${Number(data?.creditUsed || 0).toFixed(2)} of referral credit.`)
    } catch (e: any) {
      setBillingMessage(e?.message || 'Referral credit could not be applied.')
    } finally {
      setApplyingCredit(false)
    }
  }

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      const s = getSupabase()
      const token = (await s?.auth.getSession())?.data.session?.access_token
      const payload = {
        full_name: customer.fullName,
        notes: customer.notes,
      }

      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

  if (authState === 'checking' || !pricingLoaded) {
    return (
      <main className="page-section py-12">
        <div className="panel mx-auto max-w-3xl p-8 text-center">
          <div className="eyebrow mx-auto">Customer Access</div>
          <h1 className="mt-5 text-3xl font-semibold text-white sm:text-[2.2rem]">Loading your account</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Pulling your latest pricing, billing, and service status now.
          </p>
        </div>
      </main>
    )
  }

  if (authState === 'unauth') {
    return (
      <main className="page-section py-12">
        <div className="panel mx-auto max-w-3xl p-8 text-center">
          <div className="eyebrow mx-auto">Customer Access</div>
          <h1 className="mt-5 text-3xl font-semibold text-white sm:text-[2.2rem]">Sign in to manage your account</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Payments, service updates, and support for your hosting account in one place.
          </p>
          <a href="/customer/login" className="btn mt-8" data-no-prefetch>
            Go to Customer Login
          </a>
          {paymentLock ? (
            <div className="mt-8 rounded-[28px] border border-cyan-400/15 bg-cyan-400/8 p-5 text-left text-sm text-slate-300">
              This is now a closed community. Existing customers can log in normally. New access only opens through private member invites when a current customer brings someone in.
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <main className="page-section py-5 sm:py-8">
      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4 sm:space-y-6">
          <div className="panel-strong panel-lift overflow-hidden p-5 sm:p-7">
            <div className="eyebrow">Account</div>
            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white sm:text-[2.2rem]">Manage your hosting account.</h1>
                <p className="mt-3 max-w-2xl text-slate-400">
                  Billing, support, and service updates in one clear dashboard.
                </p>
              </div>
              <div className={`tag ${status.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{status}</div>
            </div>

            {planTerminationNotice ? (
              <div className="mt-6 rounded-[28px] border border-amber-400/25 bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(120,53,15,0.22))] p-5 text-sm text-amber-50 shadow-[0_20px_60px_rgba(120,53,15,0.18)]">
                <div className="text-[11px] uppercase tracking-[0.26em] text-amber-200/85">Termination Date Soon</div>
                <div className="mt-3 text-xl font-semibold text-white">This account is scheduled to end on {planTerminationNotice.dueLabel}.</div>
                <div className="mt-3 max-w-2xl leading-7 text-amber-100/90">
                  Your current plan will remain active until then. After that date, access will end automatically, your slot will be released, and membership will not continue.
                </div>
                <div className="mt-3 text-amber-200/85">
                  We now operate as a closed private community, and access is limited to selected active members only.
                </div>
                {planTerminationNotice.scheduledLabel ? (
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
                    Scheduled by admin on {planTerminationNotice.scheduledLabel}
                  </div>
                ) : null}
              </div>
            ) : null}

            {pendingInviteCheckout || serverFullForNewJoin ? (
              <div
                className={`mt-6 rounded-[28px] border p-5 shadow-[0_20px_60px_rgba(8,15,40,0.22)] ${
                  pendingInviteCheckout
                    ? 'border-emerald-400/22 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(6,78,59,0.18))]'
                    : 'border-rose-400/22 bg-[linear-gradient(135deg,rgba(244,63,94,0.16),rgba(76,5,25,0.18))]'
                }`}
              >
                <div className={`text-[11px] uppercase tracking-[0.26em] ${pendingInviteCheckout ? 'text-emerald-200/85' : 'text-rose-200/85'}`}>
                  {pendingInviteCheckout ? 'Invite Slot Ready' : 'Server At Capacity'}
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {pendingInviteCheckout
                    ? 'Your slot is ready to go live as soon as PayPal confirms the order.'
                    : `New memberships are paused at ${checkoutStatus?.activeCustomerCount || 0}/${checkoutStatus?.customerLimit || 100} active customers.`}
                </div>
                <div className={`mt-3 max-w-2xl text-sm leading-7 ${pendingInviteCheckout ? 'text-emerald-50/90' : 'text-rose-50/90'}`}>
                  {pendingInviteCheckout
                    ? 'This checkout will activate the account, move the membership live, and provision Plex access automatically without needing manual admin work.'
                    : 'This account is still recognised, but the closed community has no spare slots right now. As soon as one opens, the join flow can continue again.'}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="panel bg-black/15 p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/70">Access</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {pendingInviteCheckout ? 'Pending activation' : 'Waiting list hold'}
                    </div>
                  </div>
                  <div className="panel bg-black/15 p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/70">Community</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {checkoutStatus?.activeCustomerCount || 0}/{checkoutStatus?.customerLimit || 100} active
                    </div>
                  </div>
                  <div className="panel bg-black/15 p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300/70">Provisioning</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {pendingInviteCheckout ? 'Auto after payment' : 'Held until slot opens'}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeDiscountPercentage && activeDiscountPercentage > 0 ? (
              <div className="mt-6 overflow-hidden rounded-[28px] border border-emerald-400/28 bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(4,47,46,0.34))] p-5 shadow-[0_20px_70px_rgba(16,185,129,0.16)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/90">Today&apos;s Discount</div>
                    <div className="mt-3 text-2xl font-semibold text-white">{activeDiscountPercentage}% off all packages today</div>
                    <div className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50/90">
                      Your checkout total below already includes the live discount. Pick your package, choose streams, and pay the reduced amount through PayPal.
                    </div>
                    <div className="mt-3 max-w-2xl rounded-[22px] border border-amber-300/20 bg-black/15 px-4 py-3 text-sm leading-6 text-amber-100/90">
                      Referral credit is paused while this discount is active. If somebody joins through your invite during the sale, the link still stays attached to your account, and you will receive the GBP 10.00 credit when they complete a future full-price payment.
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-white/12 bg-black/15 px-5 py-4 text-right">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/85">Live offer</div>
                    <div className="mt-2 text-3xl font-semibold text-white">{activeDiscountPercentage}% OFF</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-3">
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Plan</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeMembership.plan.replace('_', ' ')}</div>
              </div>
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Streams</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeMembership.streams}</div>
              </div>
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Next Due</div>
                <div className="mt-2 text-xl font-semibold text-white">{format(new Date(activeMembership.nextDueDate), 'dd/MM/yyyy')}</div>
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

          <div className="card-solid panel-lift p-4 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <h2 className="card-title">Choose your package</h2>
              <div className="text-sm text-slate-400">Simple package changes and renewals</div>
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
                    }))
                  }
                >
                  <div className="text-base font-semibold text-white">{plan.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{plan.subtitle}</div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-[24px] border border-cyan-400/12 bg-cyan-400/8 p-4 text-sm text-slate-300">
              Movies Only and TV Shows Only still include shared family categories such as kids and selected mixed content.
            </div>

            <div className="mt-5 grid gap-4 sm:mt-6 sm:gap-5 sm:grid-cols-2">
              <div>
                <label className="label">Renewal streams</label>
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
                      {count} total {count === 1 ? 'stream' : 'streams'}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-400">
                  This only changes the next 12-month renewal package. Use the extra-stream block below if you want to add streams to the current membership right now.
                </div>
              </div>

              <div className="panel p-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={customer.downloads || false}
                    onChange={(e) => setCustomer((current) => ({ ...current, downloads: e.target.checked }))}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">Include downloads on your next renewal</div>
                    <div className="text-xs text-slate-400">This changes the renewal total only. Use the add-on block below for instant activation.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="card-solid panel-lift p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <h2 className="card-title">Member invites</h2>
                <div className="mt-1 text-sm text-slate-400">Bring in up to 8 linked members. You earn GBP 10.00 when they complete a full-price payment, again on later full-price renewals, and anyone joining through a valid referral gets their own one-time GBP 10.00 signup credit after their first full-price payment too.</div>
              </div>
              <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/80">Available credit</div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  GBP {Number(referral?.availableCredit || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="panel p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Your member invite code</div>
                <div className="mt-2 text-xl font-semibold text-white">{referral?.code || 'Loading...'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-xs" onClick={() => referral?.code && void copyReferralValue(referral.code, 'Invite code copied.')}>
                    Copy invite code
                  </button>
                  <button className="btn-xs-outline" onClick={() => referral?.shareUrl && void copyReferralValue(referral.shareUrl, 'Invite link copied.')}>
                    Copy invite link
                  </button>
                </div>
                <div className="mt-3 text-xs text-slate-400">
                  Share this privately with someone you want to bring into the service. Every full-price payment on a linked referral adds another GBP 10.00 to your account.
                </div>
                {activeDiscountPercentage && activeDiscountPercentage > 0 ? (
                  <div className="mt-3 rounded-[18px] border border-amber-400/18 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    Sale mode is active right now, so referral credit waits until that linked member makes a future full-price payment.
                  </div>
                ) : null}
              </div>

              <div className="panel p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Reward per joined member</div>
                    <div className="mt-2 text-xl font-semibold text-white">GBP {Number(referral?.rewardValue || 10).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Linked members</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {referral?.linkedReferrals || 0}/{referral?.slotLimit || 8}
                    </div>
                  </div>
                </div>
                {referral?.referredBy ? (
                  <div className="mt-4 rounded-[20px] border border-cyan-400/15 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                    This member access is linked to invite code {referral.referredBy}.
                  </div>
                ) : null}
                {referralLoading ? <div className="mt-4 text-sm text-slate-500">Loading referral details...</div> : null}
              </div>
            </div>

            {referral?.canClaim ? (
              <div className="mt-4 rounded-[24px] border border-cyan-400/15 bg-cyan-400/8 p-4">
                <div className="text-sm font-semibold text-white">Been referred by a friend?</div>
                <div className="mt-1 text-sm text-slate-400">Add their member invite code before your first full-price paid renewal so the reward goes to the right account.</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <input
                    className="input max-w-sm"
                    placeholder="Enter member invite code"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                  />
                  <button className="btn-xs" onClick={claimReferralCode} disabled={!referralCodeInput.trim()}>
                    Link invite
                  </button>
                </div>
              </div>
            ) : null}

            {referralMessage ? (
              <div className="mt-4 rounded-[20px] border border-cyan-400/15 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">{referralMessage}</div>
            ) : null}

            {referral?.rewardHistory?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {referral.rewardHistory.slice(0, 4).map((entry) => (
                  <div key={`${entry.email}-${entry.at}`} className="panel p-4">
                    <div className="text-sm font-semibold text-white">{entry.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{format(new Date(entry.at), 'dd/MM/yyyy HH:mm')}</div>
                    <div className="mt-2 text-sm text-emerald-300">+ GBP {Number(entry.amount || 0).toFixed(2)} credit</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card-solid panel-lift p-5 sm:p-6">
            <h2 className="card-title">Billing overview</h2>
            <div className="mt-5 rounded-[28px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,0.3))] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Pay today</div>
              <div className="mt-2 text-4xl font-semibold text-white">GBP {payableToday.toFixed(2)}</div>
              {activeDiscountPercentage && activeDiscountPercentage > 0 ? (
                <div className="mt-3 inline-flex rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-200">
                  {activeDiscountPercentage}% off applied
                </div>
              ) : null}
              <div className="mt-2 text-sm text-slate-400">Package total: GBP {price.toFixed(2)}</div>
              <div className="mt-2 text-sm text-slate-400">Referral credit applied: GBP {referralCreditApplied.toFixed(2)}</div>
              <div className="mt-2 text-sm text-slate-400">Transaction fee: GBP {checkoutFee}</div>
              <div className="mt-2 text-sm text-slate-400">Every package renews for 12 months.</div>
              <div className="mt-2 text-sm text-slate-400">Plan end after payment: {format(renewalPreviewDate, 'dd/MM/yyyy')}</div>
            </div>

            <div className="mt-5 rounded-[28px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(15,23,42,0.22))] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Extra Streams Add-on</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {streamAddonCount > 0 ? `Add ${streamAddonCount} extra ${streamAddonCount === 1 ? 'stream' : 'streams'} now for GBP ${streamAddonTotal.toFixed(2)}` : 'No extra streams selected'}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    Extra streams do not extend the membership date. They stay active only until the current plan ends on {format(new Date(activeMembership.nextDueDate), 'dd/MM/yyyy')}.
                  </div>
                </div>
                <div className={`tag ${streamAddonCount > 0 ? 'active' : 'inactive'}`}>
                  {streamAddonCount > 0 ? `+${streamAddonCount} selected` : 'No add-on'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Current live streams</label>
                  <div className="input flex items-center text-slate-200">{activeMembership.streams} total {activeMembership.streams === 1 ? 'stream' : 'streams'}</div>
                </div>
                <div>
                  <label className="label">Set total streams now</label>
                  <select
                    className="input"
                    value={streamAddonTarget}
                    onChange={(e) => setStreamAddonTarget(Math.min(5, Math.max(activeMembership.streams, parseInt(e.target.value || String(activeMembership.streams), 10))))}
                  >
                    {Array.from({ length: 6 - activeMembership.streams }, (_, index) => activeMembership.streams + index).map((count) => (
                      <option key={count} value={count}>
                        {count} total {count === 1 ? 'stream' : 'streams'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {streamAddonCount > 0 ? (
                <div className="mt-4">
                  {canPurchaseStreamsAddon ? (
                    <PayPalButton
                      amount={streamAddonTotal}
                      baseAmount={streamAddonTotal}
                      currency="GBP"
                      customerEmail={customer.email}
                      plan={activeMembership.plan}
                      streams={streamAddonTarget}
                      downloads={activeMembership.downloads}
                      mode="streams_addon"
                    />
                  ) : (
                    <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Extra streams can only be added while the subscription is active and payable from this account.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-[28px] border border-violet-400/15 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,23,42,0.28))] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-violet-200/80">Downloads Add-on</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {downloadsEnabled ? 'Downloads already active' : `Add downloads now for GBP ${downloadsAddonPrice.toFixed(2)}`}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {downloadsEnabled
                      ? 'This account already has downloads enabled.'
                      : 'This enables downloads on the current subscription only. It does not change the renewal date or package.'}
                  </div>
                </div>
                <div className={`tag ${downloadsEnabled ? 'active' : 'inactive'}`}>
                  {downloadsEnabled ? 'Enabled' : 'Not active'}
                </div>
              </div>

              {!downloadsEnabled ? (
                <div className="mt-4">
                  {canPurchaseDownloadsAddon ? (
                    <PayPalButton
                      amount={downloadsAddonPrice}
                      baseAmount={downloadsAddonPrice}
                      currency="GBP"
                      customerEmail={customer.email}
                      plan={activeMembership.plan}
                      streams={activeMembership.streams}
                      downloads
                      mode="downloads_addon"
                    />
                  ) : (
                    <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Downloads can only be added while the subscription is active and payable from this account.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {billingMessage ? (
                <div className={`rounded-[24px] border px-4 py-3 text-sm ${
                  billingMessage.toLowerCase().includes('failed') || billingMessage.toLowerCase().includes('cancelled')
                    ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                }`}>
                  {billingMessage}
                </div>
              ) : null}
              {canOpenCheckout ? (
                payableToday > 0 ? (
                  <PayPalButton
                    amount={payableToday}
                    baseAmount={price}
                    creditApplied={referralCreditApplied}
                    plan={customer.plan}
                    streams={customer.streams}
                    downloads={customer.downloads}
                    customerEmail={customer.email}
                    onSuccess={() => {}}
                  />
                ) : (
                  <button className="btn w-full" onClick={applyReferralCreditRenewal} disabled={applyingCredit || referralCreditApplied <= 0}>
                    {applyingCredit ? 'Applying credit...' : 'Renew using referral credit'}
                  </button>
                )
              ) : (
                <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {serverFullForNewJoin
                    ? `The server is currently full at ${checkoutStatus?.activeCustomerCount || 0}/${checkoutStatus?.customerLimit || 100} active customers. New joins are paused until a slot opens.`
                    : 'Payments are temporarily locked. Active subscribers can extend before their due date.'}
                </div>
              )}
              <button className={`btn-outline w-full ${saving ? 'opacity-50' : ''}`} onClick={handleSaveChanges} disabled={saving}>
                {saving ? 'Saving...' : 'Save account changes'}
              </button>
            </div>

            <div className="mt-5 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Payment history</div>
                  <div className="mt-2 text-lg font-semibold text-white">Recent payments on your account</div>
                </div>
                <a href="/customer/payments" className="btn-xs-outline" data-no-prefetch>
                  Open full history
                </a>
              </div>

              <div className="mt-4 grid gap-3">
                {recentPayments.length ? (
                  recentPayments.map((payment) => (
                    <div key={payment.id} className="rounded-[20px] border border-white/8 bg-black/10 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                      <div className="text-sm font-semibold text-white">GBP {Number(payment.amount || 0).toFixed(2)}</div>
                      <div className="mt-1 text-xs text-slate-400">{payment.provider}</div>
                    </div>
                        <div className={`tag ${String(payment.status || '').toLowerCase() === 'completed' ? 'active' : ''}`}>
                          {payment.status}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-slate-400">
                        {payment.created_at && !Number.isNaN(new Date(payment.created_at).getTime())
                          ? format(new Date(payment.created_at), 'dd/MM/yyyy HH:mm')
                          : 'Unknown date'}
                      </div>
                      {payment.note ? (
                        <div className="mt-2 rounded-[16px] border border-white/8 bg-black/10 px-3 py-2 text-xs text-slate-300">
                          {payment.note}
                        </div>
                      ) : null}
                      {payment.capture_id || payment.order_id ? (
                        <div className="mt-2 break-all text-xs text-cyan-200/80">
                          Ref: {payment.capture_id || payment.order_id}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-white/8 bg-black/10 px-4 py-4 text-sm text-slate-400">
                    Your recorded payments will appear here so you can quickly confirm them if anything is ever disputed.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card-solid panel-lift p-5 sm:p-6">
            <h2 className="card-title">Account details</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={customer.fullName} onChange={(e) => setCustomer((current) => ({ ...current, fullName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input opacity-80" value={customer.email} readOnly />
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
              Access is now handled as a closed community. Existing customers stay active here, and new members only arrive through private invites from current customers.
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
