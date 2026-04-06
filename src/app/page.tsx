"use client"
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export default function Home() {
  const [parallaxY, setParallaxY] = useState(0)
  const [heroImageUrl, setHeroImageUrl] = useState<string>('')
  const [companyName, setCompanyName] = useState('Streamz R Us')
  const ticking = useRef(false)
  useEffect(()=>{
    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true
        requestAnimationFrame(()=>{
          setParallaxY(window.scrollY)
          ticking.current = false
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (res.ok){
          const data = await res.json()
          const raw = data?.hero_image_url || ''
          const clean = typeof raw === 'string' ? raw.replace(/^["'`\s]+|["'`\s]+$/g, '').trim() : ''
          setHeroImageUrl(clean)
          if (data.company_name) setCompanyName(data.company_name)
        }
      } catch{}
    })()
  }, [])

  function normalizeHeroUrl(u: string){
    if (!u) return ''
    try{
      const url = new URL(u)
      if (url.hostname.includes('drive.google.com')){
        const m = u.match(/\/d\/([^/]+)/)
        const id = m?.[1] || url.searchParams.get('id') || ''
        if (id) return `https://drive.google.com/uc?export=view&id=${id}`
      }
      if (url.hostname.includes('dropbox.com')){
        if (u.includes('dl=0')) return u.replace('dl=0','dl=1')
        return u.replace('www.dropbox.com','dl.dropboxusercontent.com')
      }
      return u
    } catch { return u }
  }

  function proxied(u: string){
    if (!u) return ''
    const n = normalizeHeroUrl(u)
    return `/api/proxy-image?src=${encodeURIComponent(n)}`
  }

  const heroSrc = normalizeHeroUrl(heroImageUrl)

  const layer1 = { transform: `translateY(${-(parallaxY * 0.08)}px)` }
  const layer2 = { transform: `translateY(${-(parallaxY * 0.14)}px)` }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Parallax Background Layers */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 blur-3xl opacity-40" style={layer1}></div>
        <div className="absolute -top-24 left-0 right-0 h-[60vh]" style={layer2}>
          <div className="mx-auto h-full max-w-6xl shimmer metallic-card"></div>
        </div>
        <div className="absolute right-[8%] top-[10%] h-40 w-40 rounded-full border border-cyan-400/20 bg-cyan-400/10 blur-2xl"></div>
        <div className="absolute bottom-[12%] left-[6%] h-56 w-56 rounded-full border border-sky-400/15 bg-sky-500/10 blur-3xl"></div>
      </div>

      {/* Hero Section */}
      <section className="pt-24 pb-12 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
          <div className="metallic-card p-10 fade-up" style={{ animationDelay: '120ms' }}>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-200 via-white to-blue-200">
              {companyName}
            </h1>
            <p className="mt-3 text-lg text-slate-300">
              A cinema-scale Plex experience wrapped in a starfield control room.
              <br />
              <span className="text-slate-400">Referral rewards, premium uptime, and a customer portal built for long-term retention.</span>
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link 
                href="/customer/login" 
                prefetch={false}
                className="btn px-6 py-3 rounded-xl hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                aria-label="Go to Customer Portal"
              >
                Customer Portal
              </Link>
              <Link 
                href="/login" 
                prefetch={false}
                className="btn-outline px-6 py-3 rounded-xl hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                aria-label="Admin Login"
              >
                Admin Login
              </Link>
            </div>
          </div>
          <div className="relative h-[320px] md:h-[420px] rounded-2xl metallic-card fade-up overflow-hidden" style={{ animationDelay: '240ms' }} aria-hidden="true">
            <div className="absolute inset-0 rounded-2xl" style={{
              background: 'radial-gradient(100% 100% at 20% 10%, rgba(0, 230, 255, 0.25) 0%, rgba(0, 230, 255, 0.04) 60%, rgba(255,255,255,0.03) 100%)'
            }}></div>
            {heroImageUrl && (
              <>
                <img
                  src={heroSrc}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-45"
                  onError={(e)=>{ const t = e.target as HTMLImageElement; t.style.display = 'none' }}
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 p-5 md:p-7">
                  <img
                    src={heroSrc}
                    alt={`${companyName} hero`}
                    className="w-full h-full object-contain"
                    onError={(e)=>{ const t = e.target as HTMLImageElement; t.style.display = 'none' }}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </>
            )}
            <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-cyan-400/30 blur-xl float-slow"></div>
            <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full bg-blue-400/25 blur-xl float-slower"></div>
          </div>
        </div>
      </section>

      {/* Feature Blocks */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { title: '99% Uptime', desc: 'We strive to keep the servers at top performance' },
            { title: 'Huge Collection', desc: 'We have one of the largest collections of movies and shows in the world' },
            { title: 'Referral Rewards', desc: 'Bring friends to the service and earn up to GBP 80 in renewal credit' }
          ].map((f, i)=> (
            <div key={f.title} className="metallic-card p-6 fade-up" style={{ animationDelay: `${(i+1)*160}ms` }}>
              <h3 className="text-xl font-semibold text-slate-200 mb-1">{f.title}</h3>
              <p className="text-slate-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Note */}
      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto text-center text-slate-500 text-sm">
          <p>Streamz R Us — Premium Plex Provider</p>
        </div>
      </section>
    </main>
  )
}
