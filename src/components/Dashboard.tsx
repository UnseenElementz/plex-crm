"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Ban } from 'lucide-react'
import CustomerForm from '@/components/CustomerForm'
import { calculatePrice, getStatus } from '@/lib/pricing'

type Plan = 'monthly' | 'yearly'
type SortKey = 'due-asc' | 'due-desc' | 'price-desc' | 'price-asc' | 'streams-desc' | 'streams-asc' | 'name-asc' | 'status'
type Customer = {
  id: string
  full_name?: string
  fullName?: string
  email: string
  plan: Plan
  streams: number
  start_date?: string
  startDate?: string
  next_due_date?: string
  nextDueDate?: string
  notes?: string
  plex_username?: string
  plex_username_source?: 'live' | 'saved' | null
  status?: 'active' | 'inactive'
  downloads?: boolean
  referral_code?: string
  referral_credit?: number
  referred_by?: string | null
  referral_count?: number
  referral_slots_used?: number
  referral_slots_max?: number
  terminate_at_plan_end?: boolean
  termination_scheduled_at?: string | null
}

const demo: Customer[] = [
  { id: '1', fullName: 'Alice', email: 'alice@example.com', plan: 'yearly', streams: 2, startDate: new Date().toISOString(), nextDueDate: new Date(new Date().setMonth(new Date().getMonth() + 11)).toISOString() },
  { id: '2', fullName: 'Bob', email: 'bob@example.com', plan: 'monthly', streams: 1, startDate: new Date().toISOString(), nextDueDate: new Date(new Date().setDate(new Date().getDate() + 10)).toISOString() },
  { id: '3', fullName: 'Carol', email: 'carol@example.com', plan: 'monthly', streams: 3, startDate: new Date().toISOString(), nextDueDate: new Date(new Date().setDate(new Date().getDate() - 3)).toISOString() },
]

function getCustomerName(customer: Customer) {
  return customer.full_name || customer.fullName || customer.email
}

function getCustomerDueDate(customer: Customer) {
  return customer.next_due_date || customer.nextDueDate || ''
}

