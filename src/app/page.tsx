"use client"

import Link from "next/link"
import { ArrowRight, Headphones, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const defaultHeroImage =
  "https://i.postimg.cc/dtPrkWhm/BCO-83b70ff0-5bc4-418d-a4f0-97e59f6c75bf-(1).png"

const metrics = [
  { label: "Support", value: "Live", note: "Fast direct replies" },
  { label: "Access", value: "Tracked", note: "Devices, usage, renewals" },
  { label: "Service", value: "Stable", note: "Eight years running" },
]

const featurePills = ["Portal", "Billing", "Support", "Security", "Admin"]

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

export default function Home() {
  const [parallaxY, setParallaxY] = useState(0)
  const [heroImageUrl, setHeroImageUrl] = useState(defaultHeroImage)
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
        if (clean) setHeroImageUrl(clean)
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
      <section className="relative w-full overflow-hidden rounded-[36px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(34,211,238,0.16),transparent_24%),linear-gradient(180deg,rgba(2,8,23,0.96),rgba(5,10,24,0.92))] px-4 py-5 shadow-[0_30px_120px_rgba(8,145,178,0.16)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 opacity-90" style={layer}>
            <div className="absolute -left-10 top-[-2rem] h-52 w-52 rounded-full bg-cyan-400/14 blur-3xl drift-slower" />
            <div className="absolute right-[-3rem] top-[10%] h-64 w-64 rounded-full bg-violet-400/14 blur-3xl drift-slower" />
            <div className="absolute bottom-[-3rem] left-[28%] h-56 w-56 rounded-full bg-blue-500/16 blur-3xl drift-slower" />
            <div className="absolute inset-x-0 top-[48%] h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
            {stars.map((star) => (
              <span
                key={`${star.left}-${star.top}`}
                className="twinkle-soft absolute rounded-full bg-white/80"
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
          </div>
        </div>

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
              <h1 className="mt-3 max-w-2xl text-[1.9rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[2.2rem] lg:text-[2.55rem] xl:text-[2.75rem]">
                Private media hosting with a cleaner customer experience.
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-[15px]">
                Straightforward renewals, direct support, and stable access built into one modern account system.
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
                <div key={item.label} className="panel px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-50">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid gap-4">
            <div className="relative overflow-hidden rounded-[34px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(9,16,33,0.72),rgba(7,10,24,0.62))] p-3 shadow-[0_30px_120px_rgba(59,130,246,0.18)]">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
              <div className="absolute -left-8 top-10 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-2xl drift-slower" />
              <div className="absolute -right-6 bottom-8 h-28 w-28 rounded-full border border-cyan-200/10 bg-cyan-300/10 blur-2xl drift-slower" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-2">
                {proxiedHero ? (
                  <img
                    src={proxiedHero}
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
              <div className="panel px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Visual</div>
                <div className="mt-1 text-base font-semibold text-white">Full artwork</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Shown clearly as the hero focus, not hidden behind panels.</div>
              </div>
              <div className="panel px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Atmosphere</div>
                <div className="mt-1 text-base font-semibold text-white">Cosmic motion</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Floating glows, star shimmer, and slower movement in the background.</div>
              </div>
              <div className="panel px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Tone</div>
                <div className="mt-1 text-base font-semibold text-white">Less noise</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">Smaller headings and calmer wording so the image can lead.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon
            return (
              <div key={card.title} className="panel fade-up p-4" style={{ animationDelay: `${index * 90}ms` }}>
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
    </main>
  )
}
