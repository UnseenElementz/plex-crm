"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { getSupabase } from '@/lib/supabaseClient'

type Payment = {
  id: string
  amount: number
  currency: string
  provider: string
  status: string
  created_at: string | null
  order_id?: string | null
  capture_id?: string | null
  note?: string | null
  source?: 'payments' | 'ledger'
}

function formatMoney(amount: number, currency = 'GBP') {
  const value = Number(amount || 0)
  if (currency === 'GBP') return `GBP ${value.toFixed(2)}`
  return `${currency} ${value.toFixed(2)}`
}

function formatPaymentDate(value: string | null) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return format(date, 'dd/MM/yyyy HH:mm')
}

export default function CustomerPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadPayments() {
    setLoading(true)
    setError('')
    try {
      const s = getSupabase()
      const session = await s?.auth.getSession()
      const token = session?.data.session?.access_token
      const email = session?.data.session?.user?.email
      if (!token) {
        setRows([])
        setError('You need to be signed in to view payment history.')
        return
      }

      const res = await fetch('/api/payments/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to load payment history')
      setRows(Array.isArray(data) ? data : [])

      if (email) {
        await fetch('/api/security/ip-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'customer-payments' }),
        }).catch(() => null)
      }
    } catch (e: any) {
      setRows([])
      setError(e?.message || 'Failed to load payment history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPayments()
  }, [])

  const summary = useMemo(() => {
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const refundedCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'refunded').length
    const latest = rows[0]?.created_at || null
    return {
      totalPaid,
      refundedCount,
      latest,
    }
  }, [rows])

  return (
    <main className="page-section py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="panel-strong panel-lift p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow">Payment History</div>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-[2.2rem]">Your previous payments in one clear place.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Use this page to check dates, amounts, and payment references if anything ever needs confirming.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={() => void loadPayments()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh history'}
              </button>
              <Link href="/customer" className="btn-xs-outline" prefetch={false}>
                Back to portal
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="panel p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Payments recorded</div>
              <div className="mt-2 text-2xl font-semibold text-white">{rows.length}</div>
            </div>
            <div className="panel p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Total shown</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatMoney(summary.totalPaid)}</div>
            </div>
            <div className="panel p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Latest payment</div>
              <div className="mt-2 text-base font-semibold text-white">{formatPaymentDate(summary.latest)}</div>
            </div>
          </div>
        </section>

        <section className="panel panel-lift p-5 sm:p-6">
          {error ? (
            <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {loading ? <div className="text-sm text-slate-500">Loading payment history...</div> : null}

          {!loading && rows.length === 0 ? (
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
              No payment history has been recorded on this account yet.
            </div>
          ) : null}

          <div className="grid gap-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-white">{formatMoney(row.amount, row.currency)}</div>
                      <span className={`tag ${String(row.status || '').toLowerCase() === 'completed' ? 'active' : ''}`}>
                        {row.status}
                      </span>
                      {row.source === 'ledger' ? (
                        <span className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                          PayPal record
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{row.provider}</div>
                    {row.note ? (
                      <div className="mt-3 rounded-[18px] border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                        {row.note}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-slate-300 lg:min-w-[260px]">
                    <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Date</div>
                      <div className="mt-1">{formatPaymentDate(row.created_at)}</div>
                    </div>
                    {(row.capture_id || row.order_id) ? (
                      <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reference</div>
                        <div className="mt-1 break-all text-xs text-slate-200">{row.capture_id || row.order_id}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && rows.length > 0 ? (
            <div className="mt-4 rounded-[20px] border border-cyan-400/15 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">
              Keep this page for reference if any payment question ever comes up. It shows the date, amount, and stored payment reference for your account.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
