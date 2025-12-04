"use client"
import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { getStatus } from '@/lib/pricing'

type Recommendation = { id: string; url: string; title: string; description: string; image?: string; submitter_email?: string; created_at: string }
type Comment = { id: string; recommendation_id: string; author_email: string; content: string; created_at: string }

export default function RecommendationsPage(){
  const [items, setItems] = useState<Recommendation[]>([])
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<{ title: string; description: string; image?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [active, setActive] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [likeBusy, setLikeBusy] = useState(false)

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/recommendations')
        const d = await res.json()
        if (res.ok) setItems(d.items||[]) 
      }catch{}
    })()
  }, [])

  useEffect(()=>{
    (async()=>{
      const s = getSupabase()
      if (!s) { setAuthEmail(null); setActive(false); return }
      const { data } = await s.auth.getUser()
      const email = data.user?.email || null
      setAuthEmail(email)
      if (!email){ setActive(false); return }
      try{
        const { data: cust } = await s.from('customers').select('*').eq('email', email).limit(1)
        const nextDue = cust?.[0]?.next_payment_date || cust?.[0]?.next_due_date
        const statusLabel = getStatus(nextDue? new Date(nextDue): new Date())
        setActive(statusLabel === 'Active')
      }catch{ setActive(false) }
    })()
  }, [])

  async function fetchPreview(){
    setLoading(true); setError(''); setPreview(null)
    try{
      const r = await fetch('/api/recommendations/preview', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ url }) })
      const d = await r.json()
      if (!r.ok){ setError(d?.error || 'Failed to preview'); return }
      setPreview(d.meta)
    }catch(e:any){ setError(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  async function submit(){
    if (!preview) return
    setLoading(true); setError('')
    try{
      const r = await fetch('/api/recommendations', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ url, title: preview.title, description: preview.description, image: preview.image, email: authEmail || '' }) })
      const d = await r.json()
      if (!r.ok){ setError(d?.error || 'Failed to submit'); return }
      setItems(prev=> [d.item, ...prev])
      setUrl(''); setPreview(null)
    }catch(e:any){ setError(e?.message || 'Failed') }
    finally{ setLoading(false) }
  }

  async function loadComments(id: string){
    try{ const r = await fetch(`/api/recommendations/comments?rid=${encodeURIComponent(id)}`); const d = await r.json(); if (r.ok) setComments(p=>({ ...p, [id]: d.items||[] })) }catch{}
  }

  async function addComment(id: string){
    if (!commentText.trim()) return
    try{
      const r = await fetch('/api/recommendations/comments', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ rid: id, email: authEmail, content: commentText.trim() }) })
      const d = await r.json(); if (r.ok){ setComments(p=> ({ ...p, [id]: [...(p[id]||[]), d.item] })); setCommentText('') }
    }catch{}
  }

  async function toggleLike(id: string){ setLikeBusy(true); try{ const r = await fetch('/api/recommendations/like', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ rid: id, email: authEmail }) }); await r.json(); }catch{} finally{ setLikeBusy(false) } }

  const warning = `IMPORTANT: This page is strictly for movie and show recommendations only. Any discussions unrelated to recommendations (including spam, promos, or off-topic content) will result in an immediate block. Enjoy sharing great titles and keep it focused. — Tank — Developer`

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold">Community Recommendations</h2>
        <p className="text-slate-300">Suggest titles via IMDb links. Signed-in active subscribers can comment and give thumbs up.</p>
        <div className="mt-3 glass p-4 rounded-lg border border-rose-500/30 bg-rose-900/10">
          <div className="text-rose-300 text-sm font-semibold mb-2">NOTICE</div>
          <p className="text-slate-300 text-xs whitespace-pre-wrap">{warning}</p>
        </div>

        <div className="mt-4 space-y-3">
          <input className="input" placeholder="Paste IMDb link (movie or show)" value={url} onChange={e=>setUrl(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn" onClick={fetchPreview} disabled={!url || loading}>Preview</button>
            {preview && <button className="btn-outline" onClick={()=>{ setPreview(null); setUrl('') }}>Clear</button>}
          </div>
          {error && <div className="text-rose-400 text-sm">{error}</div>}
          {preview && (
            <div className="glass p-4 rounded-lg border border-cyan-500/20">
              <div className="flex gap-4">
                {preview.image && (<img src={preview.image} alt="poster" className="w-24 h-32 object-cover rounded" />)}
                <div>
                  <div className="text-slate-200 font-semibold">{preview.title}</div>
                  <div className="text-slate-400 text-sm">{preview.description}</div>
                  <div className="mt-3">
                    <button className="btn" onClick={submit} disabled={loading}>Submit Recommendation</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="text-slate-300 mb-2">Latest recommendations</div>
          <div className="space-y-3">
            {items.map(it=> (
              <div key={it.id} className="glass p-4 rounded-lg border border-cyan-500/20">
                <div className="flex gap-4">
                  {it.image && (<img src={it.image} alt="poster" className="w-16 h-24 object-cover rounded" />)}
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-200 hover:text-cyan-300">{it.title}</a>
                      <button className="btn-xs-outline" onClick={()=> toggleLike(it.id)} disabled={!active || likeBusy}>{likeBusy? '...' : '👍'}</button>
                    </div>
                    <div className="text-slate-400 text-sm mt-1">{it.description}</div>
                    <div className="mt-3">
                      <button className="btn-xs" onClick={()=>{ setOpenId(openId===it.id?null:it.id); if (openId!==it.id) loadComments(it.id) }}>Comments</button>
                    </div>
                    {openId===it.id && (
                      <div className="mt-2 space-y-2">
                        <div className="space-y-1">
                          {(comments[it.id]||[]).map(c=> (
                            <div key={c.id} className="glass p-2 rounded border border-slate-800/40">
                              <div className="text-slate-400 text-xs">{c.author_email || 'Anonymous'}</div>
                              <div className="text-slate-200 text-sm">{c.content}</div>
                            </div>
                          ))}
                          {!(comments[it.id]||[]).length && (<div className="text-slate-500 text-xs">No comments yet</div>)}
                        </div>
                        <div className="flex gap-2">
                          <input className="input flex-1" placeholder={active? 'Write a comment...' : 'Sign in with active subscription to comment'} value={commentText} onChange={e=>setCommentText(e.target.value)} disabled={!active} />
                          <button className="btn-xs" onClick={()=> addComment(it.id)} disabled={!active || !commentText.trim()}>Post</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
