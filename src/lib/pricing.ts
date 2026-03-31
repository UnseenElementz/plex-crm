import { addMonths, addYears, differenceInDays } from 'date-fns'

export type Plan = 'monthly' | 'yearly' | 'movies_only' | 'tv_only'
export const TRANSACTION_FEE = 5

export type PricingConfig = {
  yearly_price: number
  stream_yearly_price: number
  movies_only_price: number
  tv_only_price: number
  downloads_price?: number
}

function readPricingConfig(): PricingConfig | null {
  try{
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('admin_settings')
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      yearly_price: Number(s.yearly_price) || 85,
      stream_yearly_price: Number(s.stream_yearly_price) || 20,
      movies_only_price: Number(s.movies_only_price) || 60,
      tv_only_price: Number(s.tv_only_price) || 60,
      downloads_price: Number(s.downloads_price) || 20,
    }
  }catch{ return null }
}

export function calculatePrice(plan: Plan, streams: number, config?: PricingConfig | null, downloads?: boolean): number {
  const cfg = config || readPricingConfig()
  const included = 1
  const extra = Math.max(0, streams - included)
  
  let base = 85
  let extraPrice = 20

  if (plan === 'yearly') {
    base = cfg?.yearly_price ?? 85
    extraPrice = cfg?.stream_yearly_price ?? 20
  } else if (plan === 'movies_only') {
    base = cfg?.movies_only_price ?? 60
    extraPrice = cfg?.stream_yearly_price ?? 20
  } else if (plan === 'tv_only') {
    base = cfg?.tv_only_price ?? 60
    extraPrice = cfg?.stream_yearly_price ?? 20
  }
  
  let total = base + extra * extraPrice
  if (downloads) {
    total += (cfg?.downloads_price ?? 20)
  }
  return total
}

export function getTransactionFee(plan: Plan): number {
  return plan === 'yearly' ? 5 : 3
}

export function calculateNextDue(plan: Plan, startDate: Date): Date {
  if (plan === 'movies_only' || plan === 'tv_only' || plan === 'yearly') {
    return addYears(startDate, 1)
  }
  return addMonths(startDate, 1)
}

export function getStatus(nextDue: Date): 'Active' | 'Due Soon' | 'Due Today' | 'Overdue' {
  const days = differenceInDays(nextDue, new Date())
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due Today'
  if (days <= 7) return 'Due Soon'
  return 'Active'
}
