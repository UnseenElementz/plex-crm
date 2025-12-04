'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'

type Update = { id?: string; title: string; content: string; created_at: string }

export default function CustomerServiceUpdatesPage() {
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function renderContent(content: string){
    const normalized = (content || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
    const parts = normalized.split(/\n{2,}/).map(s=> s.trim()).filter(Boolean)
    return parts.map((p, i)=> (
      <p key={i} className="text-slate-300 text-sm mb-2">{p}</p>
    ))
  }

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/admin/service-updates')
        const data = await res.json().catch(()=>({ updates: [] }))
        if (!res.ok) throw new Error(data?.error || 'Failed to load updates')
        setUpdates(Array.isArray(data.updates) ? data.updates : [])
      } catch(e:any){ setError(e?.message || 'Failed to load updates') }
      finally{ setLoading(false) }
    })()
  }, [])

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <div className="mb-4">
          <a href="/customer" className="btn-outline" data-no-prefetch>Back</a>
        </div>
        <h2 className="text-2xl font-semibold mb-4">Service Updates</h2>
        {loading && (<div className="text-slate-400">Loading updates...</div>)}
        {!loading && error && (<div className="text-rose-400">{error}</div>)}
        {!loading && !error && (
          <div className="space-y-4">
            {updates.length === 0 ? (
              <div className="space-y-4 text-slate-300">
                <p>Hello,</p>
                <p>
                  If you purchased a lifetime plan in the past, we’re unfortunately only able to honor the lifetime deal for up to 2.5 years. With Unseen away and rising data center costs, we are unable to extend the lifetime offer further.
                </p>
                <p>
                  The price you paid for the 2.5 years, along with all the movies you’ve saved, still represents great savings.
                </p>
                <p>Currently, we only offer yearly and monthly subscriptions.</p>
                <p>
                  If you have lost service or haven’t already, please use the chat at the bottom right to send us a screenshot of your payment so we can verify your account.
                </p>
                <p>
                  We sincerely apologize for any inconvenience and hope you continue to enjoy the best Plex service around.
                </p>
                <p>Thank you,</p>
                <p>NEO</p>
                <p>Streamz R Us</p>
              </div>
            ) : (
              updates.map((u, idx)=> (
                <div key={(u as any).id || idx} className="glass p-4 rounded-lg border border-cyan-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-slate-200">{u.title}</div>
                    <div className="text-xs text-slate-400">{format(new Date(u.created_at), 'dd/MM/yyyy')}</div>
                  </div>
                  <div>{renderContent(u.content)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  )
}