function getCustomerDueTime(customer: Customer) {
  const due = getCustomerDueDate(customer)
  if (!due) return Number.POSITIVE_INFINITY
  const time = new Date(due).getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function getCustomerStatus(customer: Customer) {
  const dueDate = getCustomerDueDate(customer)
  return customer.status === 'inactive' ? 'Inactive' : dueDate ? getStatus(new Date(dueDate)) : 'Registered'
}

function getStatusRank(status: string) {
  if (status === 'Overdue') return 0
  if (status === 'Due Today') return 1
  if (status === 'Due Soon') return 2
  if (status === 'Active') return 3
  if (status === 'Registered') return 4
  return 5
}

export default function Dashboard() {
  const formModalRef = useRef<HTMLDivElement | null>(null)
  const actionModalRef = useRef<HTMLDivElement | null>(null)
  const actionModalPanelRef = useRef<HTMLDivElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Customer | null>(null)
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>(demo)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'stream-1' | 'stream-2' | 'stream-3plus' | 'overdue' | 'due-soon'>('all')
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('due-asc')
  const [actionItem, setActionItem] = useState<Customer | null>(null)
  const [sendMsg, setSendMsg] = useState('')
  const [linkingItem, setLinkingItem] = useState<Customer | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [referralLinkItem, setReferralLinkItem] = useState<Customer | null>(null)
  const [referralSearch, setReferralSearch] = useState('')
  const [linkingReferralBusy, setLinkingReferralBusy] = useState<string | null>(null)
  const [creditEditItem, setCreditEditItem] = useState<Customer | null>(null)
  const [creditInput, setCreditInput] = useState('')
  const [savingCredit, setSavingCredit] = useState(false)
  const [terminationBusyId, setTerminationBusyId] = useState<string | null>(null)
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false)
  const [accessCodeEmail, setAccessCodeEmail] = useState('')
  const [accessCodeLabel, setAccessCodeLabel] = useState('')
  const [creatingAccessCode, setCreatingAccessCode] = useState(false)
  const [createdAccessCode, setCreatedAccessCode] = useState('')
  const [createdAccessCodeLockedEmail, setCreatedAccessCodeLockedEmail] = useState('')
  const [manualBanEmail, setManualBanEmail] = useState('')
  const [manualBanBusy, setManualBanBusy] = useState(false)

  async function loadCustomers() {
    try {
      const res = await fetch('/api/customers', { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data)) setCustomers(data)
      else setCustomers([])
    } catch {
      setCustomers(demo)
    }
  }

  useEffect(() => {
    void loadCustomers()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (response.ok) {
          const json = await response.json()
          setPricingConfig(json)
        }
      } catch {}
    })()
  }, [])

  useEffect(() => {
    if (!showForm) return
    window.scrollTo({ top: 0, behavior: 'auto' })
    requestAnimationFrame(() => {
      formModalRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    })
  }, [showForm, editItem])

  useEffect(() => {
    if (!actionItem) return

    const scrollY = window.scrollY
    const bodyStyle = document.body.style
    const previousOverflow = bodyStyle.overflow
    const previousPosition = bodyStyle.position
    const previousTop = bodyStyle.top
    const previousWidth = bodyStyle.width

    bodyStyle.overflow = 'hidden'
    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${scrollY}px`
    bodyStyle.width = '100%'

    requestAnimationFrame(() => {
      actionModalRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      actionModalPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })

    return () => {
      bodyStyle.overflow = previousOverflow
      bodyStyle.position = previousPosition
      bodyStyle.top = previousTop
      bodyStyle.width = previousWidth
      window.scrollTo({ top: scrollY, behavior: 'auto' })
    }
  }, [actionItem])

  const handleEdit = (customer: Customer) => {
    setEditItem(customer)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditItem(null)
  }

  const handleCustomerSaved = async (_savedCustomer: Customer) => {
    await loadCustomers()
    handleFormClose()
  }

  const openCreditEditor = (customer: Customer) => {
    setActionItem(null)
    setCreditEditItem(customer)
    setCreditInput(Number(customer.referral_credit || 0).toFixed(2))
  }

  async function handleReferralLink(referrer: Customer) {
    if (!referralLinkItem || !referrer?.id) return
    setLinkingReferralBusy(referrer.id)
    setSendMsg('')
    try {
      const response = await fetch('/api/admin/customers/link-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: referralLinkItem.id,
          referrerCustomerId: referrer.id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to link referral')
        return
      }

      const rewardGranted = Boolean(data?.rewardGranted)
      const alreadyLinked = Boolean(data?.alreadyLinked)
      setSendMsg(
        rewardGranted
          ? `${getCustomerName(referralLinkItem)} linked to ${getCustomerName(referrer)}. Credit awarded: GBP 10.00. Slots now ${data?.referralCount || 0}/${data?.referralLimit || 8}.`
          : alreadyLinked
            ? `${getCustomerName(referralLinkItem)} is already linked to ${getCustomerName(referrer)}. No new credit was added.`
            : `${getCustomerName(referralLinkItem)} linked to ${getCustomerName(referrer)}.`
      )
      setReferralLinkItem(null)
      setReferralSearch('')
      await loadCustomers()
    } catch (error: any) {
      setSendMsg(error?.message || 'Failed to link referral')
    } finally {
      setLinkingReferralBusy(null)
    }
  }

  async function handleCreateAccessCode() {
    setCreatingAccessCode(true)
    setSendMsg('')
    try {
      const response = await fetch('/api/admin/community-access-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: accessCodeEmail.trim(),
          label: accessCodeLabel.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to create access code')
        return
      }

      setCreatedAccessCode(String(data?.code || ''))
      setCreatedAccessCodeLockedEmail(String(data?.lockedEmail || ''))
      setSendMsg(`Created one-time access code${data?.lockedEmail ? ` for ${data.lockedEmail}` : ''}.`)
    } catch (error: any) {
      setSendMsg(error?.message || 'Failed to create access code')
    } finally {
      setCreatingAccessCode(false)
    }
  }

  async function handleReferralUnlink(customer: Customer) {
    setSendMsg('')
    if (!customer.id) {
      setSendMsg('Customer account is missing an id')
      return
    }

    const confirmed = confirm(`Remove the referral link from ${getCustomerName(customer)}?`)
    if (!confirmed) return

    try {
      const response = await fetch('/api/admin/customers/unlink-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to remove referral link')
        return
      }

      setSendMsg(
        Number(data?.reversedCreditAmount || 0) > 0
          ? `${getCustomerName(customer)} was unlinked from their referral. Reversed GBP ${Number(data?.reversedCreditAmount || 0).toFixed(2)} from the referrer account.`
          : `${getCustomerName(customer)} was unlinked from their referral.`
      )
      await loadCustomers()
    } catch (error: any) {
      setSendMsg(error?.message || 'Failed to remove referral link')
    }
  }

  async function handleReferralCreditSave() {
    if (!creditEditItem?.id) {
      setSendMsg('Customer account is missing an id')
      return
    }

    const nextCredit = Math.max(0, Number(creditInput || 0))
    if (!Number.isFinite(nextCredit)) {
      setSendMsg('Referral credit must be a valid number')
      return
    }

    setSavingCredit(true)
    setSendMsg('')
    try {
      const response = await fetch('/api/admin/customers/update-referral-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: creditEditItem.id,
          credit: Number(nextCredit.toFixed(2)),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to update referral credit')
        return
      }

      setSendMsg(`${getCustomerName(creditEditItem)} referral credit updated to GBP ${Number(data?.referralCredit || 0).toFixed(2)}.`)
      setCreditEditItem(null)
      setCreditInput('')
      await loadCustomers()
    } catch (error: any) {
      setSendMsg(error?.message || 'Failed to update referral credit')
    } finally {
      setSavingCredit(false)
    }
  }

  async function handleCommunityTermination(customer: Customer, mode: 'plan_end' | 'instant') {
    const rowId = customer.id || customer.email
    const isScheduled = Boolean(customer.terminate_at_plan_end)
    const dueDate = getCustomerDueDate(customer)
    const dueLabel = dueDate ? format(new Date(dueDate), 'dd/MM/yyyy') : 'their due date'

    const confirmed =
      mode === 'plan_end'
        ? isScheduled
          ? confirm(`Cancel the end-of-plan termination for ${getCustomerName(customer)}?`)
          : confirm(`Mark ${getCustomerName(customer)} to terminate at plan end on ${dueLabel}? They will be sent to the closed community once the plan runs out.`)
        : confirm(`Instantly terminate ${getCustomerName(customer)} now? This will set them inactive, remove Plex access, and send them to the closed-community page.`)

    if (!confirmed) return

    setTerminationBusyId(rowId)
    setSendMsg('')
    try {
      const response = await fetch('/api/admin/customers/community-termination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          mode,
          enabled: mode === 'plan_end' ? !isScheduled : true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to update community termination')
        return
      }

      setActionItem(null)
      await loadCustomers()

      const emailNotice = data?.emailNotice
      const emailSuffix =
        emailNotice?.sent
          ? ' Termination email sent.'
          : emailNotice?.attempted && emailNotice?.error
            ? ` Termination email not sent: ${emailNotice.error}`
            : ''

      if (mode === 'plan_end') {
        setSendMsg(
          isScheduled
            ? `${getCustomerName(customer)} is no longer marked for end-of-plan termination.`
            : `${getCustomerName(customer)} is now marked to terminate at plan end. Once the plan runs out, they will be sent to the closed community.${emailSuffix}`
        )
      } else {
        setSendMsg(`${getCustomerName(customer)} was terminated immediately and moved to the closed community path.${emailSuffix}`)
      }
    } catch (error: any) {
      setSendMsg(error?.message || 'Failed to update community termination')
    } finally {
      setTerminationBusyId(null)
    }
  }

  const filteredCustomers = useMemo(() => {
    const searched = customers.filter((customer) => {
      const haystack = `${getCustomerName(customer)} ${customer.email} ${customer.plex_username || ''}`.toLowerCase()
      return haystack.includes(q.toLowerCase())
    })

    const list = (() => {
      switch (filter) {
        case 'stream-1':
          return searched.filter((customer) => Number(customer.streams) === 1)
        case 'stream-2':
          return searched.filter((customer) => Number(customer.streams) === 2)
        case 'stream-3plus':
          return searched.filter((customer) => Number(customer.streams) >= 3)
        case 'overdue':
          return searched.filter((customer) => {
            const due = getCustomerDueDate(customer)
            return due && getStatus(new Date(due)) === 'Overdue'
          })
        case 'due-soon':
          return searched.filter((customer) => {
            const due = getCustomerDueDate(customer)
            if (!due) return false
            const status = getStatus(new Date(due))
            return status === 'Due Soon' || status === 'Due Today'
          })
        default:
          return searched
      }
    })()

    const sorted = [...list].sort((left, right) => {
      const leftName = getCustomerName(left).toLowerCase()
      const rightName = getCustomerName(right).toLowerCase()
      const leftDue = getCustomerDueTime(left)
      const rightDue = getCustomerDueTime(right)
      const leftPrice = calculatePrice(left.plan, Number(left.streams || 1), pricingConfig, left.downloads)
      const rightPrice = calculatePrice(right.plan, Number(right.streams || 1), pricingConfig, right.downloads)
      const leftStreams = Number(left.streams || 0)
      const rightStreams = Number(right.streams || 0)
      const leftStatus = getCustomerStatus(left)
      const rightStatus = getCustomerStatus(right)

      if (sortBy === 'due-asc') {
        if (leftDue !== rightDue) return leftDue - rightDue
      }
      if (sortBy === 'due-desc') {
        if (leftDue !== rightDue) return rightDue - leftDue
      }
      if (sortBy === 'price-desc') {
        if (leftPrice !== rightPrice) return rightPrice - leftPrice
      }
      if (sortBy === 'price-asc') {
        if (leftPrice !== rightPrice) return leftPrice - rightPrice
      }
      if (sortBy === 'streams-desc') {
        if (leftStreams !== rightStreams) return rightStreams - leftStreams
      }
      if (sortBy === 'streams-asc') {
        if (leftStreams !== rightStreams) return leftStreams - rightStreams
      }
      if (sortBy === 'status') {
        const leftRank = getStatusRank(leftStatus)
        const rightRank = getStatusRank(rightStatus)
        if (leftRank !== rightRank) return leftRank - rightRank
        if (leftDue !== rightDue) return leftDue - rightDue
      }

      return leftName.localeCompare(rightName)
    })

    return sorted
  }, [customers, filter, q, sortBy, pricingConfig])

  const referralCandidates = useMemo(() => {
    if (!referralLinkItem) return []
    const query = referralSearch.trim().toLowerCase()

    return customers
      .filter((candidate) => candidate.id !== referralLinkItem.id)
      .filter((candidate) => {
        const haystack = `${getCustomerName(candidate)} ${candidate.email} ${candidate.plex_username || ''}`.toLowerCase()
        return !query || haystack.includes(query)
      })
      .sort((left, right) => {
        const leftSlots = Number(left.referral_slots_used || left.referral_count || 0)
        const rightSlots = Number(right.referral_slots_used || right.referral_count || 0)
        if (leftSlots !== rightSlots) return leftSlots - rightSlots
        return getCustomerName(left).localeCompare(getCustomerName(right))
      })
  }, [customers, referralLinkItem, referralSearch])

  const metrics = useMemo(() => {
    const totalCustomers = customers.length
    const oneStream = customers.filter((customer) => Number(customer.streams || 0) === 1).length
    const twoStreams = customers.filter((customer) => Number(customer.streams || 0) === 2).length
    const threePlusStreams = customers.filter((customer) => Number(customer.streams || 0) >= 3).length
    const totalStreams = customers.reduce((sum, customer) => sum + Number(customer.streams || 0), 0)
    const revenue = customers.reduce((sum, customer) => sum + calculatePrice(customer.plan, Number(customer.streams || 1), pricingConfig, customer.downloads), 0)
    const dueSoon = customers.filter((customer) => {
      const due = getCustomerDueDate(customer)
      if (!due) return false
      const status = getStatus(new Date(due))
      return status === 'Due Soon' || status === 'Due Today'
    }).length
    const dueToday = customers.filter((customer) => {
      const due = getCustomerDueDate(customer)
      return due && getStatus(new Date(due)) === 'Due Today'
    }).length
    const overdue = customers.filter((customer) => {
      const due = getCustomerDueDate(customer)
      return due && getStatus(new Date(due)) === 'Overdue'
    }).length

    const monthlyRevenue = customers.filter((customer) => customer.plan === 'monthly').reduce((sum, customer) => sum + calculatePrice(customer.plan, Number(customer.streams || 1), pricingConfig, customer.downloads), 0)
    const yearlyRevenue = customers.filter((customer) => customer.plan === 'yearly').reduce((sum, customer) => sum + calculatePrice(customer.plan, Number(customer.streams || 1), pricingConfig, customer.downloads), 0)
    const transactionFees = customers.reduce((sum, customer) => sum + (customer.plan === 'monthly' ? 0.3 : 0.3 * 12), 0)
    const netRevenue = revenue - transactionFees
    const maintenanceCost = pricingConfig?.monthly_maintenance ?? 140
    const profit = netRevenue - maintenanceCost

    return {
      totalCustomers,
      oneStream,
      twoStreams,
      threePlusStreams,
      totalStreams,
      revenue,
      dueSoon,
      dueToday,
      overdue,
      monthlyRevenue,
      yearlyRevenue,
      transactionFees,
      netRevenue,
      maintenanceCost,
      profit,
    }
  }, [customers, pricingConfig])

  return (
    <div className="max-w-7xl mx-auto grid gap-6">
      {showForm ? (
        <div ref={formModalRef} className="fixed inset-0 z-50 overflow-y-auto modal-backdrop px-4 pb-6 pt-8">
          <div className="glass mx-auto w-full max-w-2xl rounded-2xl border border-cyan-500/20 p-6 shadow-[0_32px_120px_rgba(8,145,178,0.22)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold gradient-text">{editItem ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={handleFormClose} className="text-slate-400 hover:text-cyan-400 transition-colors duration-200 p-2 rounded-lg hover:bg-slate-800/50">
                X
              </button>
            </div>
            <CustomerForm
              initial={editItem ? ({
                id: editItem.id,
                full_name: getCustomerName(editItem),
                email: editItem.email,
                plan: editItem.plan,
                streams: editItem.streams,
                start_date: editItem.start_date || editItem.startDate,
                next_due_date: getCustomerDueDate(editItem),
                notes: editItem.notes || '',
                plex_username: editItem.plex_username || '',
                status: editItem.status,
                downloads: editItem.downloads,
              } as any) : undefined}
              onSaved={handleCustomerSaved}
              onCancel={handleFormClose}
            />
          </div>
        </div>
      ) : null}

      {showAccessCodeModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto modal-backdrop px-4 pb-6 pt-8">
          <div className="glass mx-auto w-full max-w-xl rounded-2xl border border-cyan-500/20 p-6 shadow-[0_32px_120px_rgba(8,145,178,0.22)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Closed community access</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Generate one-time member code</h2>
              </div>
              <button
                className="btn-outline"
                onClick={() => {
                  setShowAccessCodeModal(false)
                  setAccessCodeEmail('')
                  setAccessCodeLabel('')
                  setCreatedAccessCode('')
                  setCreatedAccessCodeLockedEmail('')
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4 text-sm text-cyan-100">
              This creates a one-time signup code for private community access only. It does not attach a referral and it does not award any discount or credit.
            </div>

            <div className="mt-5 grid gap-4">
              <input
                className="input"
                placeholder="Approved email address (recommended)"
                type="email"
                value={accessCodeEmail}
                onChange={(event) => setAccessCodeEmail(event.target.value)}
              />
              <input
                className="input"
                placeholder="Label or note (optional)"
                value={accessCodeLabel}
                onChange={(event) => setAccessCodeLabel(event.target.value)}
              />
              <button className="btn" disabled={creatingAccessCode} onClick={() => void handleCreateAccessCode()}>
                {creatingAccessCode ? 'Generating...' : 'Generate access code'}
              </button>
            </div>

            {createdAccessCode ? (
              <div className="mt-5 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-200">One-time code</div>
                <div className="mt-3 text-3xl font-semibold tracking-[0.18em] text-white">{createdAccessCode}</div>
                <div className="mt-3 text-sm text-emerald-100/85">
                  {createdAccessCodeLockedEmail
                    ? `This code is locked to ${createdAccessCodeLockedEmail} and will burn after one successful signup.`
                    : 'This code is not email-locked and will burn after one successful signup.'}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {sendMsg ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${isStatusMessageError(sendMsg) ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'}`}>
          {sendMsg}
        </div>
      ) : null}

      <div className="grid md:grid-cols-3 gap-4">
        <Metric title="Total customers" value={metrics.totalCustomers} onClick={() => setFilter('all')} active={filter === 'all'} />
        <Metric title="Revenue estimate" value={`GBP ${metrics.revenue.toFixed(2)}`} onClick={() => setShowRevenueBreakdown(!showRevenueBreakdown)} active={showRevenueBreakdown} />
        <Metric title="Total streams" value={metrics.totalStreams} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Metric title="1 stream users" value={metrics.oneStream} onClick={() => setFilter(filter === 'stream-1' ? 'all' : 'stream-1')} active={filter === 'stream-1'} />
        <Metric title="2 stream users" value={metrics.twoStreams} onClick={() => setFilter(filter === 'stream-2' ? 'all' : 'stream-2')} active={filter === 'stream-2'} />
        <Metric title="3+ stream users" value={metrics.threePlusStreams} onClick={() => setFilter(filter === 'stream-3plus' ? 'all' : 'stream-3plus')} active={filter === 'stream-3plus'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Metric title="Due soon" value={`${metrics.dueSoon}${metrics.dueToday ? ` (${metrics.dueToday} today)` : ''}`} onClick={() => setFilter(filter === 'due-soon' ? 'all' : 'due-soon')} active={filter === 'due-soon'} />
        <Metric title="Overdue" value={metrics.overdue} onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')} active={filter === 'overdue'} />
      </div>

      <div className="glass p-6 rounded-2xl border border-fuchsia-500/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="eyebrow border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100">
              <Ban size={13} />
              Direct Email Ban
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">Blacklist an email before they become a customer</h3>
            <p className="mt-2 text-sm text-slate-400">
              Enter any email and it will be marked as a banned portal account immediately. If they try to register or sign in later, they will be sent to the ban page and their IP attempt will be logged and auto-blocked.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="input w-full sm:w-80"
              placeholder="blocked@example.com"
              type="email"
              value={manualBanEmail}
              onChange={(event) => setManualBanEmail(event.target.value)}
            />
            <button
              className="btn whitespace-nowrap"
              disabled={!manualBanEmail.trim() || manualBanBusy}
              onClick={() => void banEmailNow(manualBanEmail, setManualBanBusy, setSendMsg, setManualBanEmail, setCustomers)}
            >
              {manualBanBusy ? 'Banning...' : 'Ban Email'}
            </button>
          </div>
        </div>
      </div>

      {showRevenueBreakdown ? (
        <div className="glass p-6 rounded-2xl border border-emerald-500/20">
          <h3 className="text-xl font-semibold mb-4 text-emerald-400">Revenue Breakdown</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Monthly Revenue:</span>
                <span className="font-semibold text-emerald-400">GBP {metrics.monthlyRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Yearly Revenue:</span>
                <span className="font-semibold text-emerald-400">GBP {metrics.yearlyRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/50 pt-2">
                <span className="text-slate-200 font-medium">Gross Revenue:</span>
                <span className="font-bold text-emerald-300">GBP {metrics.revenue.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Transaction Fees:</span>
                <span className="text-rose-400">-GBP {metrics.transactionFees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Maintenance Cost:</span>
                <span className="text-rose-400">-GBP {metrics.maintenanceCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/50 pt-2">
                <span className="text-slate-200 font-medium">Net Profit:</span>
                <span className={`font-bold ${metrics.profit >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>GBP {metrics.profit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="glass p-6 rounded-2xl border border-cyan-500/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-4">
          <div>
            <h3 className="card-title">Accounts</h3>
            <div className="mt-1 text-sm text-slate-400">Revenue, renewals, customer actions, and Plex handoff on the same page.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="input w-full sm:w-72" placeholder="Search account..." value={q} onChange={(event) => setQ(event.target.value)} />
            <select className="input w-full sm:w-56" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
              <option value="due-asc">Due date first</option>
              <option value="status">Status priority</option>
              <option value="price-desc">Highest plan first</option>
              <option value="streams-desc">Most streams first</option>
              <option value="name-asc">Name A-Z</option>
              <option value="due-desc">Due date latest</option>
              <option value="price-asc">Lowest plan first</option>
              <option value="streams-asc">Fewest streams first</option>
            </select>
            <button
              className="btn-outline"
              onClick={() => {
                setShowAccessCodeModal(true)
                setCreatedAccessCode('')
                setCreatedAccessCodeLockedEmail('')
              }}
            >
              Generate access code
            </button>
            <button className="btn" onClick={() => { setEditItem(null); setShowForm(true) }}>Add customer</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-300 border-b border-slate-700/50">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email / Plex</th>
                <th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Streams</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Due</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => {
                const dueDate = getCustomerDueDate(customer)
                const price = calculatePrice(customer.plan, Number(customer.streams || 1), pricingConfig, customer.downloads)
                const status = getCustomerStatus(customer)
                const rowId = customer.id || customer.email
                return (
                  <tr key={rowId} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-all duration-200 group">
                    <td className="p-3">
                      <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">{getCustomerName(customer)}</div>
                    </td>
                    <td className="p-3 text-slate-400">
                      <div>{customer.email}</div>
                      {customer.plex_username ? (
                        <div className="flex flex-wrap items-center gap-2 text-slate-500 text-xs">
                          <span>Plex: {customer.plex_username}</span>
                          {customer.plex_username_source === 'live' ? (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200">
                              Live from Plex
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className={`text-xs ${customer.downloads ? 'text-emerald-300' : 'text-slate-500'}`}>
                        Downloads: {customer.downloads ? 'On' : 'Off'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2 py-1 text-cyan-200">
                          Referrals: {Number(customer.referral_slots_used || customer.referral_count || 0)}/{Number(customer.referral_slots_max || 8)}
                        </span>
                        <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                          Credit: GBP {Number(customer.referral_credit || 0).toFixed(2)}
                        </span>
                        {customer.terminate_at_plan_end ? (
                          <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-2 py-1 text-amber-200">
                            End of plan terminate
                          </span>
                        ) : null}
                      </div>
                      {customer.referred_by ? <div className="mt-1 text-[11px] text-violet-200">Referred by {customer.referred_by}</div> : null}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">{customer.plan}</span>
                    </td>
                    <td className="p-3 text-slate-400">{customer.streams}</td>
                    <td className="p-3 font-medium text-slate-200">GBP {price.toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`tag ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
                    </td>
                    <td className="p-3 text-slate-400">{dueDate ? format(new Date(dueDate), 'dd/MM/yyyy') : '-'}</td>
                    <td className="p-3">
                      <button className="btn-xs" onClick={() => setActionItem(customer)}>
                        Actions
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {actionItem ? (
        <div ref={actionModalRef} className="fixed inset-0 z-50 overflow-y-auto modal-backdrop px-4">
          <div className="flex min-h-full items-start justify-center py-8">
          <div ref={actionModalPanelRef} className="glass w-full max-w-4xl rounded-2xl border border-cyan-500/20 p-6 shadow-[0_32px_120px_rgba(8,145,178,0.22)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Customer actions</div>
                <div className="mt-2 text-2xl font-semibold text-white">{getCustomerName(actionItem)}</div>
                <div className="mt-1 text-sm text-slate-300">{actionItem.email}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2 py-1 text-cyan-200">
                    Referrals: {Number(actionItem.referral_slots_used || actionItem.referral_count || 0)}/{Number(actionItem.referral_slots_max || 8)}
                  </span>
                  <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                    Credit: GBP {Number(actionItem.referral_credit || 0).toFixed(2)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                    {getCustomerStatus(actionItem)}
                  </span>
                  {actionItem.terminate_at_plan_end ? (
                    <span className="rounded-full border border-amber-400/15 bg-amber-500/10 px-2 py-1 text-amber-200">
                      Ends at plan expiry
                    </span>
                  ) : null}
                </div>
              </div>
              <button className="btn-outline" onClick={() => setActionItem(null)}>
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <button className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/15" onClick={() => { setActionItem(null); handleEdit(actionItem) }}>
                <div className="text-sm font-semibold text-white">Edit customer</div>
                <div className="mt-1 text-xs text-slate-300">Open the full customer editor.</div>
              </button>
              <button className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-400/40 hover:bg-emerald-500/15" onClick={() => openCreditEditor(actionItem)}>
                <div className="text-sm font-semibold text-white">Edit referral credit</div>
                <div className="mt-1 text-xs text-slate-300">Set the exact GBP credit balance on this account.</div>
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" disabled={sendingEmail === actionItem.email} onClick={() => { setActionItem(null); void sendReminder(actionItem.email, setSendingEmail, setSendMsg) }}>
                <div className="text-sm font-semibold text-white">{sendingEmail === actionItem.email ? 'Sending reminder...' : 'Send reminder'}</div>
                <div className="mt-1 text-xs text-slate-400">Send the standard renewal reminder email.</div>
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" onClick={() => { setActionItem(null); void sendTranscode(actionItem.email, setSendingEmail, setSendMsg) }}>
                <div className="text-sm font-semibold text-white">Over stream warning</div>
                <div className="mt-1 text-xs text-slate-400">Send the stream-limit warning email.</div>
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" onClick={() => { setActionItem(null); setLinkingItem(actionItem); setLinkInput(actionItem.plex_username || '') }}>
                <div className="text-sm font-semibold text-white">Link Plex username</div>
                <div className="mt-1 text-xs text-slate-400">Set or correct the saved Plex username.</div>
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" onClick={() => { setActionItem(null); setReferralLinkItem(actionItem); setReferralSearch('') }}>
                <div className="text-sm font-semibold text-white">Link referral</div>
                <div className="mt-1 text-xs text-slate-400">Attach this account to an existing referrer.</div>
              </button>
              {actionItem.referred_by ? (
                <button className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-left transition hover:border-amber-400/40 hover:bg-amber-500/15" onClick={() => { setActionItem(null); void handleReferralUnlink(actionItem) }}>
                  <div className="text-sm font-semibold text-white">Remove referral link</div>
                  <div className="mt-1 text-xs text-amber-100/80">Detach this referral and reverse linked credit from the referrer.</div>
                </button>
              ) : null}
              <button className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/10 p-4 text-left transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/15" disabled={manualBanBusy} onClick={() => { setActionItem(null); void banEmailNow(actionItem.email, setManualBanBusy, setSendMsg, setManualBanEmail, setCustomers) }}>
                <div className="text-sm font-semibold text-white">{manualBanBusy ? 'Banning portal...' : 'Ban portal'}</div>
                <div className="mt-1 text-xs text-fuchsia-100/80">Block website and customer portal access for this email.</div>
              </button>
              <button
                className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-left transition hover:border-amber-400/40 hover:bg-amber-500/15"
                disabled={terminationBusyId === (actionItem.id || actionItem.email) || !getCustomerDueDate(actionItem) || String(actionItem.status || '').toLowerCase() === 'inactive'}
                onClick={() => void handleCommunityTermination(actionItem, 'plan_end')}
              >
                <div className="text-sm font-semibold text-white">
                  {terminationBusyId === (actionItem.id || actionItem.email)
                    ? 'Updating...'
                    : actionItem.terminate_at_plan_end
                      ? 'Cancel end-of-plan terminate'
                      : 'End of plan terminate'}
                </div>
                <div className="mt-1 text-xs text-amber-100/80">
                  {actionItem.terminate_at_plan_end
                    ? 'Remove the scheduled closed-community cutoff for this customer.'
                    : getCustomerDueDate(actionItem)
                      ? `Let the plan run, then move them to the closed community after ${format(new Date(getCustomerDueDate(actionItem)), 'dd/MM/yyyy')}.`
                      : 'This customer needs a due date before plan-end termination can be scheduled.'}
                </div>
              </button>
              <button
                className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-left transition hover:border-rose-400/40 hover:bg-rose-500/15"
                disabled={terminationBusyId === (actionItem.id || actionItem.email) || String(actionItem.status || '').toLowerCase() === 'inactive'}
                onClick={() => void handleCommunityTermination(actionItem, 'instant')}
              >
                <div className="text-sm font-semibold text-white">
                  {terminationBusyId === (actionItem.id || actionItem.email) ? 'Terminating...' : 'Instant terminate'}
                </div>
                <div className="mt-1 text-xs text-rose-100/80">Set inactive now, remove Plex access, and force the closed-community path immediately.</div>
              </button>
              <Link className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" href={`/admin/plex-tools?manageEmail=${encodeURIComponent(actionItem.email || '')}`} onClick={() => setActionItem(null)}>
                <div className="text-sm font-semibold text-white">Manage Plex</div>
                <div className="mt-1 text-xs text-slate-400">Open Plex tools filtered to this customer.</div>
              </Link>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" disabled={sendingEmail === actionItem.email} onClick={() => { setActionItem(null); void sendTwoYears(actionItem.email, setSendingEmail, setSendMsg) }}>
                <div className="text-sm font-semibold text-white">{sendingEmail === actionItem.email ? 'Sending...' : 'Send 2 years email'}</div>
                <div className="mt-1 text-xs text-slate-400">Send the two-year offer email.</div>
              </button>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/10" disabled={sendingEmail === actionItem.email} onClick={() => { setActionItem(null); void sendSignedUp(actionItem.email, setSendingEmail, setSendMsg) }}>
                <div className="text-sm font-semibold text-white">{sendingEmail === actionItem.email ? 'Sending...' : 'Send signed up email'}</div>
                <div className="mt-1 text-xs text-slate-400">Send the signed-up confirmation email.</div>
              </button>
              <button className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-left transition hover:border-rose-400/40 hover:bg-rose-500/15" disabled={deletingId === (actionItem.id || actionItem.email)} onClick={() => { setActionItem(null); setPendingDelete(actionItem) }}>
                <div className="text-sm font-semibold text-white">{deletingId === (actionItem.id || actionItem.email) ? 'Deleting...' : 'Delete customer'}</div>
                <div className="mt-1 text-xs text-rose-100/80">Permanently remove this customer record.</div>
              </button>
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {creditEditItem ? (
        <div className="fixed inset-0 z-50 overflow-y-auto modal-backdrop px-4 pb-6 pt-8">
          <div className="glass mx-auto w-full max-w-md rounded-2xl border border-emerald-500/20 p-6 shadow-[0_32px_120px_rgba(16,185,129,0.18)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-200">Referral credit</div>
                <div className="mt-2 text-xl font-semibold text-white">Edit credit for {getCustomerName(creditEditItem)}</div>
              </div>
              <button className="btn-outline" onClick={() => { setCreditEditItem(null); setCreditInput('') }}>
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Current balance: GBP {Number(creditEditItem.referral_credit || 0).toFixed(2)}
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Set new balance</label>
              <input
                className="input w-full"
                type="number"
                min="0"
                step="0.01"
                value={creditInput}
                onChange={(event) => setCreditInput(event.target.value)}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => { setCreditEditItem(null); setCreditInput('') }}>
                Cancel
              </button>
              <button className="btn" disabled={savingCredit} onClick={() => void handleReferralCreditSave()}>
                {savingCredit ? 'Saving...' : 'Save credit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-6 rounded-2xl w-full max-w-md border border-rose-500/30">
            <div className="text-lg font-semibold text-slate-200 mb-2">Delete customer?</div>
            <div className="text-slate-400 text-sm mb-4">This action cannot be undone.</div>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="btn" onClick={() => void confirmDelete(pendingDelete, setDeletingId, setPendingDelete, setCustomers, setSendMsg)}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {linkingItem ? (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-6 rounded-2xl w-full max-w-md border border-cyan-500/30">
            <div className="text-lg font-semibold text-slate-200 mb-2">Link Plex Username</div>
            <div className="text-slate-400 text-sm mb-4">Enter the Plex username to link to this customer.</div>
            <input className="input w-full mb-4" placeholder="Plex Username" value={linkInput} onChange={(event) => setLinkInput(event.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => { setLinkingItem(null); setLinkInput('') }}>Cancel</button>
              <button className="btn" onClick={() => void saveLink(linkingItem, linkInput, setCustomers, setSendMsg, setLinkingItem)}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {referralLinkItem ? (
        <div className="fixed inset-0 z-50 overflow-y-auto modal-backdrop px-4 pb-6 pt-8">
          <div className="glass mx-auto w-full max-w-3xl rounded-2xl border border-cyan-500/30 p-6 shadow-[0_32px_120px_rgba(8,145,178,0.22)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Manual referral link</div>
                <div className="mt-2 text-xl font-semibold text-white">Link referral for {getCustomerName(referralLinkItem)}</div>
                <div className="mt-2 max-w-2xl text-sm text-slate-400">
                  Click the existing customer who should receive this referral. The reward is credited immediately, the customer gets the email notification, and their referral tracker updates automatically.
                </div>
              </div>
              <button className="btn-outline" onClick={() => { setReferralLinkItem(null); setReferralSearch('') }}>
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
              <div className="rounded-[24px] border border-cyan-400/15 bg-cyan-400/8 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-200">Selected customer</div>
                <div className="mt-3 text-lg font-semibold text-white">{getCustomerName(referralLinkItem)}</div>
                <div className="mt-1 text-sm text-slate-300">{referralLinkItem.email}</div>
                {referralLinkItem.plex_username ? <div className="mt-1 text-xs text-slate-400">Plex: {referralLinkItem.plex_username}</div> : null}
                <div className="mt-4 rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-300">
                  Their account will be linked to the referrer you click on the right.
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
                <input
                  className="input"
                  placeholder="Search by name, email, or Plex username"
                  value={referralSearch}
                  onChange={(event) => setReferralSearch(event.target.value)}
                />

                <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-[20px] border border-white/8">
                  {referralCandidates.map((candidate) => {
                    const slotsUsed = Number(candidate.referral_slots_used || candidate.referral_count || 0)
                    const slotLimit = Number(candidate.referral_slots_max || 8)
                    const slotsFull = slotsUsed >= slotLimit
                    const busy = linkingReferralBusy === candidate.id

                    return (
                      <button
                        key={candidate.id}
                        className="flex w-full flex-col gap-2 border-b border-white/6 px-4 py-4 text-left transition hover:bg-white/5 last:border-b-0 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy || slotsFull}
                        onClick={() => void handleReferralLink(candidate)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{getCustomerName(candidate)}</div>
                            <div className="mt-1 text-xs text-slate-400">{candidate.email}</div>
                            {candidate.plex_username ? <div className="mt-1 text-[11px] text-slate-500">Plex: {candidate.plex_username}</div> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-200">
                              {slotsUsed}/{slotLimit}
                            </span>
                            <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                              GBP {Number(candidate.referral_credit || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {busy ? 'Linking referral and crediting GBP 10.00...' : slotsFull ? 'Referral limit reached for this customer.' : 'Click to link and apply the GBP 10.00 reward now.'}
                        </div>
                      </button>
                    )
                  })}

                  {!referralCandidates.length ? <div className="p-4 text-sm text-slate-500">No matching customers found.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function isStatusMessageError(message: string) {
  const normalized = String(message || '').trim().toLowerCase()
  if (!normalized) return false
  return [
    'failed',
    'error',
    'not configured',
    'unauthorized',
    'forbidden',
    'already',
    'cannot',
    'required',
    'not found',
    'inactive',
    'limit reached',
  ].some((term) => normalized.includes(term))
}

function Metric({ title, value, onClick, active }: { title: string; value: number | string; onClick?: () => void; active?: boolean }) {
  return (
    <div
      className={`glass p-6 rounded-2xl border transition-all duration-300 group hover:scale-[1.02] cursor-pointer ${
        active ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-cyan-500/10 hover:border-cyan-500/30'
      }`}
      onClick={onClick}
    >
      <div className="text-slate-400 text-sm font-medium mb-2">{title}</div>
      <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{value}</div>
    </div>
  )
}

async function sendReminder(email: string, setSendingEmail: (value: string | null) => void, setSendMsg: (value: string) => void) {
  try {
    setSendingEmail(email)
    setSendMsg('Sending reminder...')
    const response = await fetch('/api/reminders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json()
    if (!response.ok) {
      const errorMsg = data?.error || 'Unknown error'
      setSendMsg(errorMsg.includes('SMTP not configured') ? 'Email service not configured. Please contact admin.' : `Failed: ${errorMsg}`)
    } else {
      setSendMsg('Reminder sent successfully!')
    }
  } catch (e: any) {
    setSendMsg(`Failed: ${e?.message || 'Network error'}`)
  } finally {
    setSendingEmail(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function sendTranscode(email: string, setSendingEmail: (value: string | null) => void, setSendMsg: (value: string) => void) {
  try {
    setSendingEmail(email)
    setSendMsg('Sending over-stream warning...')
    const response = await fetch('/api/warnings/transcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json()
    if (!response.ok) {
      const errorMsg = data?.error || 'Unknown error'
      setSendMsg(errorMsg.includes('SMTP not configured') ? 'Email service not configured. Please contact admin.' : `Failed: ${errorMsg}`)
    } else {
      setSendMsg('Over-stream warning sent successfully!')
    }
  } catch (e: any) {
    setSendMsg(`Failed: ${e?.message || 'Network error'}`)
  } finally {
    setSendingEmail(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function sendSignedUp(email: string, setSendingEmail: (value: string | null) => void, setSendMsg: (value: string) => void) {
  try {
    setSendingEmail(email)
    setSendMsg('Sending setup instructions...')
    const response = await fetch('/api/onboarding/signed-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const errorMsg = data?.error || 'Unknown error'
      setSendMsg(String(errorMsg).includes('SMTP not configured') ? 'Email service not configured. Please contact admin.' : `Failed: ${errorMsg}`)
    } else {
      setSendMsg('Setup email sent successfully!')
    }
  } catch (e: any) {
    setSendMsg(`Failed: ${e?.message || 'Network error'}`)
  } finally {
    setSendingEmail(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function sendTwoYears(email: string, setSendingEmail: (value: string | null) => void, setSendMsg: (value: string) => void) {
  try {
    setSendingEmail(email)
    setSendMsg('Sending service update...')
    const response = await fetch('/api/admin/email/two-years', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const errorMsg = data?.error || 'Unknown error'
      setSendMsg(String(errorMsg).includes('SMTP not configured') ? 'Email service not configured. Please contact admin.' : `Failed: ${errorMsg}`)
    } else {
      setSendMsg('Service update sent successfully!')
    }
  } catch (e: any) {
    setSendMsg(`Failed: ${e?.message || 'Network error'}`)
  } finally {
    setSendingEmail(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function confirmDelete(item: Customer, setDeletingId: (value: string | null) => void, setPendingDelete: (value: Customer | null) => void, setCustomers: (updater: (previous: Customer[]) => Customer[]) => void, setSendMsg: (value: string) => void) {
  try {
    const rowId = item.id || item.email
    setDeletingId(rowId)
    if (item.id) {
      const response = await fetch(`/api/customers/${item.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendMsg(data?.error || 'Failed to delete')
        return
      }
    }
    setCustomers((previous) => previous.filter((customer) => (customer.id || customer.email) !== rowId))
    setSendMsg('Customer deleted')
  } catch (e: any) {
    setSendMsg(e?.message || 'Network error')
  } finally {
    setDeletingId(null)
    setPendingDelete(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function saveLink(item: Customer, username: string, setCustomers: (updater: (previous: Customer[]) => Customer[]) => void, setSendMsg: (value: string) => void, setLinkingItem: (value: Customer | null) => void) {
  try {
    const cleanUsername = String(username || '').trim()
    const response = await fetch(`/api/customers/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plex_username: cleanUsername }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSendMsg(data?.error || 'Failed to link')
      return
    }
    setCustomers((previous) =>
      previous.map((customer) =>
        customer.id === item.id ? { ...customer, plex_username: cleanUsername, plex_username_source: 'saved' } : customer
      )
    )
    setSendMsg('Plex username linked')
  } catch (e: any) {
    setSendMsg(e?.message || 'Network error')
  } finally {
    setLinkingItem(null)
    setTimeout(() => setSendMsg(''), 5000)
  }
}

async function banEmailNow(
  email: string,
  setBusy: (value: boolean) => void,
  setSendMsg: (value: string) => void,
  setManualBanEmail: (value: string) => void,
  setCustomers: (value: Customer[]) => void
) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    setSendMsg('Failed: enter a valid email address')
    return
  }
  if (!confirm(`Ban ${cleanEmail} from the website and customer portal?`)) return

  try {
    setBusy(true)
    setSendMsg('Applying email ban...')

    const response = await fetch('/api/admin/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'time_waster_ban',
        customerEmail: cleanEmail,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSendMsg(data?.error || 'Failed: could not ban email')
      return
    }

    const refresh = await fetch('/api/customers')
    const refreshed = await refresh.json().catch(() => [])
    if (refresh.ok && Array.isArray(refreshed)) {
      setCustomers(refreshed)
    }

    setManualBanEmail('')
    setSendMsg(`${cleanEmail} is now banned. Any future login or registration attempt will be tracked and blocked.`)
  } catch (e: any) {
    setSendMsg(`Failed: ${e?.message || 'Network error'}`)
  } finally {
    setBusy(false)
    setTimeout(() => setSendMsg(''), 5000)
  }
}
