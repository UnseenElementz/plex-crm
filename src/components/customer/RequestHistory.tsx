'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Clock3, ExternalLink, Heart, MessageSquare, RefreshCw } from 'lucide-react'

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
  liked_by_me?: boolean
  latest_comment_preview?: string
  latest_comment_at?: string | null
}

type ThreadComment = {
  id: string
  content: string
  created_at: string
  role?: 'admin' | 'customer' | 'system'
  author_label?: string
}

type Props = {
  currentEmail: string | null
  accessToken: string | null
  active: boolean
}

const statusClasses: Record<string, string> = {
  pending: 'border-slate-500/20 bg-slate-500/10 text-slate-300',
  'in-progress': 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  done: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
}

function statusLabel(status: Recommendation['status']) {
  if (status === 'in-progress') return 'In progress'
  if (status === 'done') return 'Complete'
  return 'Queued'
}

function kindLabel(kind: Recommendation['kind']) {
  return kind === 'issue' ? 'Issue' : 'Request'
}

export default function RequestHistory({ currentEmail, accessToken, active }: Props) {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mine' | 'request' | 'issue'>('mine')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-progress' | 'done'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [threads, setThreads] = useState<Record<string, ThreadComment[]>>({})
  const [threadLoading, setThreadLoading] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [actionMsg, setActionMsg] = useState('')

  const authHeaders: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

  async function fetchHistory(silent = false) {
    if (!silent) setLoading(true)
    else setSyncing(true)

    try {
      const params = new URLSearchParams()
      if (filter === 'mine' && currentEmail) params.set('email', currentEmail)
      if (filter === 'request' || filter === 'issue') params.set('kind', filter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('sort', 'updated_at.desc')

      const res = await fetch(`/api/recommendations?${params.toString()}`, {
        cache: 'no-store',
        headers: authHeaders,
      })
      const data = await res.json().catch(() => ({ items: [] }))
      if (res.ok) setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      console.error('Failed to fetch request history:', e)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  async function fetchThread(id: string, silent = false) {
    if (!silent) setThreadLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/recommendations/comments?rid=${encodeURIComponent(id)}`, {
        cache: 'no-store',
        headers: authHeaders,
      })
      const data = await res.json().catch(() => ({ items: [] }))
      if (res.ok) {
        setThreads((prev) => ({ ...prev, [id]: Array.isArray(data.items) ? data.items : [] }))
      }
    } catch (e) {
      console.error('Failed to fetch request thread:', e)
    } finally {
      setThreadLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  useEffect(() => {
    void fetchHistory()
  }, [filter, statusFilter, currentEmail, accessToken])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchHistory(true)
      if (openId) void fetchThread(openId, true)
    }, 15000)
    return () => window.clearInterval(interval)
  }, [openId, filter, statusFilter, currentEmail, accessToken])

  useEffect(() => {
    if (openId && !threads[openId] && !threadLoading[openId]) {
      void fetchThread(openId)
    }
  }, [openId, threads, threadLoading, accessToken])

  async function toggleLike(id: string) {
    if (!accessToken || !active) {
      setActionMsg('Only active customers can react to requests.')
      return
    }
    setActionMsg('')
    try {
      const res = await fetch('/api/recommendations/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ rid: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionMsg(data?.error || 'Failed to update support vote.')
        return
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                liked_by_me: Boolean(data.liked),
                likes_count: Math.max(0, (item.likes_count || 0) + (data.liked ? 1 : -1)),
              }
            : item
        )
      )
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to update support vote.')
    }
  }

  async function sendComment(id: string) {
    const content = String(drafts[id] || '').trim()
    if (!content) return
    if (!accessToken) {
      setActionMsg('Please sign in again before sending a reply.')
      return
    }

    setActionMsg('')
    try {
      const res = await fetch('/api/recommendations/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ rid: id, content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionMsg(data?.error || 'Failed to send reply.')
        return
      }
      setDrafts((prev) => ({ ...prev, [id]: '' }))
      setThreads((prev) => ({ ...prev, [id]: [...(prev[id] || []), data.item] }))
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                comments_count: (item.comments_count || 0) + 1,
                latest_comment_preview: content,
                latest_comment_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : item
        )
      )
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to send reply.')
    }
  }

  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="eyebrow">Request Desk</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Live request board</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Requests, issue reports, progress updates, and support replies all refresh here automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select className="input min-w-[140px]" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="mine">My items</option>
              <option value="all">Everything</option>
              <option value="request">Requests only</option>
              <option value="issue">Issues only</option>
            </select>
            <select className="input min-w-[140px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="pending">Queued</option>
              <option value="in-progress">In progress</option>
              <option value="done">Complete</option>
            </select>
            <button className="btn-outline px-4 py-3" onClick={() => void fetchHistory(true)}>
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Auto-refresh every 15 seconds
          </div>
          {actionMsg ? <div className="text-amber-200">{actionMsg}</div> : null}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[1, 2, 3, 4].map((value) => (
            <div key={value} className="panel h-48 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel flex min-h-[220px] items-center justify-center p-8 text-center">
          <div>
            <AlertCircle className="mx-auto h-10 w-10 text-slate-600" />
            <div className="mt-4 text-base font-medium text-white">Nothing to show yet</div>
            <p className="mt-2 text-sm text-slate-400">Once requests or issue reports come in, they will appear here with live status changes.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => {
            const open = openId === item.id
            const thread = threads[item.id] || []
            return (
              <div key={item.id} className={`panel overflow-hidden transition-all ${open ? 'border-cyan-400/25 bg-cyan-500/[0.04]' : ''}`}>
                <div className="flex gap-4 p-5">
                  <div className="hidden w-20 shrink-0 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 sm:block">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="flex h-full min-h-[110px] items-center justify-center text-slate-600">
                        <AlertCircle size={18} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${statusClasses[item.status]}`}>
                        {statusLabel(item.status)}
                      </div>
                      <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                        {kindLabel(item.kind)}
                      </div>
                      <div className="ml-auto text-xs text-slate-500">
                        Updated {new Date(item.updated_at || item.created_at).toLocaleString('en-GB')}
                      </div>
                    </div>

                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{item.title}</div>
                        <div className="mt-1 text-sm text-slate-400">{item.submitter_email}</div>
                      </div>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="btn-xs-outline">
                          Open link
                          <ExternalLink size={14} />
                        </a>
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">{item.description}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
                        <MessageSquare size={14} />
                        {item.comments_count || 0} updates
                      </div>
                      <button
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                          item.liked_by_me ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/8 text-slate-400'
                        }`}
                        onClick={() => void toggleLike(item.id)}
                      >
                        <Heart size={14} className={item.liked_by_me ? 'fill-current' : ''} />
                        {item.likes_count || 0} backing this
                      </button>
                      {item.latest_comment_preview ? (
                        <div className="min-w-[220px] flex-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-slate-400">
                          Latest: {item.latest_comment_preview}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/8 bg-black/10 px-5 py-4">
                  <button className="btn-outline px-4 py-2" onClick={() => setOpenId(open ? null : item.id)}>
                    {open ? 'Hide thread' : 'Open thread'}
                  </button>

                  {open ? (
                    <div className="mt-4 space-y-4">
                      {threadLoading[item.id] ? <div className="text-sm text-slate-400">Loading updates...</div> : null}

                      <div className="space-y-3">
                        {thread.map((comment) => (
                          <div
                            key={comment.id}
                            className={`rounded-[22px] border p-4 ${
                              comment.role === 'admin'
                                ? 'border-cyan-400/20 bg-cyan-400/10'
                                : comment.role === 'system'
                                  ? 'border-emerald-400/18 bg-emerald-400/10'
                                  : 'border-white/8 bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-white">{comment.author_label || 'Update'}</div>
                              <div className="text-xs text-slate-500">{new Date(comment.created_at).toLocaleString('en-GB')}</div>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-300 whitespace-pre-wrap">{comment.content}</div>
                          </div>
                        ))}
                        {!thread.length && !threadLoading[item.id] ? (
                          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
                            No thread updates yet. The first status change or support reply will appear here.
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                          <Clock3 size={15} />
                          Add more detail
                        </div>
                        <textarea
                          className="input min-h-[110px]"
                          placeholder={active ? 'Add any extra detail for the support team here.' : 'Only active customers can reply here.'}
                          value={drafts[item.id] || ''}
                          disabled={!active || !accessToken}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            className="btn-xs"
                            onClick={() => void sendComment(item.id)}
                            disabled={!active || !accessToken || !String(drafts[item.id] || '').trim()}
                          >
                            Send update
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
