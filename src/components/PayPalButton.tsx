"use client"

export default function PayPalButton({ amount, currency = 'GBP', plan, streams }: { amount: number; currency?: string; customerEmail?: string; plan?: 'monthly'|'yearly'; streams?: number; onSuccess?: (orderId: string) => void }){
  
  const getPlanLabel = (p?: string) => {
    if (p === 'yearly') return '1 Year Hosting'
    return 'Monthly Hosting'
  }

  const currentPlanLabel = getPlanLabel(plan)
  const currentStreamsLabel = streams === 1 ? '1 Stream' : `${streams} Streams`
  const yourReference = `${currentPlanLabel} – ${currentStreamsLabel}`

  return (
    <div className="glass p-6 rounded-xl border border-amber-500/20 bg-amber-900/10 space-y-6">
      <div className="text-center border-b border-white/10 pb-4">
        <div className="text-slate-400 text-sm uppercase tracking-wider mb-1">Total to Pay</div>
        <div className="text-3xl font-bold text-emerald-400">£{amount.toFixed(2)}</div>
      </div>

      <div className="space-y-4 text-slate-300 text-sm">
        <p>Please send payment via PayPal.</p>
        
        <div className="bg-black/20 p-4 rounded-lg border border-white/5">
          <p className="mb-2">The payment reference should clearly state the package you selected, for example:</p>
          <ul className="list-none space-y-1 text-slate-400 italic mb-3 pl-2 border-l-2 border-slate-600">
            <li>– 1 Year Hosting – 2 Streams</li>
            <li>– 3 Years Hosting – 1 Stream</li>
          </ul>
          
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-amber-400 uppercase tracking-wide mb-1">Your Reference to use:</p>
            <p className="font-mono text-slate-100 bg-black/40 p-2 rounded text-center select-all cursor-pointer hover:bg-black/60 transition-colors" title="Click to select">
              {yourReference}
            </p>
          </div>
        </div>

        <div className="text-center py-2">
          <p className="mb-1">The PayPal address is:</p>
          <div className="text-lg font-semibold text-white select-all bg-amber-500/10 py-2 rounded border border-amber-500/20">
            streamzrus1@gmail.com
          </div>
        </div>

        <p className="text-center text-slate-400 italic">
          Once signed up, you will receive an invite shortly after.
        </p>
      </div>
    </div>
  )
}
