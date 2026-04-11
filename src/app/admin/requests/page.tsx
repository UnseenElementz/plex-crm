'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react'

type Recommendation = {
  id: string
  url: string
  title: string
  description: string
  image: string
  submitter_email: string
  kind: 'request' | 'issue'
  status: 'pending' | 'in-progress' | 'done'
  created_at: string
  updated_at?: string
  comments_count?: number
  likes_count?: number
  latest_comment_preview?: string
}

type ThreadComment = {
  id: string
  content: string
  created_at: string
  role?: 'admin' | 'customer' | 'system'
  author_label?: string
}

const statusTone: Record<string, string> = {
  pending: 'border-slate-500/20 bg-slate-500/10 text-slate-300',
  'in-progress': 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  done: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
}

const statusActionCopy: Record<'in-progress' | 'done', string> = {
  'in-progress': "We're on it.",
  done: 'Complete. This is now finished.',
}

export default function AdminRequestsPage() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'request' | 'issue'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-progress' | 'done'>('all')
  const [threads, setThreads] = useState<Record<string, ThreadComment[]>>({})
  const [threadLoading, setThreadLoading] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0] || null, [items, selectedId])
  const stats = useMemo(() => ({
    open: items.filter((item) => item.status !== 'done').length,
    working: items.filter((item) => item.status === 'in-progress').length,
    complete: items.filter((item) => item.status === 'done').length,
  }), [items])

  async function fetchItems(silent = false) {
    if (!silent) setLoading(true)
    else setSyncing(true)

    try {
      const res = await fetch('/api/admin/recommendations', { cache: 'no-store' })
      const data = await res.json().catch(() => ({ items: [] }))
      if (res.ok) {
        const nextItems: Recommendation[] = Array.isArray(data.items) ? data.items : []
        setItems(nextItems)
        setSelectedId((current) => current && nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || null)
      }
    } catch (e) {
      console.error('Failed to fetch requests:', e)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  async function fetchThread(id: string, silent = false) {
    if (!id) return
    if (!silent) setThreadLoading(true)
    try {
      const res = await fetch(`/api/recommendations/comments?rid=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({ items: [] }))
      if (res.ok) setThreads((prev) => ({ ...prev, [id]: Array.isArray(data.items) ? data.items : [] }))
    } catch (e) {
      console.error('Failed to fetch thread:', e)
    } finally {
      setThreadLoading(false)
    }
  }

  useEffect(() => {
    void fetchItems()
  }, [])

  useEffect(() => {
    if (selected?.id) {
      void fetchThread(selected.id)
    }
  }, [selected?.id])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchItems(true)
      if (selectedId) void fetchThread(selectedId, true)
    }, 15000)
    return () => window.clearInterval(interval)
  }, [selectedId])

  async function updateStatus(status: Recommendation['status'], fallbackNote?: string) {
    if (!selected) return
    setBusy(true)
    setMessage('')
    try {
      const resolvedNote = note.trim() || (status === 'pending' ? '' : String(fallbackNote || '').trim())
      const res = await fetch('/api/admin/recommendations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status, note: resolvedNote }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data?.error || 'Failed to update item.')
        return
      }
      setItems((prev) => prev.map((item) => item.id === selected.id ? { ...item, ...data.item } : item))
      setThreads((prev) => ({ ...prev, [selected.id]: prev[selected.id] || [] }))
      setNote('')
      setMessage('Request desk updated successfully.')
      await fetchThread(selected.id)
    } catch (e: any) {
      setMessage(e?.message || 'Failed to update item.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this request permanently?')) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/admin/recommendations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data?.error || 'Failed to delete item.')
        return
      }
      const nextItems = items.filter((item) => item.id !== id)
      setItems(nextItems)
      setSelectedId(nextItems[0]?.id || null)
      setMessage('Request deleted.')
    } catch (e: any) {
      setMessage(e?.message || 'Failed to delete item.')
    } finally {
      setBusy(false)
    }
  }

  const visibleItems = items.filter((item) => {
    if (filter !== 'all' && item.kind !== filter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    return true
  })

  return (
    <main className="page-section py-5 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="eyebrow">Request Desk</div>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Customer requests and issue reports</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            A live queue with replies, status changes, and customer feedback in the same workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className="input min-w-[140px]" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="all">All types</option>
            <option value="request">Requests</option>
            <option value="issue">Issues</option>
          </select>
          <select className="input min-w-[150px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            <option value="pending">Queued</option>
            <option value="in-progress">In progress</option>
            <option value="done">Complete</option>
          </select>
          <button className="btn-outline px-4 py-3" onClick={() => void fetchItems(true)}>
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Open</div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats.open}</div>
        </div>
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">In progress</div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats.working}</div>
        </div>
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Complete</div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats.complete}</div>
        </div>
      </div>

      {message ? (
        <div className={`mb-4 rounded-[24px] border px-4 py-3 text-sm ${message.toLowerCase().includes('failed') ? 'border-rose-500/20 bg-rose-500/10 text-rose-100' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'}`}>
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="panel overflow-hidden p-0 xl:min-h-[70vh]">
          <div className="border-b border-white/8 px-4 py-3 text-sm text-slate-400 sm:px-5 sm:py-4">
            {loading ? 'Loading queue...' : `${visibleItems.length} items in view`}
          </div>

          <div className="p-3 xl:max-h-[72vh] xl:overflow-y-auto">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((value) => <div key={value} className="h-28 rounded-[24px] bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-6 text-sm text-slate-400">No matching items in the queue.</div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map((item) => {
                  const active = selected?.id === item.id
                  return (
                    <button
                      key={item.id}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${active ? 'border-cyan-400/25 bg-cyan-400/10' : 'border-white/8 bg-white/[0.03]'}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${statusTone[item.status]}`}>
                          {item.status === 'in-progress' ? 'In progress' : item.status === 'done' ? 'Complete' : 'Queued'}
                        </div>
                        <div className="rounded-full border border-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                          {item.kind}
                        </div>
                        <div className="ml-auto text-xs text-slate-500">{new Date(item.updated_at || item.created_at).toLocaleString('en-GB')}</div>
                      </div>
                      <div className="mt-3 text-lg font-semibold text-white">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-400">{item.submitter_email}</div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <div className="inline-flex items-center gap-2">
                          <MessageSquare size={14} />
                          {item.comments_count || 0} updates
                        </div>
                        <div>{item.likes_count || 0} backing this</div>
                      </div>
                      {item.latest_comment_preview ? (
                        <div className="mt-3 line-clamp-2 text-sm text-slate-300">Latest: {item.latest_comment_preview}</div>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="panel p-4 sm:p-6 xl:min-h-[70vh]">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Choose a request to review.</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${statusTone[selected.status]}`}>
                    {selected.status === 'in-progress' ? 'In progress' : selected.status === 'done' ? 'Complete' : 'Queued'}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-white sm:mt-4 sm:text-2xl">{selected.title}</h2>
                  <div className="mt-2 text-sm text-slate-400">{selected.submitter_email}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.url ? (
                    <a href={selected.url} target="_blank" rel="noreferrer" className="btn-outline">
                      Open link
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <button className="btn-outline text-rose-200" onClick={() => void deleteItem(selected.id)} disabled={busy}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[0.34fr_0.66fr]">
                <div className="overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03]">
                  {selected.image ? (
                    <img
                      src={selected.image}
                      alt={selected.title}
                      className="h-full min-h-[260px] w-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center text-slate-600">
                      <CheckCircle2 size={24} />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,16,36,0.88),rgba(5,10,22,0.94))] p-5 shadow-[0_18px_55px_rgba(8,15,42,0.24)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">Request brief</div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {selected.kind === 'issue' ? 'Issue report' : 'Customer request'}
                      </div>
                    </div>
                    <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</div>
                  </div>

                  <div className="rounded-[28px] border border-cyan-400/12 bg-[linear-gradient(180deg,rgba(8,24,44,0.82),rgba(5,14,28,0.92))] p-5 shadow-[0_18px_60px_rgba(8,145,178,0.14)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Update customer</div>
                        <div className="mt-1 text-sm text-slate-400">
                          Keep the note tight. If you leave it blank, the default status update goes out automatically.
                        </div>
                      </div>
                      <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-100">
                        Thread + email
                      </div>
                    </div>
                    <textarea
                      className="input mt-3 min-h-[112px] sm:min-h-[140px]"
                      placeholder="Add a progress note for the customer. This will also appear in their request thread."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button className="btn justify-between px-4 py-3" onClick={() => void updateStatus('in-progress', statusActionCopy['in-progress'])} disabled={busy}>
                        <span className="inline-flex items-center gap-2">
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          We&apos;re on it
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-950/70">In progress</span>
                      </button>
                      <button className="btn-outline justify-between border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-emerald-100 hover:bg-emerald-400/16" onClick={() => void updateStatus('done', statusActionCopy.done)} disabled={busy}>
                        <span>Complete</span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">Done</span>
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      One button tells them you are on it. One button closes it out.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex-1 rounded-[24px] border border-white/8 bg-white/[0.03] p-4 sm:mt-6 sm:rounded-[28px] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Activity thread</div>
                  <button className="btn-xs-outline" onClick={() => selected?.id && void fetchThread(selected.id)} disabled={threadLoading}>
                    {threadLoading ? 'Refreshing...' : 'Refresh thread'}
                  </button>
                </div>

                <div className="space-y-3">
                  {(threads[selected.id] || []).map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded-[22px] border p-4 ${
                        comment.role === 'admin'
                          ? 'border-cyan-400/20 bg-cyan-400/10'
                          : comment.role === 'system'
                            ? 'border-emerald-500/20 bg-emerald-500/10'
                            : 'border-white/8 bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{comment.author_label || 'Update'}</div>
                        <div className="text-xs text-slate-500">{new Date(comment.created_at).toLocaleString('en-GB')}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{comment.content}</div>
                    </div>
                  ))}
                  {!threadLoading && !(threads[selected.id] || []).length ? (
                    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">No replies or status history yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
