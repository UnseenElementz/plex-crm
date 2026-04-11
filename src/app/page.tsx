"use client"

import Link from "next/link"
import { ArrowRight, Headphones, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const metrics = [
  { label: "Support", value: "Direct", note: "Fast replies from people who know the service" },
  { label: "Access", value: "Invite-Only", note: "New members arrive through private customer invites" },
  { label: "Service", value: "Proven", note: "Eight years running properly" },
]

const featurePills = ["Invite Only", "Portal", "Billing", "Support", "Security"]

const cards = [
  {
    icon: Sparkles,
    title: "Premium media hosting",
    description: "Proper media hosting with managed access, organised libraries, and a service that feels premium from the start.",
  },
  {
    icon: Headphones,
    title: "Direct support",
    description: "Fast replies for setup, playback issues, renewals, and account changes without the usual runaround.",
  },
  {
    icon: ShieldCheck,
    title: "Eight years running",
    description: "Built on consistency, active management, and standards that most smaller services never reach.",
  },
]

const stars = [
  { left: "8%", top: "10%", size: 2, delay: "0s" },
  { left: "18%", top: "26%", size: 3, delay: "1.2s" },
  { left: "29%", top: "12%", size: 2, delay: "2.1s" },
  { left: "44%", top: "18%", size: 3, delay: "0.8s" },
  { left: "58%", top: "8%", size: 2, delay: "1.6s" },
  { left: "72%", top: "14%", size: 3, delay: "2.8s" },
  { left: "84%", top: "9%", size: 2, delay: "0.4s" },
  { left: "12%", top: "54%", size: 3, delay: "2.3s" },
  { left: "25%", top: "66%", size: 2, delay: "1.1s" },
  { left: "39%", top: "60%", size: 3, delay: "0.7s" },
  { left: "63%", top: "68%", size: 2, delay: "1.9s" },
  { left: "79%", top: "58%", size: 3, delay: "2.6s" },
]

const shootingStars = [
  { left: "12%", top: "18%", delay: "0.8s", duration: "5.8s" },
  { left: "64%", top: "12%", delay: "2.6s", duration: "6.4s" },
  { left: "38%", top: "32%", delay: "4.1s", duration: "5.6s" },
]

export default function Home() {
  const [parallaxY, setParallaxY] = useState(0)
  const [heroImageUrl, setHeroImageUrl] = useState("")
  const [companyName, setCompanyName] = useState("Streamz R Us")
  const ticking = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        setParallaxY(window.scrollY)
        ticking.current = false
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        const raw = data?.hero_image_url || ""
        const clean = typeof raw === "string" ? raw.replace(/^["'`\s]+|["'`\s]+$/g, "").trim() : ""
        setHeroImageUrl(clean)
        if (data.company_name) setCompanyName(data.company_name)
      } catch {
        setHeroImageUrl("")
      }
    })()
  }, [])

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

  const resolvedHero = heroImageUrl ? normalizeHeroUrl(heroImageUrl) : ""
  const layer = { transform: `translateY(${-(parallaxY * 0.08)}px)` }

  return (
    <main className="relative min-h-[calc(100svh-4.5rem)] overflow-hidden sm:min-h-[calc(100vh-5.5rem)]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.2),transparent_22%),radial-gradient(circle_at_78%_14%,rgba(168,85,247,0.22),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(37,99,235,0.16),transparent_30%),linear-gradient(180deg,rgba(1,4,17,0.98),rgba(3,8,24,0.96)_48%,rgba(2,5,17,0.98))]" />
        {resolvedHero ? (
          <div className="hero-echo">
            <div className="hero-echo__aurora" />
            <div className="hero-echo__image" style={{ backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.64)), url(${resolvedHero})` }} />
          </div>
        ) : null}
        <div className="absolute inset-0 opacity-95" style={layer}>
          <div className="absolute -left-[12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-cyan-400/14 blur-[140px] drift-slower" />
          <div className="absolute right-[-14rem] top-[-6rem] h-[30rem] w-[30rem] rounded-full bg-violet-400/16 blur-[160px] drift-slower" />
          <div className="absolute left-[24%] top-[32%] h-[26rem] w-[26rem] rounded-full bg-blue-500/14 blur-[150px] drift-slower" />
          <div className="absolute bottom-[-12rem] right-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-300/10 blur-[140px] drift-slower" />
          {stars.map((star) => (
            <span
              key={`${star.left}-${star.top}`}
              className="twinkle-soft absolute rounded-full bg-white/85"
              style={{
                left: star.left,
                top: star.top,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: star.delay,
                boxShadow: "0 0 18px rgba(255,255,255,0.65)",
              }}
            />
          ))}
          {shootingStars.map((star) => (
            <span
              key={`${star.left}-${star.top}-trail`}
              className="shooting-star absolute"
              style={{
                left: star.left,
                top: star.top,
                animationDelay: star.delay,
                animationDuration: star.duration,
              }}
            />
          ))}
        </div>
      </div>

      <div className="page-section relative z-10 flex min-h-[calc(100svh-4.5rem)] items-start py-3 sm:min-h-[calc(100vh-5.5rem)] sm:items-center sm:py-6">
      <section className="panel-lift relative w-full overflow-hidden rounded-[24px] border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(3,8,23,0.72),rgba(4,9,24,0.62))] px-3 py-4 shadow-[0_30px_120px_rgba(8,145,178,0.16)] backdrop-blur-[14px] sm:rounded-[36px] sm:px-6 sm:py-6 lg:px-8 lg:py-7">

        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr] xl:items-center">
          <div className="relative z-10 space-y-4 xl:pr-3">
            <div className="eyebrow">
              <Zap size={14} />
              Since 2018
            </div>

            <div>
              <div className="gradient-text text-xs font-medium uppercase tracking-[0.32em] text-cyan-300/90 sm:text-[0.85rem]">
                {companyName}
              </div>
              <h1 className="mt-3 max-w-2xl text-[1.65rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[2.2rem] lg:text-[2.55rem] xl:text-[2.75rem]">
                Private media hosting for invited members.
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-[15px]">
                Stable media hosting, clean customer management, fast support, and a closed-community service where new access is handled through private member invites.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/customer/login" prefetch={false} className="btn shimmer">
                Customer Portal
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" prefetch={false} className="btn-outline">
                Admin Console
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {featurePills.map((pill) => (
                <div key={pill} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-300">
                  {pill}
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {metrics.map((item) => (
                <div key={item.label} className="panel panel-lift px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid gap-4">
            <div className="panel-lift relative overflow-hidden rounded-[34px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(9,16,33,0.72),rgba(7,10,24,0.62))] p-3 shadow-[0_30px_120px_rgba(59,130,246,0.18)]">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
              <div className="absolute -left-8 top-10 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-2xl drift-slower" />
              <div className="absolute -right-6 bottom-8 h-28 w-28 rounded-full border border-cyan-200/10 bg-cyan-300/10 blur-2xl drift-slower" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-2">
                {resolvedHero ? (
                  <img
                    src={resolvedHero}
                    alt=""
                    className="relative z-10 mx-auto aspect-square w-full max-w-[820px] object-contain drop-shadow-[0_30px_80px_rgba(59,130,246,0.26)]"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="panel panel-lift px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Access</div>
                <div className="mt-1 text-base font-semibold text-white">Premium access</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Hosted media access with proper account control, organised libraries, and cleaner day-to-day use.</div>
              </div>
              <div className="panel panel-lift px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Support</div>
                <div className="mt-1 text-base font-semibold text-white">Actual support</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Billing, device help, playback fixes, and direct replies without being passed around.</div>
              </div>
              <div className="panel panel-lift px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">History</div>
                <div className="mt-1 text-base font-semibold text-white">Since 2018</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Eight years of running a serious hosted media service, not a short-term setup thrown together overnight.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon
            return (
              <div key={card.title} className="panel panel-lift fade-up p-4" style={{ animationDelay: `${index * 90}ms` }}>
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white sm:text-base">{card.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">{card.description}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      </div>
    </main>
  )
}
