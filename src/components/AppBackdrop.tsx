"use client"

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

const stars = [
  { left: '4%', top: '8%', size: 2, delay: '0.2s' },
  { left: '8%', top: '24%', size: 3, delay: '1.6s' },
  { left: '12%', top: '42%', size: 2, delay: '0.7s' },
  { left: '16%', top: '66%', size: 3, delay: '2.4s' },
  { left: '21%', top: '15%', size: 2, delay: '1.1s' },
  { left: '26%', top: '31%', size: 3, delay: '2.8s' },
  { left: '31%', top: '74%', size: 2, delay: '0.9s' },
  { left: '36%', top: '12%', size: 3, delay: '1.9s' },
  { left: '41%', top: '49%', size: 2, delay: '0.4s' },
  { left: '46%', top: '22%', size: 3, delay: '2.4s' },
  { left: '52%', top: '9%', size: 2, delay: '0.6s' },
  { left: '57%', top: '38%', size: 3, delay: '1.4s' },
  { left: '61%', top: '63%', size: 2, delay: '2.1s' },
  { left: '66%', top: '18%', size: 3, delay: '1.8s' },
  { left: '71%', top: '52%', size: 2, delay: '0.5s' },
  { left: '76%', top: '11%', size: 3, delay: '2.2s' },
  { left: '81%', top: '34%', size: 2, delay: '1.2s' },
  { left: '86%', top: '57%', size: 3, delay: '2.7s' },
  { left: '91%', top: '21%', size: 2, delay: '0.3s' },
  { left: '95%', top: '44%', size: 3, delay: '1.5s' },
]

const streaks = [
  { left: '5%', top: '18%', delay: '0.4s', duration: '6.5s' },
  { left: '15%', top: '8%', delay: '3.1s', duration: '7.6s' },
  { left: '28%', top: '24%', delay: '2.1s', duration: '7.2s' },
  { left: '39%', top: '12%', delay: '4.8s', duration: '6.1s' },
  { left: '52%', top: '16%', delay: '1.4s', duration: '5.9s' },
  { left: '66%', top: '8%', delay: '3.9s', duration: '6.8s' },
  { left: '74%', top: '22%', delay: '2.7s', duration: '7.4s' },
  { left: '84%', top: '14%', delay: '5.2s', duration: '6.2s' },
]

const signalLines = [
  { left: '-8%', top: '16%', delay: '0s', duration: '26s', scale: 0.96 },
  { left: '12%', top: '32%', delay: '8s', duration: '30s', scale: 0.82 },
  { left: '-2%', top: '70%', delay: '4s', duration: '28s', scale: 0.9 },
]

const signalCopy = "Streamz 'R' Us - The Rest Dont Come Close"

const universeBackdropUrl = '/time-waster-ban-bg.png'

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
  const [heroImageUrl, setHeroImageUrl] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const raw = typeof data?.hero_image_url === 'string' ? data.hero_image_url.trim() : ''
        setHeroImageUrl(raw)
      } catch {
        setHeroImageUrl('')
      }
    })()
  }, [])

  const mode = useMemo(() => {
    if (pathname.startsWith('/customer/login')) return 'customer-login'
    if (pathname.startsWith('/customer')) return 'customer'
    if (pathname.startsWith('/admin')) return 'admin'
    if (pathname === '/') return 'home'
    return 'default'
  }, [pathname])

  const resolvedHero = heroImageUrl ? normalizeHeroUrl(heroImageUrl) : ''
  const accentArtwork = resolvedHero || universeBackdropUrl

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className={`cosmos-layer cosmos-layer--${mode}`}>
        <div className={`cosmos-universe cosmos-universe--${mode}`}>
          <div className="cosmos-universe__image" style={{ backgroundImage: `url(${universeBackdropUrl})` }} />
          <div className="cosmos-universe__echo" style={{ backgroundImage: `url(${universeBackdropUrl})` }} />
          <div className="cosmos-universe__core" />
          <div className="cosmos-universe__vignette" />
        </div>
        <div className="cosmos-nebula cosmos-nebula--one drift-slower" />
        <div className="cosmos-nebula cosmos-nebula--two drift-slower" />
        <div className="cosmos-nebula cosmos-nebula--three float-slower" />
        <div className="cosmos-horizon" />
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
        {signalLines.map((line, index) => (
          <div
            key={`${line.left}-${line.top}-${index}`}
            className="cosmos-signal"
            style={{
              left: line.left,
              top: line.top,
              animationDelay: line.delay,
              animationDuration: line.duration,
              transform: `scale(${line.scale})`,
            }}
          >
            <span>{signalCopy}</span>
          </div>
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
        {mode === 'customer' || mode === 'customer-login' ? (
          <>
            <div className="cosmos-poster cosmos-poster--one" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.12), rgba(2, 6, 23, 0.72)), url(${accentArtwork})` }} />
            <div className="cosmos-poster cosmos-poster--two" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.14), rgba(2, 6, 23, 0.76)), url(${accentArtwork})` }} />
            <div className="cosmos-poster cosmos-poster--three" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.18), rgba(2, 6, 23, 0.78)), url(${accentArtwork})` }} />
          </>
        ) : null}
      </div>
    </div>
  )
}
