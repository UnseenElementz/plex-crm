"use client"

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-16">
        <div className="w-full rounded-[32px] border border-cyan-500/20 bg-slate-900/80 p-8 text-center shadow-2xl shadow-cyan-950/40 backdrop-blur">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
            Streamz R Us
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Under Maintenance
          </h1>
          <p className="mt-4 text-base text-slate-300 md:text-lg">
            Any questions please message
          </p>
          <a
            className="mt-6 inline-block text-lg font-medium text-cyan-300 underline underline-offset-4"
            href="mailto:streamzrus1@gmail.com"
          >
            streamzrus1@gmail.com
          </a>
        </div>
      </div>
    </main>
  )
}
