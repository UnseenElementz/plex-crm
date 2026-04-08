'use client'

import { useEffect, useState } from 'react'

type BannedCustomer = {
  email: string
  name: string
  banned_at: string
  reason: string
  warning_count: number
}

export default function AdminSecurityPage() {
  const [ipLogs, setIpLogs] = useState<Record<string, string[]>>({})
  const [blocked, setBlocked] = useState<string[]>([])
  const [bannedCustomers, setBannedCustomers] = useState<BannedCustomer[]>([])
  const [blockInput, setBlockInput] = useState('')
  const [msg, setMsg] = useState('')
  const [busyKey, setBusyKey] = useState('')

  async function load() {
    try {
      const r = await fetch('/api/admin/security/ips', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to load security data')
        return
      }
      setIpLogs(j.ip_logs || {})
      setBlocked(j.blocked_ips || [])
      setBannedCustomers(Array.isArray(j.banned_customers) ? j.banned_customers : [])
    } catch {
      setMsg('Failed to load security data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function block(ip: string) {
    const cleanIp = String(ip || '').trim()
    if (!cleanIp) return
    setBusyKey(`block:${cleanIp}`)
    setMsg('')
    try {
      const r = await fetch('/api/admin/security/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: cleanIp }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to block IP')
        return
      }
      setBlocked(j.blocked_ips || [])
      setBlockInput('')
    } catch (e: any) {
      setMsg(e?.message || 'Failed to block IP')
    } finally {
      setBusyKey('')
    }
  }

  async function unblock(ip: string) {
    setBusyKey(`unblock:${ip}`)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/security/block?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to unblock IP')
        return
      }
      setBlocked(j.blocked_ips || [])
    } catch (e: any) {
      setMsg(e?.message || 'Failed to unblock IP')
    } finally {
      setBusyKey('')
    }
  }

  async function unban(email: string) {
    setBusyKey(`unban:${email}`)
    setMsg('')
    try {
      const r = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban', customerEmail: email }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setMsg(j?.error || 'Failed to unban customer')
        return
      }
      await load()
    } catch (e: any) {
      setMsg(e?.message || 'Failed to unban customer')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold gradient-text">Security</h2>
          <p className="mt-2 text-sm text-slate-400">Review seen IPs, blocked addresses, and banned customer access in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={load}>
            Refresh
          </button>
          <a href="/admin" className="btn-outline">
            Back to Admin
          </a>
        </div>
      </div>

      {msg ? <div className="glass mb-4 rounded-2xl p-3 text-sm text-rose-300">{msg}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="card-solid rounded-2xl border border-cyan-500/20 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="card-title">Seen IPs</h3>
              <div className="text-xs text-slate-500">{Object.keys(ipLogs).length} customers tracked</div>
            </div>
            <div className="mt-4 space-y-3 max-h-[56vh] overflow-auto">
              {Object.keys(ipLogs).length === 0 ? <div className="text-sm text-slate-400">No IP activity recorded yet.</div> : null}
              {Object.entries(ipLogs).map(([email, ips]) => (
                <div key={email} className="rounded-[22px] border border-slate-700/70 bg-slate-950/30 p-3">
                  <div className="text-sm font-medium text-slate-200">{email || '(unknown user)'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ips.map((ip) => (
                      <div key={ip} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                        <span>{ip}</span>
                        {blocked.includes(ip) ? (
                          <button className="btn-xs-outline" onClick={() => unblock(ip)} disabled={busyKey === `unblock:${ip}`}>
                            {busyKey === `unblock:${ip}` ? '...' : 'Unblock'}
                          </button>
                        ) : (
                          <button className="btn-xs-outline" onClick={() => block(ip)} disabled={busyKey === `block:${ip}`}>
                            {busyKey === `block:${ip}` ? '...' : 'Block'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-solid rounded-2xl border border-rose-500/20 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="card-title">Banned Customers</h3>
              <div className="text-xs text-slate-500">{bannedCustomers.length} active bans</div>
            </div>
            <div className="mt-4 space-y-3">
              {bannedCustomers.length === 0 ? <div className="text-sm text-slate-400">No customer bans are active.</div> : null}
              {bannedCustomers.map((customer) => (
                <div key={customer.email} className="rounded-[22px] border border-rose-500/15 bg-rose-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{customer.name}</div>
                      <div className="mt-1 text-sm text-slate-400">{customer.email}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">
                        Warnings: {Math.min(customer.warning_count || 0, 3)}/3
                      </div>
                    </div>
                    <button
                      className="btn-xs-outline"
                      onClick={() => unban(customer.email)}
                      disabled={busyKey === `unban:${customer.email}`}
                    >
                      {busyKey === `unban:${customer.email}` ? 'Unbanning...' : 'Unban'}
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">{customer.reason || 'Terms of service breach'}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Banned: {customer.banned_at ? new Date(customer.banned_at).toLocaleString() : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-solid rounded-2xl border border-cyan-500/20 p-6">
            <h3 className="card-title">Blocked IPs</h3>
            <div className="mt-4 flex gap-2">
              <input className="input flex-1" placeholder="IP to block" value={blockInput} onChange={(e) => setBlockInput(e.target.value)} />
              <button className="btn" onClick={() => block(blockInput)} disabled={!blockInput.trim() || busyKey === `block:${blockInput.trim()}`}>
                Add
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {blocked.map((ip) => (
                <div key={ip} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  <span>{ip}</span>
                  <button className="btn-xs-outline" onClick={() => unblock(ip)} disabled={busyKey === `unblock:${ip}`}>
                    {busyKey === `unblock:${ip}` ? '...' : 'Remove'}
                  </button>
                </div>
              ))}
              {blocked.length === 0 ? <div className="text-sm text-slate-400">No blocked IPs.</div> : null}
            </div>
          </div>

          <div className="card-solid rounded-2xl border border-cyan-500/20 p-6">
            <h3 className="card-title">Moderation Notes</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Warnings stop active playback immediately, log the strike, and email the customer with their current warning count.</p>
              <p>Bans block portal access, stop active sessions, and can be reversed here without touching the rest of the account manually.</p>
              <p>IP blocking stays separate, so you can lift a network block without removing a customer ban if you need to.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
