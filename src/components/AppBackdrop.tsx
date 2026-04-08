"use client"

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

const defaultHeroImage =
  "https://i.postimg.cc/dtPrkWhm/BCO-83b70ff0-5bc4-418d-a4f0-97e59f6c75bf-(1).png"

const stars = [
  { left: '6%', top: '10%', size: 2, delay: '0.2s' },
  { left: '14%', top: '32%', size: 3, delay: '1.6s' },
  { left: '22%', top: '18%', size: 2, delay: '0.8s' },
  { left: '31%', top: '72%', size: 3, delay: '2.2s' },
  { left: '44%', top: '16%', size: 2, delay: '1.2s' },
  { left: '57%', top: '28%', size: 3, delay: '2.8s' },
  { left: '68%', top: '66%', size: 2, delay: '0.9s' },
  { left: '76%', top: '12%', size: 3, delay: '1.9s' },
  { left: '84%', top: '48%', size: 2, delay: '0.4s' },
  { left: '92%', top: '24%', size: 3, delay: '2.4s' },
]

const streaks = [
  { left: '8%', top: '22%', delay: '0.4s', duration: '6.5s' },
  { left: '38%', top: '10%', delay: '2.1s', duration: '7.2s' },
  { left: '72%', top: '18%', delay: '3.9s', duration: '6.8s' },
]

function normalizeHeroUrl(u: string) {
  if (!u) return ""
  try {
    const url = new URL(u)
    if (url.hostname.includes("drive.google.com")) {
      const m = u.match(/\/d\/([^/]+)/)
      const id = m?.[1] || url.searchParams.get("id") || ""
      if (id) return `https://drive.google.com/uc?export=view&id=${id}`
    }
    if (url.hostname.includes("dropbox.com")) {
      if (u.includes("dl=0")) return u.replace("dl=0", "dl=1")
      return u.replace("www.dropbox.com", "dl.dropboxusercontent.com")
    }
    return u
  } catch {
    return u
  }
}

export default function AppBackdrop() {
  const pathname = usePathname() || '/'
  const [heroImageUrl, setHeroImageUrl] = useState(defaultHeroImage)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const raw = typeof data?.hero_image_url === 'string' ? data.hero_image_url.trim() : ''
        if (raw) setHeroImageUrl(raw)
      } catch {}
    })()
  }, [])

  const mode = useMemo(() => {
    if (pathname.startsWith('/customer')) return 'customer'
    if (pathname.startsWith('/admin')) return 'admin'
    if (pathname === '/') return 'home'
    return 'default'
  }, [pathname])

  const proxiedHero = heroImageUrl ? `/api/proxy-image?src=${encodeURIComponent(normalizeHeroUrl(heroImageUrl))}` : ''

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className={`cosmos-layer cosmos-layer--${mode}`}>
        <div className="cosmos-nebula cosmos-nebula--one drift-slower" />
        <div className="cosmos-nebula cosmos-nebula--two drift-slower" />
        <div className="cosmos-nebula cosmos-nebula--three float-slower" />
        <div className="cosmos-planet cosmos-planet--left float-slower" />
        <div className="cosmos-planet cosmos-planet--right drift-slower" />
        {stars.map((star) => (
          <span
            key={`${star.left}-${star.top}`}
            className="cosmos-star twinkle-soft"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: star.delay,
            }}
          />
        ))}
        {streaks.map((streak) => (
          <span
            key={`${streak.left}-${streak.top}`}
            className="shooting-star absolute"
            style={{
              left: streak.left,
              top: streak.top,
              animationDelay: streak.delay,
              animationDuration: streak.duration,
            }}
          />
        ))}

        {mode === 'customer' && proxiedHero ? (
          <>
            <div className="cosmos-poster cosmos-poster--one" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.12), rgba(2, 6, 23, 0.72)), url(${proxiedHero})` }} />
            <div className="cosmos-poster cosmos-poster--two" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.14), rgba(2, 6, 23, 0.76)), url(${proxiedHero})` }} />
            <div className="cosmos-poster cosmos-poster--three" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.18), rgba(2, 6, 23, 0.78)), url(${proxiedHero})` }} />
          </>
        ) : null}
      </div>
    </div>
  )
}
