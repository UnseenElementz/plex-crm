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
    const parts = normalized.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean)
    return parts.map((paragraph, index) => (
      <p key={index} className="mb-2 text-sm text-slate-300">{paragraph}</p>
    ))
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/service-updates')
        const data = await res.json().catch(() => ({ updates: [] }))
        if (!res.ok) throw new Error(data?.error || 'Failed to load updates')
        setUpdates(Array.isArray(data.updates) ? data.updates : [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load updates')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <div className="mb-4">
          <a href="/customer" className="btn-outline" data-no-prefetch>Back</a>
        </div>
        <h2 className="text-2xl font-semibold mb-2">Service Updates</h2>
        <p className="mb-4 text-sm text-slate-400">Latest service notices and previous update history in one place.</p>
        {loading && <div className="text-slate-400">Loading updates...</div>}
        {!loading && error && <div className="text-rose-400">{error}</div>}
        {!loading && !error && (
          <div className="space-y-4">
            {updates.length === 0 ? (
              <div className="glass rounded-lg border border-cyan-500/20 p-4 text-sm text-slate-300">
                No service updates have been published yet. New support, billing, and service notices will appear here.
              </div>
            ) : (
              updates.map((update, index) => (
                <div key={(update as any).id || index} className="glass p-4 rounded-lg border border-cyan-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-slate-200">{update.title}</div>
                    <div className="text-xs text-slate-400">{format(new Date(update.created_at), 'dd/MM/yyyy')}</div>
                  </div>
                  <div>{renderContent(update.content)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  )
}
