"use client"

import Link from "next/link"
import { ArrowRight, Headphones, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const metrics = [
  { label: "Support", value: "Live", note: "Fast human replies" },
  { label: "Access", value: "Tracked", note: "Usage, devices, and renewals" },
  { label: "Admin", value: "Clean", note: "Less clutter, more control" },
]

const featurePills = ["Portal", "Support", "Billing", "Plex", "Email", "Security"]

const cards = [
  {
    icon: Sparkles,
    title: "Private hosting",
    description: "Hosted media access with a cleaner account experience.",
  },
  {
    icon: Headphones,
    title: "Direct support",
    description: "Fast replies with the right service and account context.",
  },
  {
    icon: ShieldCheck,
    title: "Eight years running",
    description: "Stable service that has been refined over time, not rushed together.",
  },
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
      } catch {}
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

  const proxiedHero = heroImageUrl ? `/api/proxy-image?src=${encodeURIComponent(normalizeHeroUrl(heroImageUrl))}` : ""
  const layer = { transform: `translateY(${-(parallaxY * 0.08)}px)` }

  return (
    <main className="page-section flex min-h-[calc(100vh-5.5rem)] items-center py-4 sm:py-6">
      <section className="relative w-full overflow-hidden rounded-[36px] border border-cyan-400/15 bg-slate-950/60 px-4 py-5 shadow-[0_30px_120px_rgba(8,145,178,0.16)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 opacity-80" style={layer}>
            <div className="absolute -left-12 top-0 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
          <div className="space-y-4">
            <div className="eyebrow">
              <Zap size={14} />
              Since 2018
            </div>

            <div>
              <div className="gradient-text text-xs font-medium uppercase tracking-[0.32em] text-cyan-300/90 sm:text-[0.85rem]">
                {companyName}
              </div>
              <h1 className="mt-3 max-w-3xl text-[2rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-[2.45rem] lg:text-[2.9rem] xl:text-[3.1rem]">
                Private media hosting with clean support and simple account access.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                Eight years of stable hosted media access, straightforward renewals, and direct support in one polished system.
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
                <div key={item.label} className="panel px-4 py-3.5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                  <div className="mt-1.5 text-xl font-semibold text-slate-50">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="panel-strong relative overflow-hidden p-4 sm:p-5">
              {proxiedHero ? (
                <div className="pointer-events-none absolute inset-0 opacity-25">
                  <img
                    src={proxiedHero}
                    alt=""
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
              ) : null}
              <div className="relative">
                <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Private media hosting</div>
                <div className="mt-2 text-lg font-semibold text-white sm:text-[1.35rem]">Stable service, clear access, direct support.</div>
                <p className="mt-2.5 max-w-md text-sm leading-6 text-slate-400">
                  A calmer front door for billing, account access, and support without the usual clutter.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              {cards.map((card, index) => {
                const Icon = card.icon
                return (
                  <div key={card.title} className="panel fade-up p-3.5" style={{ animationDelay: `${index * 90}ms` }}>
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
          </div>
        </div>
      </section>
    </main>
  )
}
