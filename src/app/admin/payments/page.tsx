'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Search, Wallet } from 'lucide-react'

type TransactionRow = {
  id: string
  customer_id: string | null
  customer_name: string
  customer_email: string | null
  payer_email?: string | null
  payer_name?: string | null
  amount: number
  currency: string
  provider: string
  status: string
  created_at: string | null
  note?: string | null
  type: 'hosting' | 'downloads_addon' | 'streams_addon'
  order_id: string | null
  capture_id: string | null
  refund_id: string | null
  refund_amount: number | null
  refund_status: string | null
  refunded_at: string | null
  refund_available: boolean
  legacy: boolean
  linked: boolean
  source: 'payments' | 'ledger'
  entry_source?: 'website' | 'manual'
}

type CustomerOption = {
  id: string
  full_name: string
  email: string
}

function formatMoney(amount: number, currency = 'GBP') {
  const value = Number(amount || 0)
  if (currency === 'GBP') return `GBP ${value.toFixed(2)}`
  return `${currency} ${value.toFixed(2)}`
}

function formatDate(value: string | null) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString('en-GB')
}

function getPurchaseLabel(row: TransactionRow) {
  const note = String(row.note || '').trim()
  if (note) {
    return note.split('|')[0]?.trim() || note
  }
  if (row.type === 'downloads_addon') return 'Downloads add-on'
  if (row.type === 'streams_addon') return 'Streams add-on'
  return 'Hosting renewal'
}

function getPurchaseDetails(row: TransactionRow) {
  const note = String(row.note || '').trim()
  if (note.includes('|')) {
    const detail = note
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(1)
      .join(' | ')
    if (detail) return detail
  }
  if (row.type === 'downloads_addon') return 'Downloads unlocked on the current plan'
  if (row.type === 'streams_addon') return 'Extra stream add-on applied'
  return '12-month hosting package'
}

