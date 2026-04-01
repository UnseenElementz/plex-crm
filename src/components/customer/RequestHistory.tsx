'use client'

import { useState, useEffect } from 'react'
import { Check, Clock, AlertCircle, Filter, SortAsc, SortDesc, User, ExternalLink } from 'lucide-react'

interface Recommendation {
  id: string
  url: string
  title: string
  description: string
  image: string
  submitter_email: string
  kind: 'request' | 'issue'
  status: 'pending' | 'in-progress' | 'done'
  created_at: string
}

export default function RequestHistory({ currentEmail }: { currentEmail: string | null }) {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'request' | 'issue'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-progress' | 'done'>('all')
  const [sort, setSort] = useState<{ field: string, order: 'asc' | 'desc' }>({ field: 'created_at', order: 'desc' })

  useEffect(() => {
    fetchHistory()
  }, [filter, statusFilter, sort])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      let url = '/api/recommendations?'
      if (filter === 'mine' && currentEmail) url += `email=${encodeURIComponent(currentEmail)}&`
      if (filter === 'request' || filter === 'issue') url += `kind=${filter}&`
      if (statusFilter !== 'all') url += `status=${statusFilter}&`
      url += `sort=${sort.field}.${sort.order}`

      const res = await fetch(url)
      const data = await res.json()
      if (data.items) setItems(data.items)
    } catch (e) {
      console.error('Failed to fetch history:', e)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <Check className="w-4 h-4 text-emerald-400" />
      case 'in-progress': return <Clock className="w-4 h-4 text-amber-400" />
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'in-progress': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  }

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Community Request History</h2>
          <p className="text-sm text-slate-400">See what others are requesting and track your own.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select 
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Types</option>
            <option value="mine">My Requests</option>
            <option value="request">Only Requests</option>
            <option value="issue">Only Issues</option>
          </select>

          <select 
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Completed</option>
          </select>

          <button 
            onClick={() => setSort(s => ({ field: 'created_at', order: s.order === 'asc' ? 'desc' : 'asc' }))}
            className="bg-slate-800 border border-slate-700 p-1 rounded-lg text-slate-400 hover:text-white transition"
          >
            {sort.order === 'desc' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-slate-800/20 rounded-xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 glass rounded-2xl border border-slate-800">
          <p className="text-slate-500">No requests found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="glass group p-4 rounded-xl border border-slate-800/50 hover:border-cyan-500/30 transition-all duration-300 flex gap-4">
              <div className="w-16 h-24 flex-shrink-0 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative" title={item.title}>
                {item.image ? (
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150x225/1e293b/64748b?text=IMDb+Poster';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800/50 text-slate-600 p-1">
                    <AlertCircle className="w-5 h-5 mb-1 opacity-20" />
                    <span className="text-[8px] uppercase tracking-tighter text-center">No Image Found</span>
                  </div>
                )}
                {/* Image Tooltip on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 text-[8px] text-white text-center font-medium leading-tight">
                  {item.title}
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded border ${getStatusColor(item.status)} flex items-center gap-1`}>
                      {getStatusIcon(item.status)}
                      {item.status.replace('-', ' ')}
                    </span>
                    <span className="text-[10px] text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                    {item.title}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-cyan-400">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1 italic">&quot;{item.description.split('\n')[0]}&quot;</p>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-2">
                  <User className="w-3 h-3" />
                  <span className="truncate">{item.submitter_email}</span>
                  <span className="mx-1">•</span>
                  <span className={`capitalize ${item.kind === 'issue' ? 'text-rose-400' : 'text-cyan-400'}`}>{item.kind}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
