"use client"
import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'
import { getStatus } from '@/lib/pricing'
import RequestHistory from '@/components/customer/RequestHistory'

export default function RecommendationsPage(){
  const [mode, setMode] = useState<'request'|'issue'>('request')
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<{ title: string; description: string; image?: string } | null>(null)
  const [details, setDetails] = useState('')
  const [season, setSeason] = useState('')
  const [episode, setEpisode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  useEffect(()=>{
    (async()=>{
      setMsg('')
    })()
  }, [])

  useEffect(()=>{
    (async()=>{
      const s = getSupabase()
      if (!s) { setAuthEmail(null); setActive(false); return }
      const { data } = await s.auth.getUser()
      const email = data.user?.email || null
      setAuthEmail(email)
      const { data: sess } = await s.auth.getSession()
      setAccessToken(sess.session?.access_token || null)
      if (!email){ setActive(false); return }
      try{
        const { data: cust } = await s.from('customers').select('*').eq('email', email).limit(1)
        const nextDue = cust?.[0]?.next_payment_date || cust?.[0]?.next_due_date
        const statusLabel = getStatus(nextDue? new Date(nextDue): new Date())
        // Match the API logic: Active, Due Soon, and Due Today are allowed
        setActive(statusLabel === 'Active' || statusLabel === 'Due Soon' || statusLabel === 'Due Today')
      }catch{ setActive(false) }
    })()
  }, [])

  async function fetchPreview(retryCount = 0){
    setLoading(true); setError(''); setPreview(null)
    try{
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const r = await fetch('/api/recommendations/preview', { 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify({ url }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const d = await r.json().catch(() => ({ error: 'Connection lost' }))
      if (!r.ok){ 
        if ((r.status >= 500 || r.status === 408) && retryCount < 1) {
          return fetchPreview(retryCount + 1)
        }
        setError(d?.error || 'Failed to preview'); return 
      }
      setPreview(d.meta)
    }catch(e:any){ 
      if (e.name === 'AbortError' && retryCount < 1) return fetchPreview(retryCount + 1)
      setError(e?.name === 'AbortError' ? 'Preview timed out.' : 'Failed to fetch preview. Check link.')
    }
    finally{ setLoading(false) }
  }

  async function submit(retryCount = 0){
    if (!active) { setError('Only active customers can submit requests or issues.'); return }
    setLoading(true); setError('')
    try{
      const payload: any = {
        kind: mode,
        url,
        title: preview?.title || (mode === 'issue' ? 'Reported Issue' : 'Requested Program'), // Updated fallback terminology
        description: preview?.description || (mode === 'issue' ? 'Issue reported manually (no preview available)' : 'Program requested manually (no preview available)'),
        image: preview?.image || '',
        email: authEmail || '',
        token: accessToken || '',
        details: details.trim()
      }
      
      // If we don't have a preview, we should at least have a URL
      if (!url) { setError('Please provide an IMDb link.'); return }

      if (mode === 'issue') {
        payload.season = season.trim()
        payload.episode = episode.trim()
      }

      // Add a controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const r = await fetch('/api/recommendations', { 
        method:'POST', 
        headers:{ 'Content-Type':'application/json' }, 
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const d = await r.json().catch(() => ({ error: 'Connection lost' }))
      
      if (!r.ok){ 
        // Automatic retry for 5xx errors or network issues
        if ((r.status >= 500 || r.status === 408) && retryCount < 2) {
          console.warn(`Submission failed (${r.status}). Retrying... attempt ${retryCount + 1}`)
          return submit(retryCount + 1)
        }
        setError(d?.error || 'Failed to submit. Please check your connection.')
        return 
      }

      setMsg(mode === 'issue' ? 'Issue report sent. Thank you.' : 'Request sent. Thank you.')
      setUrl(''); setPreview(null); setDetails(''); setSeason(''); setEpisode('')
    }catch(e:any){ 
      if (e.name === 'AbortError') {
        if (retryCount < 2) return submit(retryCount + 1)
        setError('Request timed out. Please try again.')
      } else {
        setError('Network error. Please check your internet connection.')
      }
      console.error('Submission error:', e)
    }
    finally{ setLoading(false) }
  }

  const title = mode === 'issue' ? 'Report a Media Issue' : 'Request a Movie / Show'
  const subtitle = mode === 'issue'
    ? 'Report broken items with an IMDb link and details (season/episode, what’s wrong).'
    : 'Request titles with an IMDb link. We’ll add it if possible.'

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{title}</h2>
            <p className="text-slate-300">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button className={`btn-xs-outline ${mode==='request' ? 'border-cyan-500/50 text-cyan-300' : ''}`} onClick={()=>{ setMode('request'); setMsg(''); setError('') }}>Request</button>
            <button className={`btn-xs-outline ${mode==='issue' ? 'border-cyan-500/50 text-cyan-300' : ''}`} onClick={()=>{ setMode('issue'); setMsg(''); setError('') }}>Report Issue</button>
          </div>
        </div>

        {!active && (
          <div className="mt-4 glass p-4 rounded-lg border border-amber-500/30 bg-amber-900/10">
            <div className="text-amber-300 text-sm font-semibold mb-1">Active Subscription Required</div>
            <div className="text-slate-300 text-sm">Only active customers can use Requests & Issues.</div>
          </div>
        )}

        {active && (
          <div className="mt-4 space-y-3">
            <input className="input" placeholder="Paste IMDb link (movie or show)" value={url} onChange={e=>setUrl(e.target.value)} />
            {mode === 'issue' && (
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Season (optional)" value={season} onChange={e=>setSeason(e.target.value)} />
                <input className="input" placeholder="Episode (optional)" value={episode} onChange={e=>setEpisode(e.target.value)} />
              </div>
            )}
            <textarea className="input" rows={4} placeholder={mode==='issue' ? 'Describe the issue (buffering, wrong episode, missing audio, etc.)' : 'Any notes? (optional)'} value={details} onChange={e=>setDetails(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn" onClick={() => fetchPreview()} disabled={!url || loading}>
                {loading ? 'Processing...' : 'Preview'}
              </button>
              {!preview && url && !loading && (
                <button className="btn-outline" onClick={() => submit()} disabled={loading}>
                  {mode === 'issue' ? 'Report Issue' : 'Send Request'}
                </button>
              )}
              {preview && <button className="btn-outline" onClick={()=>{ setPreview(null); setUrl('') }}>Clear</button>}
            </div>
            {error && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-rose-400 text-sm">{error}</div>
                {error.includes('IMDb') && (
                  <div className="text-slate-400 text-xs italic">
                    Note: Sometimes IMDb blocks our preview system. You can still use the &quot;{mode === 'issue' ? 'Report Issue' : 'Send Request'}&quot; button above.
                  </div>
                )}
              </div>
            )}
            {msg && <div className="text-emerald-400 text-sm mt-2">{msg}</div>}
            {preview && (
              <div className="glass p-4 rounded-lg border border-cyan-500/20 mt-4">
                <div className="flex gap-4">
                  {preview.image && (<img src={preview.image} alt="poster" className="w-24 h-32 object-cover rounded shadow-lg" />)}
                  <div className="flex-1">
                    <div className="text-slate-200 font-semibold mb-1">{preview.title}</div>
                    <div className="text-slate-400 text-sm line-clamp-3 mb-4">{preview.description}</div>
                    <div>
                      <button className="btn" onClick={() => submit()} disabled={loading}>
                        {mode === 'issue' ? 'Send Issue Report' : 'Send Request'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <RequestHistory currentEmail={authEmail} />
    </main>
  )
}
