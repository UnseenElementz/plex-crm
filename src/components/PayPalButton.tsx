"use client"

import { useMemo, useState } from 'react'
import { type Plan } from '@/lib/pricing'
import { type PayPalCheckoutMode } from '@/lib/payments'

function buildHostingReference(plan?: Plan, servers?: number, downloads?: boolean) {
  const safePlan = plan || 'yearly'
  const safeServers = Math.max(1, Number(servers || 1))
  const duration = safePlan === 'monthly' ? '1 Month' : '12 Months'
  const packageLabel =
    safePlan === 'movies_only'
      ? 'Movies Only'
      : safePlan === 'tv_only'
        ? 'TV Shows Only'
        : 'Full Access'
  const serverLabel = `${safeServers} ${safeServers === 1 ? 'Stream' : 'Streams'}`
  return `${duration} ${packageLabel} - ${serverLabel}${downloads ? ' + Downloads' : ''}`
}

function buildReference(mode?: PayPalCheckoutMode, plan?: Plan, servers?: number, downloads?: boolean) {
  if (mode === 'downloads_addon') return 'Downloads Add-on'
  if (mode === 'streams_addon') return `Extra Stream Add-on - ${Math.max(1, Number(servers || 1))} Total ${Math.max(1, Number(servers || 1)) === 1 ? 'Stream' : 'Streams'}`
  return buildHostingReference(plan, servers, downloads)
}

export default function PayPalButton({
  amount,
  baseAmount,
  creditApplied = 0,
  currency = 'GBP',
  customerEmail,
  plan,
  streams,
  downloads,
  mode = 'renewal',
}: {
  amount: number
  baseAmount?: number
  creditApplied?: number
  currency?: string
  customerEmail?: string
  plan?: Plan
  streams?: number
  downloads?: boolean
  mode?: PayPalCheckoutMode
  onSuccess?: (orderId: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reference = useMemo(
    () => buildReference(mode, plan, streams, downloads),
    [downloads, mode, plan, streams]
  )

  async function beginCheckout() {
    setError('')
    setLoading(true)
    try {
      if (customerEmail) {
        await fetch('/api/security/ip-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: customerEmail,
            source: 'customer-paypal-checkout',
            details: {
              mode,
              amount,
              currency,
              plan,
              streams,
              downloads: Boolean(downloads),
            },
          }),
        }).catch(() => null)
      }

      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          customerEmail,
          plan,
          streams,
          downloads,
          mode,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.capacityReached && typeof window !== 'undefined') {
          window.location.href = '/customer/banned?reason=server-full'
          return
        }
        setError(data?.error || 'Unable to start checkout.')
        return
      }
      if (!data?.approveUrl) {
        setError('PayPal approval link was not returned.')
        return
      }
      window.location.href = data.approveUrl
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-[28px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(15,23,42,0.55))] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">PayPal Checkout</div>
          <div className="mt-2 text-3xl font-semibold text-white">GBP {amount.toFixed(2)}</div>
          {creditApplied > 0 && baseAmount !== undefined ? (
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              <div>Base total: GBP {baseAmount.toFixed(2)}</div>
              <div>Referral credit: -GBP {creditApplied.toFixed(2)}</div>
            </div>
          ) : null}
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-300">
          Secure payment
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-white/8 bg-slate-950/35 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Reference sent to PayPal</div>
        <div className="mt-2 text-sm font-medium text-white">{reference}</div>
        <div className="mt-2 text-xs text-slate-400">
          {mode === 'downloads_addon'
            ? 'This payment only adds downloads to the current account. It does not change the renewal date or package.'
            : mode === 'streams_addon'
              ? 'This payment only adds extra streams to the current account. It does not change the renewal date or package.'
              : 'This renews the membership package and updates the account automatically once PayPal confirms the order.'}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[20px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <button className="btn mt-5 w-full" onClick={beginCheckout} disabled={loading}>
        {loading ? 'Opening PayPal...' : 'Continue to PayPal'}
      </button>
    </div>
  )
}
