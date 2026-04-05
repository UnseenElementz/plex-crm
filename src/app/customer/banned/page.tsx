export default function CustomerBannedPage() {
  return (
    <main className="page-section flex min-h-screen items-center justify-center py-10">
      <div className="glass-strong w-full max-w-2xl rounded-[32px] border border-rose-500/20 p-8 text-center shadow-[0_30px_120px_rgba(244,63,94,0.14)]">
        <div className="mx-auto inline-flex rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-1 text-[11px] uppercase tracking-[0.24em] text-rose-200">
          Access Suspended
        </div>
        <h1 className="mt-5 text-4xl font-semibold text-white">Your access to this service has been suspended.</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">
          This account has been removed from the service after repeated breaches of the service rules and package limits.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          If you believe this decision was made in error, you can appeal by emailing{' '}
          <a className="text-cyan-300 transition-colors hover:text-cyan-200" href="mailto:streamzrus1@gmail.com">
            streamzrus1@gmail.com
          </a>
          .
        </p>
      </div>
    </main>
  )
}