function getTypeBadge(row: TransactionRow) {
  if (row.type === 'downloads_addon') return 'downloads'
  if (row.type === 'streams_addon') {
    const detail = getPurchaseDetails(row)
    const match = detail.match(/(\d+)\s+total\s+streams?/i)
    return match ? `${match[1]} streams` : 'streams'
  }
  return '12-month renewal'
}

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [manualForm, setManualForm] = useState({
    customerId: '',
    amount: '',
    transactionId: '',
    payerEmail: '',
    payerName: '',
    paidAt: '',
    note: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/payments', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load PayPal transactions')
      setRows(Array.isArray(data?.transactions) ? data.transactions : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load PayPal transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/customers', { cache: 'no-store' })
        const data = await res.json().catch(() => ([]))
        if (!res.ok) return
        setCustomers(
          Array.isArray(data)
            ? data.map((row: any) => ({
                id: String(row?.id || '').trim(),
                full_name: String(row?.full_name || '').trim(),
                email: String(row?.email || '').trim().toLowerCase(),
              })).filter((row: CustomerOption) => row.id && row.email)
            : []
        )
      } catch {}
    })()
  }, [])

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase()
    if (!clean) return rows
    return rows.filter((row) =>
      `${row.customer_name || ''} ${row.customer_email || ''} ${row.payer_email || ''} ${row.payer_name || ''} ${row.provider || ''} ${row.order_id || ''} ${row.capture_id || ''} ${row.note || ''} ${formatDate(row.created_at)}`
        .toLowerCase()
        .includes(clean)
    )
  }, [query, rows])

  const totals = useMemo(() => {
    let incoming = 0
    let refunded = 0
    let refundable = 0
    for (const row of rows) {
      incoming += Number(row.amount || 0)
      if (row.refund_id) refunded += Number(row.refund_amount || row.amount || 0)
      if (row.refund_available) refundable += 1
    }
    return {
      incoming,
      refunded,
      refundable,
    }
  }, [rows])

  async function refundPayment(row: TransactionRow) {
    const customerLabel = row.customer_name || row.customer_email || 'this customer'
    const confirmed = window.confirm(
      `Refund ${formatMoney(row.amount, row.currency)} to ${customerLabel}?\n\nThis will send the PayPal refund, remove their Plex share, and mark the customer inactive on the website.`
    )
    if (!confirmed) return

    setBusyId(row.id)
    try {
      const res = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: row.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Refund failed')
      await load()
    } catch (e: any) {
      window.alert(e?.message || 'Refund failed')
    } finally {
      setBusyId('')
    }
  }

  async function saveManualPayment() {
    setSaveMessage('')
    if (!manualForm.customerId) {
      setSaveMessage('Pick the customer who sent the direct PayPal payment first.')
      return
    }
    const amount = Number(manualForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setSaveMessage('Enter a valid amount greater than 0.')
      return
    }

    setManualSaving(true)
    try {
      const res = await fetch('/api/admin/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: manualForm.customerId,
          amount,
          currency: 'GBP',
          transactionId: manualForm.transactionId,
          payerEmail: manualForm.payerEmail,
          payerName: manualForm.payerName,
          paidAt: manualForm.paidAt || null,
          note: manualForm.note,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to record direct payment')
      setManualForm({
        customerId: '',
        amount: '',
        transactionId: '',
        payerEmail: '',
        payerName: '',
        paidAt: '',
        note: '',
      })
      setSaveMessage(data?.payment?.transactionId ? 'Direct PayPal payment linked by transaction ID and saved.' : 'Direct PayPal payment linked to the customer and saved.')
      await load()
    } catch (e: any) {
      setSaveMessage(e?.message || 'Failed to record direct payment')
    } finally {
      setManualSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel-strong panel-lift overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow">PayPal Hosting Transactions</div>
            <h1 className="mt-4 text-3xl font-semibold text-white sm:text-[2.3rem]">Incoming customer payments and one-click refunds.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This page shows website hosting transactions tracked by the app and any PayPal captures the site has seen, even if the payment row did not fully link.
            </p>
          </div>
          <button className="btn-outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Incoming total</div>
            <div className="mt-2 text-2xl font-semibold text-white">{formatMoney(totals.incoming)}</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Refunded total</div>
            <div className="mt-2 text-2xl font-semibold text-white">{formatMoney(totals.refunded)}</div>
          </div>
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Refund ready</div>
            <div className="mt-2 text-2xl font-semibold text-white">{totals.refundable}</div>
          </div>
        </div>
      </section>

      <section className="panel panel-lift p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="eyebrow">Direct PayPal Link</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Record a direct PayPal payment and attach it to a customer.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use this when somebody paid you straight into PayPal instead of through the website. Paste the PayPal transaction ID if you have it, then attach it to the customer history even if the payer PayPal email is different.
            </p>
          </div>
          <div className="rounded-[22px] border border-cyan-400/18 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            Direct PayPal auto-import is currently blocked by PayPal API permissions, so this is the safe fallback.
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Customer</label>
            <select
              className="input"
              value={manualForm.customerId}
              onChange={(event) => setManualForm((current) => ({ ...current, customerId: event.target.value }))}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name || customer.email} - {customer.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (GBP)</label>
            <input
              className="input"
              placeholder="42.50"
              value={manualForm.amount}
              onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">PayPal Transaction ID</label>
            <input
              className="input"
              placeholder="8LA27256W2417232X"
              value={manualForm.transactionId}
              onChange={(event) => setManualForm((current) => ({ ...current, transactionId: event.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <label className="label">Payer PayPal Email</label>
            <input
              className="input"
              placeholder="payer@example.com"
              value={manualForm.payerEmail}
              onChange={(event) => setManualForm((current) => ({ ...current, payerEmail: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">Payer Name</label>
            <input
              className="input"
              placeholder="Name shown in PayPal"
              value={manualForm.payerName}
              onChange={(event) => setManualForm((current) => ({ ...current, payerName: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">Paid At</label>
            <input
              className="input"
              type="datetime-local"
              value={manualForm.paidAt}
              onChange={(event) => setManualForm((current) => ({ ...current, paidAt: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">Internal Note</label>
            <input
              className="input"
              placeholder="Paid direct into PayPal outside the website"
              value={manualForm.note}
              onChange={(event) => setManualForm((current) => ({ ...current, note: event.target.value }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn" onClick={() => void saveManualPayment()} disabled={manualSaving}>
            {manualSaving ? 'Saving direct payment...' : 'Save Direct PayPal Payment'}
          </button>
          {saveMessage ? (
            <div className={`text-sm ${saveMessage.toLowerCase().includes('failed') || saveMessage.toLowerCase().includes('pick') || saveMessage.toLowerCase().includes('enter') ? 'text-amber-200' : 'text-emerald-300'}`}>
              {saveMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel panel-lift p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-11"
              placeholder="Search customer, email, order ID, payment date..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Refunds here send the money back, remove Plex access, and mark the customer inactive after confirmation.
          </div>
        </div>

        {error ? <div className="mt-4 rounded-[22px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        {loading ? <div className="mt-4 text-sm text-slate-500">Loading transactions...</div> : null}

        <div className="mt-5 grid gap-3">
          {filtered.length === 0 && !loading ? (
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
              No hosting transactions found.
            </div>
          ) : null}

          {filtered.map((row) => (
            <div key={row.id} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-white">{row.customer_name || row.customer_email || 'Unknown customer'}</div>
                    <span className={`tag ${row.refund_id ? 'inactive' : row.status === 'completed' ? 'active' : ''}`}>
                      {row.refund_id ? 'refunded' : row.status}
                    </span>
                    <span className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                      {getTypeBadge(row)}
                    </span>
                    {row.source === 'ledger' ? (
                      <span className="rounded-full border border-amber-400/18 bg-amber-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-200">
                        PayPal capture
                      </span>
                    ) : null}
                    {row.entry_source === 'manual' ? (
                      <span className="rounded-full border border-fuchsia-400/18 bg-fuchsia-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-fuchsia-200">
                        Direct PayPal link
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{row.customer_email || 'No customer email linked'}</div>
                  {row.payer_email || row.payer_name ? (
                    <div className="mt-1 text-sm text-slate-500">
                      Paid by {row.payer_name || 'PayPal payer'}{row.payer_email ? ` (${row.payer_email})` : ''}
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 2xl:grid-cols-4">
                    <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Payment date</div>
                      <div className="mt-1 text-sm text-slate-200">{formatDate(row.created_at)}</div>
                    </div>
                    <div className="rounded-[18px] border border-cyan-400/12 bg-cyan-500/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Purchase</div>
                      <div className="mt-1 text-sm text-white">{getPurchaseLabel(row)}</div>
                      <div className="mt-1 text-xs leading-5 text-cyan-100/75">{getPurchaseDetails(row)}</div>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Incoming amount</div>
                      <div className="mt-1 text-sm text-slate-200">{formatMoney(row.amount, row.currency)}</div>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">PayPal order</div>
                      <div className="mt-1 truncate text-sm text-slate-200" title={row.order_id || ''}>
                        {row.order_id ? row.order_id : 'Not stored'}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Capture ID</div>
                      <div className="mt-1 truncate text-sm text-slate-200" title={row.capture_id || ''}>
                        {row.capture_id ? row.capture_id : 'Legacy payment'}
                      </div>
                    </div>
                  </div>
                  {row.refund_id ? (
                    <div className="mt-3 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                      Refunded {formatMoney(row.refund_amount || row.amount, row.currency)} on {formatDate(row.refunded_at)}. Plex access should already be removed for this customer.
                    </div>
                  ) : row.source === 'ledger' ? (
                    <div className="mt-3 rounded-[20px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      PayPal captured this charge, but the website payment record did not finish linking. It is still visible here so you can trace it.
                    </div>
                  ) : !row.linked ? (
                    <div className="mt-3 rounded-[20px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      This payment is not linked to a customer record yet.
                    </div>
                  ) : row.legacy ? (
                    <div className="mt-3 rounded-[20px] border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-400">
                      Legacy row. Visible here, but refund button is unavailable because no PayPal capture was stored for this older payment.
                    </div>
                  ) : null}
                  {row.note ? (
                    <div className="mt-3 rounded-[20px] border border-white/8 bg-black/10 px-3 py-2 text-sm text-slate-300">
                      {row.note}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {row.customer_id ? (
                    <a href={`/admin/customers/${encodeURIComponent(row.customer_id)}/payments`} className="btn-xs-outline">
                      Customer history
                    </a>
                  ) : null}
                  <button
                    className={`btn-xs ${!row.refund_available ? 'opacity-50' : ''}`}
                    onClick={() => void refundPayment(row)}
                    disabled={!row.refund_available || busyId === row.id}
                  >
                    <Wallet size={14} />
                    {busyId === row.id ? 'Refunding...' : 'One-click refund'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-amber-300">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">What the refund button does</div>
            <div className="mt-1 text-sm leading-6 text-slate-400">
              It sends a full refund through PayPal for that captured payment, removes the customer&apos;s Plex share, and marks their account inactive. Legacy payments without a stored capture ID still show here, but they cannot use the one-click refund button.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
