"use client"
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CustomerForm from '@/components/CustomerForm'
import { calculatePrice, getStatus } from '@/lib/pricing'

type Plan = 'monthly' | 'yearly'
type Customer = { id: string; fullName: string; email: string; plan: Plan; streams: number; startDate: string; nextDueDate: string; notes?: string }

const demo: Customer[] = [
  { id:'1', fullName:'Alice', email:'alice@example.com', plan:'yearly', streams:2, startDate:new Date().toISOString(), nextDueDate:new Date(new Date().setMonth(new Date().getMonth()+11)).toISOString() },
  { id:'2', fullName:'Bob', email:'bob@example.com', plan:'monthly', streams:1, startDate:new Date().toISOString(), nextDueDate:new Date(new Date().setDate(new Date().getDate()+10)).toISOString() },
  { id:'3', fullName:'Carol', email:'carol@example.com', plan:'monthly', streams:3, startDate:new Date().toISOString(), nextDueDate:new Date(new Date().setDate(new Date().getDate()-3)).toISOString() }
]

export default function Dashboard(){
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [customers, setCustomers] = useState<any[]>(demo)
  const [pendingDelete, setPendingDelete] = useState<any | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'monthly' | 'yearly' | 'overdue' | 'due-soon'>('all')
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false)
  const [pricingConfig, setPricingConfig] = useState<any>(null)

  useEffect(()=>{ (async()=>{ try{ const res = await fetch('/api/customers'); const data = await res.json(); if (Array.isArray(data)) setCustomers(data); else setCustomers([]) } catch(e){ setCustomers(demo) } })() }, [])
  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/admin/settings', { cache: 'no-store' }); if (r.ok){ const j = await r.json(); setPricingConfig(j) } } catch{} })() }, [])
  
  const handleEdit = (customer: any) => {
    setEditItem(customer)
    setShowForm(true)
  }

  const handleSendReminder = async (email: string) => {
    try {
      setSendingEmail(email)
      const res = await fetch('/api/reminders/send', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email }) 
      })
      const data = await res.json()
      if (!res.ok) {
        const errorMsg = data?.error || 'Failed to send reminder'
        if (errorMsg.includes('SMTP not configured')) {
          alert('Reminder feature is not available. SMTP email service needs to be configured in the admin settings.')
        } else {
          alert(`Failed to send reminder: ${errorMsg}`)
        }
        console.error('Failed to send reminder:', errorMsg)
      } else {
        alert('Reminder sent successfully!')
      }
    } catch (error) {
      console.error('Error sending reminder:', error)
      alert('Network error: Could not send reminder. Please try again.')
    } finally {
      setSendingEmail(null)
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditItem(null)
  }

  const handleCustomerSaved = (savedCustomer: any) => {
    setCustomers(prev => {
      const key = (x: any) => x.id || x.email
      const idx = prev.findIndex(x => key(x) === key(savedCustomer))
      if (idx >= 0) { const next = [...prev]; next[idx] = savedCustomer; return next }
      return [savedCustomer, ...prev]
    })
    handleFormClose()
  }

  const confirmDelete = async (customer: any) => {
    const idOrEmail = customer.id || customer.email
    setDeletingId(idOrEmail)
    setPendingDelete(null)
    setCustomers(prev => prev.filter(c => (c.id || c.email) !== idOrEmail))
    try {
      if (customer.id) {
        const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' })
        await res.json().catch(()=>null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const filteredCustomers = useMemo(() => {
    switch (filter) {
      case 'monthly':
        return customers.filter(c => c.plan === 'monthly')
      case 'yearly':
        return customers.filter(c => c.plan === 'yearly')
      case 'overdue':
        return customers.filter(c => getStatus(new Date(c.next_due_date || c.nextDueDate)) === 'Overdue')
      case 'due-soon':
        return customers.filter(c => getStatus(new Date(c.next_due_date || c.nextDueDate)) === 'Due Soon')
      default:
        return customers
    }
  }, [customers, filter])

  const metrics = useMemo(()=>{
    const totalCustomers = customers.length
    const monthly = customers.filter(d=>d.plan==='monthly').length
    const yearly = customers.filter(d=>d.plan==='yearly').length
    const totalStreams = customers.reduce((acc,d)=>acc+d.streams,0)
    const revenue = customers.reduce((acc,d)=>acc+calculatePrice(d.plan,d.streams,pricingConfig),0)
    const dueSoon = customers.filter(d=>getStatus(new Date(d.next_due_date || d.nextDueDate))==='Due Soon').length
    const overdue = customers.filter(d=>getStatus(new Date(d.next_due_date || d.nextDueDate))==='Overdue').length
    
    // Calculate detailed breakdown
    const monthlyRevenue = customers.filter(c => c.plan === 'monthly').reduce((acc, c) => acc + calculatePrice(c.plan, c.streams, pricingConfig), 0)
    const yearlyRevenue = customers.filter(c => c.plan === 'yearly').reduce((acc, c) => acc + calculatePrice(c.plan, c.streams, pricingConfig), 0)
    const transactionFees = customers.reduce((acc, c) => acc + (c.plan === 'monthly' ? 0.30 : 0.30 * 12), 0) // Assuming £0.30 per transaction
    const netRevenue = revenue - transactionFees
    const maintenanceCost = (pricingConfig?.monthly_maintenance ?? 140)
    const profit = netRevenue - maintenanceCost
    
    return { 
      totalCustomers, 
      monthly, 
      yearly, 
      totalStreams, 
      revenue, 
      dueSoon, 
      overdue,
      monthlyRevenue,
      yearlyRevenue,
      transactionFees,
      netRevenue,
      maintenanceCost,
      profit
    }
  }, [customers, pricingConfig])

  return (
    <div className="max-w-7xl mx-auto grid gap-6">
      {showForm && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-6 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-cyan-500/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold gradient-text">{editItem ? 'Edit Customer' : 'Add Customer'}</h2>
              <button 
                onClick={handleFormClose}
                className="text-slate-400 hover:text-cyan-400 transition-colors duration-200 p-2 rounded-lg hover:bg-slate-800/50"
              >
                ✕
              </button>
            </div>
            <CustomerForm 
              initial={editItem ? (editItem.full_name ? editItem : {
                id: editItem.id,
                full_name: editItem.fullName,
                email: editItem.email,
                plan: editItem.plan,
                streams: editItem.streams,
                start_date: editItem.startDate,
                next_due_date: editItem.nextDueDate,
                notes: editItem.notes
              }) : undefined}
              onSaved={handleCustomerSaved}
              onCancel={handleFormClose}
            />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Metric 
          title="Total customers" 
          value={metrics.totalCustomers} 
          onClick={() => setFilter('all')}
          active={filter === 'all'}
        />
        <Metric 
          title="Revenue estimate" 
          value={`£${metrics.revenue.toFixed(2)}`} 
          onClick={() => setShowRevenueBreakdown(!showRevenueBreakdown)}
          active={showRevenueBreakdown}
        />
        <Metric title="Total streams" value={metrics.totalStreams} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Metric 
          title="Monthly" 
          value={metrics.monthly} 
          onClick={() => setFilter(filter === 'monthly' ? 'all' : 'monthly')}
          active={filter === 'monthly'}
        />
        <Metric 
          title="Yearly" 
          value={metrics.yearly} 
          onClick={() => setFilter(filter === 'yearly' ? 'all' : 'yearly')}
          active={filter === 'yearly'}
        />
        <Metric 
          title="Due soon / Overdue" 
          value={`${metrics.dueSoon} / ${metrics.overdue}`} 
          onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
          active={filter === 'overdue'}
        />
      </div>

      {showRevenueBreakdown && (
        <div className="glass p-6 rounded-2xl border border-emerald-500/20">
          <h3 className="text-xl font-semibold mb-4 text-emerald-400">Revenue Breakdown</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Monthly Revenue:</span>
                <span className="font-semibold text-emerald-400">£{metrics.monthlyRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Yearly Revenue:</span>
                <span className="font-semibold text-emerald-400">£{metrics.yearlyRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/50 pt-2">
                <span className="text-slate-200 font-medium">Gross Revenue:</span>
                <span className="font-bold text-emerald-300">£{metrics.revenue.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Transaction Fees:</span>
                <span className="text-rose-400">-£{metrics.transactionFees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Maintenance Cost:</span>
                <span className="text-rose-400">-£{metrics.maintenanceCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/50 pt-2">
                <span className="text-slate-200 font-medium">Net Profit:</span>
                <span className={`font-bold ${metrics.profit >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  £{metrics.profit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="glass p-6 rounded-2xl border border-cyan-500/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title">Customers</h3>
          <button
            className="btn"
            onClick={() => { setEditItem(null); setShowForm(true) }}
          >
            Add customer
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-300 border-b border-slate-700/50">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Streams</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c=>{
                const price = calculatePrice(c.plan, c.streams, pricingConfig)
                const status = getStatus(new Date(c.next_due_date || c.nextDueDate))
                return (
                  <tr key={c.id || c.email} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-all duration-200 group">
                    <td className="p-3">
                      <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                        {c.full_name || c.fullName}
                      </div>
                    </td>
                    <td className="p-3 text-slate-400">{c.email}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">
                        {c.plan}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{c.streams}</td>
                    <td className="p-3 font-medium text-slate-200">£{price.toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`tag ${status.toLowerCase().replace(' ','-')}`}>
                        {status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button 
                          className="btn-xs transform hover:scale-105 transition-transform" 
                          onClick={() => handleEdit(c)}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-xs-outline transform hover:scale-105 transition-transform" 
                          disabled={sendingEmail === c.email}
                          onClick={() => handleSendReminder(c.email)}
                        >
                          {sendingEmail === c.email ? 'Sending...' : 'Send reminder'}
                        </button>
                        <button 
                          className="btn-xs-outline transform hover:scale-105 transition-transform" 
                          disabled={deletingId === (c.id || c.email)}
                          onClick={() => setPendingDelete(c)}
                        >
                          {deletingId === (c.id || c.email) ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {pendingDelete && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass p-6 rounded-2xl w-full max-w-md border border-rose-500/30">
            <div className="text-lg font-semibold text-slate-200 mb-2">Delete customer?</div>
            <div className="text-slate-400 text-sm mb-4">This action cannot be undone.</div>
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={()=>setPendingDelete(null)}>Cancel</button>
              <button className="btn" onClick={()=>confirmDelete(pendingDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ title, value, onClick, active }: { title: string; value: number | string; onClick?: () => void; active?: boolean }){
  return (
    <div 
      className={`glass p-6 rounded-2xl border transition-all duration-300 group hover:scale-105 cursor-pointer ${
        active 
          ? 'border-emerald-500/50 bg-emerald-500/10' 
          : 'border-cyan-500/10 hover:border-cyan-500/30'
      }`}
      onClick={onClick}
    >
      <div className="text-slate-400 text-sm font-medium mb-2">{title}</div>
      <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-blue-300 transition-all duration-300">
        {value}
      </div>
    </div>
  )
}
