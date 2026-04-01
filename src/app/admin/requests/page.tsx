'use client'

import { useState, useEffect } from 'react'
import { Check, Trash2, ExternalLink, MessageSquare, AlertCircle, Clock } from 'lucide-react'

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

export default function AdminRequestsPage() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'request' | 'issue'>('all')

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/admin/recommendations')
      const data = await res.json()
      if (data.items) setItems(data.items)
    } catch (e) {
      console.error('Failed to fetch requests:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (id: string, status: 'pending' | 'in-progress' | 'done') => {
    try {
      const res = await fetch('/api/admin/recommendations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      })
      if (res.ok) {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item))
      }
    } catch (e) {
      console.error('Failed to update status:', e)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this?')) return
    try {
      const res = await fetch(`/api/admin/recommendations?id=${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setItems(prev => prev.filter(item => item.id !== id))
      }
    } catch (e) {
      console.error('Failed to delete item:', e)
    }
  }

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true
    return item.kind === filter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Customer Requests & Issues</h1>
          <p className="text-slate-400">Manage media requests and reported issues from customers.</p>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-md text-sm transition ${filter === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('request')}
            className={`px-4 py-1.5 rounded-md text-sm transition ${filter === 'request' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Requests
          </button>
          <button 
            onClick={() => setFilter('issue')}
            className={`px-4 py-1.5 rounded-md text-sm transition ${filter === 'issue' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Issues
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-700">
            <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No {filter === 'all' ? 'requests or issues' : filter + 's'} found.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div 
              key={item.id} 
              className={`bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden transition hover:border-slate-600 ${item.status === 'done' ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-col md:flex-row">
                {item.image && (
                  <div className="w-full md:w-32 h-48 md:h-auto flex-shrink-0 bg-slate-900 overflow-hidden" title={item.title}>
                    <img 
                      src={item.image} 
                      alt={item.title} 
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150x225/1e293b/64748b?text=IMDb+Poster';
                      }}
                    />
                  </div>
                )}
                
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.kind === 'issue' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {item.kind}
                      </span>
                      {item.status === 'done' && (
                        <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      )}
                      {item.status === 'in-progress' && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Clock className="w-3 h-3" /> In Progress
                        </span>
                      )}
                      <span className="text-xs text-slate-500 ml-auto">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      {item.title}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-400 transition">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </h3>
                    
                    <p className="text-slate-300 text-sm whitespace-pre-wrap mb-4 line-clamp-3">
                      {item.description}
                    </p>
                    
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-400">From:</span>
                      <span className="hover:text-blue-400 transition cursor-pointer">{item.submitter_email}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-700/50 flex items-center justify-between">
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-slate-500 hover:text-red-400 transition rounded-lg hover:bg-red-500/10"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <div className="flex gap-3">
                      {item.status === 'pending' && (
                        <button 
                          onClick={() => handleStatusChange(item.id, 'in-progress')}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-amber-900/20"
                        >
                          <Clock className="w-4 h-4" /> Start Work
                        </button>
                      )}
                      {item.status !== 'done' ? (
                        <button 
                          onClick={() => handleStatusChange(item.id, 'done')}
                          className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-green-900/20"
                        >
                          <Check className="w-4 h-4" /> Mark as Done
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange(item.id, 'pending')}
                          className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
