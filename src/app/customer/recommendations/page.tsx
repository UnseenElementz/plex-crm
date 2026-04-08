"use client"

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Film, LifeBuoy, Sparkles } from 'lucide-react'
import { getSupabase } from '@/lib/supabaseClient'
import { getStatus } from '@/lib/pricing'
import RequestHistory from '@/components/customer/RequestHistory'

type PreviewMeta = { title: string; description: string; image?: string }

const modeContent = {
  request: {
    title: 'Request a film or series',
    subtitle: 'Paste an IMDb link, review the match, and send it straight to the request desk.',
    cta: 'Send request',
    icon: Film,
  },
  issue: {
    title: 'Report a playback issue',
    subtitle: 'Use the IMDb link plus a quick note so the team can fix the right item faster.',
    cta: 'Report issue',
    icon: LifeBuoy,
  },
}

export default function RecommendationsPage(){
  const [mode, setMode] = useState<'request'|'issue'>('request')
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<PreviewMeta | null>(null)
  const [details, setDetails] = useState('')
  const [season, setSeason] = useState('')
  const [episode, setEpisode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    ;(async () => {
      const s = getSupabase()
      if (!s) {
        setAuthEmail(null)
        setAccessToken(null)
        setActive(false)
        return
      }

      const [{ data: userData }, { data: sessionData }] = await Promise.all([
        s.auth.getUser(),
        s.auth.getSession(),
      ])
      const email = userData.user?.email || null
      setAuthEmail(email)
      setAccessToken(sessionData.session?.access_token || null)

      if (!email) {
        setActive(false)
        return
      }

      try {
        const { data: customer } = await s.from('customers').select('*').eq('email', email).maybeSingle()
        const nextDue = (customer as any)?.next_payment_date || (customer as any)?.next_due_date
        const statusLabel = nextDue ? getStatus(new Date(nextDue)) : 'Overdue'
        setActive(statusLabel === 'Active' || statusLabel === 'Due Soon' || statusLabel === 'Due Today')
      } catch {
        setActive(false)
      }
    })()
  }, [])

  async function fetchPreview(retryCount = 0){
    setLoading(true)
    setError('')
    setPreview(null)
    setMsg('')

    try{
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 8000)

      const res = await fetch('/api/recommendations/preview', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal
      })
      window.clearTimeout(timeoutId)

      const data = await res.json().catch(() => ({ error: 'Connection lost' }))
      if (!res.ok){
        if ((res.status >= 500 || res.status === 408) && retryCount < 1) {
          return fetchPreview(retryCount + 1)
        }
        setError(data?.error || 'Failed to preview link.')
        return
      }

      setPreview(data.meta)
    }catch(e: any){
      if (e.name === 'AbortError' && retryCount < 1) return fetchPreview(retryCount + 1)
      setError(e?.name === 'AbortError' ? 'Preview timed out.' : 'Failed to fetch preview.')
    } finally {
      setLoading(false)
    }
  }

  async function submit(retryCount = 0){
    if (!active) {
      setError('Only active customers can submit requests or issue reports.')
      return
    }

    if (!url.trim()) {
      setError('Please add an IMDb link first.')
      return
    }

    setLoading(true)
    setError('')
    setMsg('')

    try{
      const payload: any = {
        kind: mode,
        url,
        title: preview?.title || (mode === 'issue' ? 'Media issue report' : 'Media request'),
        description: preview?.description || '',
        image: preview?.image || '',
        details: details.trim(),
        season: season.trim(),
        episode: episode.trim(),
      }

      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 10000)
      const res = await fetch('/api/recommendations', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      window.clearTimeout(timeoutId)

      const data = await res.json().catch(() => ({ error: 'Connection lost' }))
      if (!res.ok){
        if ((res.status >= 500 || res.status === 408) && retryCount < 2) {
          return submit(retryCount + 1)
        }
        setError(data?.error || 'Failed to submit.')
        return
      }

      setMsg(mode === 'issue' ? 'Issue report sent. The board will update when the team responds.' : 'Request sent. You will see progress updates in the live board below.')
      setUrl('')
      setPreview(null)
      setDetails('')
      setSeason('')
      setEpisode('')
    }catch(e: any){
      if (e.name === 'AbortError' && retryCount < 2) return submit(retryCount + 1)
      setError(e?.name === 'AbortError' ? 'Request timed out. Please try again.' : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const content = modeContent[mode]
  const Icon = content.icon
  const helperCards = useMemo(() => [
    {
      title: 'Fast triage',
      text: 'IMDb links, issue notes, and support replies stay together so nothing gets lost.',
    },
    {
      title: 'Live progress',
      text: 'The board below refreshes automatically and shows new support notes as they arrive.',
    },
    {
      title: 'Cleaner handover',
      text: 'When the status changes, the same thread shows what moved and when it happened.',
    },
  ], [])

  return (
    <main className="page-section py-8">
      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="panel-strong p-6">
            <div className="eyebrow">
              <Sparkles size={14} />
              Requests and issue desk
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-white sm:text-[2.35rem]">{content.title}</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{content.subtitle}</p>
              </div>
              <div className={`rounded-[24px] border px-4 py-2 text-sm ${active ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'}`}>
                {active ? 'Active account' : 'Subscription needed'}
              </div>
            </div>

            {!active ? (
              <div className="mt-5 rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                Only active customers can send new requests or issue reports. Once your account is active again, this page will unlock automatically.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              {(['request', 'issue'] as const).map((value) => {
                const selected = mode === value
                const buttonContent = modeContent[value]
                const ButtonIcon = buttonContent.icon
                return (
                  <button
                    key={value}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                      selected ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-300'
                    }`}
                    onClick={() => {
                      setMode(value)
                      setError('')
                      setMsg('')
                    }}
                  >
                    <ButtonIcon size={15} />
                    {buttonContent.title}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 space-y-4">
              <input
                className="input"
                placeholder="Paste IMDb link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {mode === 'issue' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <input className="input" placeholder="Season (optional)" value={season} onChange={(e) => setSeason(e.target.value)} />
                  <input className="input" placeholder="Episode (optional)" value={episode} onChange={(e) => setEpisode(e.target.value)} />
                </div>
              ) : null}
              <textarea
                className="input min-h-[140px]"
                placeholder={mode === 'issue' ? 'What is wrong with it? Example: buffering, wrong episode, missing audio.' : 'Optional note for the team.'}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <button className="btn" onClick={() => void fetchPreview()} disabled={!url.trim() || loading}>
                  {loading ? 'Working...' : 'Preview link'}
                </button>
                <button className="btn-outline" onClick={() => void submit()} disabled={!url.trim() || loading || !active}>
                  {content.cta}
                </button>
                {preview ? (
                  <button className="btn-xs-outline" onClick={() => { setPreview(null); setUrl('') }}>
                    Clear preview
                  </button>
                ) : null}
              </div>

              {error ? <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
              {msg ? (
                <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                    <span>{msg}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="panel p-5">
              <div className="text-sm font-semibold text-white">Preview match</div>
              <div className="mt-4 flex gap-4">
                {preview.image ? (
                  <img src={preview.image} alt={preview.title} className="h-36 w-24 rounded-[20px] object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-white">{preview.title}</div>
                  <p className="mt-2 line-clamp-5 text-sm leading-6 text-slate-400">{preview.description || 'No description was returned for this link.'}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          {helperCards.map((card) => (
            <div key={card.title} className="panel p-5">
              <div className="text-sm font-semibold text-white">{card.title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8">
        <RequestHistory currentEmail={authEmail} accessToken={accessToken} active={active} />
      </div>
    </main>
  )
}
