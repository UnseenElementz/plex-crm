import { addMonths, addYears, differenceInDays } from 'date-fns'

export type Plan = 'monthly' | 'yearly' | 'three_year'
export const TRANSACTION_FEE = 5

function readPricingConfig(){
  try{
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('admin_settings')
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      monthly_price: Number(s.monthly_price) || 15,
      yearly_price: Number(s.yearly_price) || 85,
      stream_monthly_price: Number(s.stream_monthly_price) || 5,
      stream_yearly_price: Number(s.stream_yearly_price) || 20,
    }
  }catch{ return null }
}

export function calculatePrice(plan: Plan, streams: number): number {
  const cfg = readPricingConfig()
  const included = 1
  const extra = Math.max(0, streams - included)
  if (plan === 'three_year') {
    const base = 160
    const extraPrice = 40
    return base + extra * extraPrice
  }
  const base = plan === 'yearly' ? (cfg?.yearly_price ?? 85) : (cfg?.monthly_price ?? 15)
  const extraPrice = plan === 'yearly' ? (cfg?.stream_yearly_price ?? 20) : (cfg?.stream_monthly_price ?? 5)
  return base + extra * extraPrice
}

export function getTransactionFee(plan: Plan): number {
  if (plan === 'three_year') return 10
  return plan === 'yearly' ? 5 : 3
}

export function calculateNextDue(plan: Plan, startDate: Date): Date {
  if (plan === 'three_year') return addYears(startDate, 3)
  return plan === 'yearly' ? addYears(startDate, 1) : addMonths(startDate, 1)
}

export function getStatus(nextDue: Date): 'Active' | 'Due Soon' | 'Overdue' {
  const days = differenceInDays(nextDue, new Date())
  if (days < 0) return 'Overdue'
  if (days <= 7) return 'Due Soon'
  return 'Active'
}
