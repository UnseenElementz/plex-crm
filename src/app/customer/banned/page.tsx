import Link from 'next/link'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

const stars = [
  { left: '7%', top: '12%', size: 2, delay: '0.3s' },
  { left: '14%', top: '28%', size: 3, delay: '1.4s' },
  { left: '24%', top: '18%', size: 2, delay: '2.1s' },
  { left: '34%', top: '72%', size: 2, delay: '1.1s' },
  { left: '48%', top: '10%', size: 3, delay: '0.7s' },
  { left: '59%', top: '24%', size: 2, delay: '2.6s' },
  { left: '72%', top: '14%', size: 3, delay: '1.8s' },
  { left: '83%', top: '34%', size: 2, delay: '0.5s' },
  { left: '91%', top: '22%', size: 3, delay: '2.3s' },
]

const streaks = [
  { left: '18%', top: '16%', delay: '0.8s', duration: '6.4s' },
  { left: '62%', top: '12%', delay: '2.6s', duration: '7.1s' },
  { left: '78%', top: '28%', delay: '4.4s', duration: '6.7s' },
]

function normalizeReason(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'tw') return 'time-waster'
  return normalized
}

function getCurrentIp() {
  const store = headers()
  const forwarded = String(store.get('x-forwarded-for') || '').trim()
  const realIp = String(store.get('x-real-ip') || '').trim()
  return (forwarded.split(',')[0] || realIp || '').trim() || 'Unavailable'
}

function getBaseUrl() {
  const store = headers()
  const forwardedProto = String(store.get('x-forwarded-proto') || '').trim()
  const forwardedHost = String(store.get('x-forwarded-host') || '').trim()
  const host = forwardedHost || String(store.get('host') || '').trim()
  const protocol = forwardedProto || 'https'
  return host ? `${protocol}://${host}` : 'https://plex-crm.vercel.app'
}

export default function CustomerBannedPage({
  searchParams,
}: {
  searchParams?: {
    reason?: string
  }
}) {
  const currentIp = getCurrentIp()
  const baseUrl = getBaseUrl()
  const customerLoginUrl = `${baseUrl}/customer/login`
  const reason = normalizeReason(searchParams?.reason)
  const isTimeWaster = reason === 'time-waster'
  const isClosedCommunity = reason === 'closed-community'
  const isServerFull = reason === 'server-full'

  const badge = isTimeWaster || isClosedCommunity || isServerFull ? 'Community Access Update' : 'Access Suspended'
  const headline = isTimeWaster
    ? 'We are not proceeding with access at this time.'
    : isServerFull
    ? 'The server is currently full.'
    : isClosedCommunity
    ? 'This account is no longer active in the closed community.'
    : 'Your access to this service has been suspended.'
  const summary = isTimeWaster
    ? 'As we move towards a more closed community, we are keeping access focused on current members and future joins will be handled more selectively through invite codes from existing customers.'
    : isServerFull
    ? 'New memberships are paused because the server has reached its active member limit. When a slot opens, joins can resume again.'
    : isClosedCommunity
    ? 'This portal is reserved for active members only. Your account is currently inactive, so access to the member area has been switched off.'
    : 'This account has been removed from the service after repeated breaches of the service rules, package limits, or abuse of the platform.'
  const enforcementCopy = isTimeWaster
    ? 'Due to the number of requests we receive, and the time lost in long back-and-forth conversations, we are not able to continue with this enquiry or keep the request open indefinitely.'
    : isServerFull
    ? 'To keep playback stable for current members, new joins stop automatically once the active customer limit is reached. This is not a personal ban and does not mean anything is wrong with your details.'
    : isClosedCommunity
    ? 'If you believe this was done in error, or you were expecting your access to stay live, please get in touch before trying to sign in again. Active access is only kept for customers currently in good standing inside the community.'
    : 'If a PayPal chargeback, fraud claim, or other abusive activity has taken place, the current IP, previous IP history, account activity, and related service logs may be retained and reviewed as part of the investigation.'
  const supportCopy = isTimeWaster
    ? 'This decision may simply come down to timing and capacity on our side. We are sorry to disappoint and genuinely hope you find another server that works well for you.'
    : isServerFull
    ? 'If you were expecting an invite to go through, support can confirm whether new slots have opened again. Until then, new member access stays paused.'
    : isClosedCommunity
    ? 'Once an account is made inactive, member pages are closed off until the service is restored manually. Support can confirm the account position and next step for you.'
    : 'We operate fairly and keep records to protect the service and other customers. Where abuse, fraud, chargebacks, threats, or other serious breaches are involved, we reserve the right to share relevant information with payment providers, hosting partners, platforms, or authorities where reasonably necessary to investigate the matter or recover losses.'

  return (
    <main className="relative left-1/2 right-1/2 ml-[-50vw] mr-[-50vw] w-screen overflow-hidden">
      <section className="time-waster-scene relative min-h-[calc(100vh-5rem)] overflow-hidden">
        <div
          className="time-waster-scene__bg absolute inset-0"
          style={{
            backgroundImage: [
              'linear-gradient(90deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.78) 32%, rgba(2,6,23,0.28) 62%, rgba(2,6,23,0.82) 100%)',
              'radial-gradient(circle at 50% 58%, rgba(255,255,255,0.18), transparent 9%)',
              'url(/time-waster-ban-bg.png)',
            ].join(', '),
          }}
        />
        <div className="time-waster-scene__veil absolute inset-0" />
        <div className="time-waster-scene__ring absolute inset-0" />
        <div className="time-waster-scene__grid absolute inset-0" />
        <div className="time-waster-scene__flare time-waster-scene__flare--left absolute" />
        <div className="time-waster-scene__flare time-waster-scene__flare--right absolute" />

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

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="grid w-full items-end gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="max-w-2xl">
              <div className="eyebrow border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100">{badge}</div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
                {headline}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">
                {summary}
              </p>

              <div className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
                <div className="time-waster-panel rounded-[26px] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-fuchsia-200/80">Portal</div>
                  <div className="mt-2 text-base font-semibold text-white">Blocked</div>
                </div>
                <div className="time-waster-panel rounded-[26px] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">Tracking</div>
                  <div className="mt-2 text-base font-semibold text-white">Active</div>
                </div>
                <div className="time-waster-panel rounded-[26px] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">Status</div>
                  <div className="mt-2 text-base font-semibold text-white">Final Review</div>
                </div>
              </div>
            </div>

            <div className="time-waster-panel rounded-[32px] p-6 sm:p-7">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Current IP Seen On This Request</div>
              <div className="mt-3 break-all text-2xl font-semibold text-white">{currentIp}</div>

              <div className="mt-6 border-t border-white/10 pt-6 text-sm leading-7 text-slate-200">
                <p>{enforcementCopy}</p>
                <p className="mt-3">{supportCopy}</p>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4 text-left">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Website Login Route</div>
                <div className="mt-2 break-all text-sm text-cyan-200">{customerLoginUrl}</div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a className="btn-outline" href="mailto:streamzrus1@gmail.com">
                  Contact Support
                </a>
                <Link className="btn-outline" href="/">
                  Return Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
