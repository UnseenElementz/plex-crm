import { addMonths, addYears, differenceInCalendarDays, startOfDay } from 'date-fns'

export type Plan = 'monthly' | 'yearly' | 'movies_only' | 'tv_only'
export const TRANSACTION_FEE = 5

export type PricingConfig = {
  yearly_price: number
  stream_yearly_price: number
  movies_only_price: number
  tv_only_price: number
  downloads_price?: number
}

export const STANDARD_PRICING_CONFIG: PricingConfig = {
  yearly_price: 85,
  stream_yearly_price: 20,
  movies_only_price: 60,
  tv_only_price: 60,
  downloads_price: 20,
}

function readPricingConfig(): PricingConfig | null {
  try{
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('admin_settings')
    if (!raw) return null
    const s = JSON.parse(raw)
    return {
      yearly_price: Number(s.yearly_price) || STANDARD_PRICING_CONFIG.yearly_price,
      stream_yearly_price: Number(s.stream_yearly_price) || STANDARD_PRICING_CONFIG.stream_yearly_price,
      movies_only_price: Number(s.movies_only_price) || STANDARD_PRICING_CONFIG.movies_only_price,
      tv_only_price: Number(s.tv_only_price) || STANDARD_PRICING_CONFIG.tv_only_price,
      downloads_price: Number(s.downloads_price) || STANDARD_PRICING_CONFIG.downloads_price,
    }
  }catch{ return null }
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100
}

export function applyUniformDiscount(percentage: number, baseConfig: PricingConfig = STANDARD_PRICING_CONFIG): PricingConfig {
  const safePercentage = Math.min(100, Math.max(0, Number(percentage) || 0))
  const multiplier = (100 - safePercentage) / 100
  return {
    yearly_price: roundPrice(baseConfig.yearly_price * multiplier),
    stream_yearly_price: roundPrice(baseConfig.stream_yearly_price * multiplier),
    movies_only_price: roundPrice(baseConfig.movies_only_price * multiplier),
    tv_only_price: roundPrice(baseConfig.tv_only_price * multiplier),
    downloads_price: roundPrice((baseConfig.downloads_price ?? STANDARD_PRICING_CONFIG.downloads_price ?? 20) * multiplier),
  }
}

export function inferUniformDiscountPercentage(config?: Partial<PricingConfig> | null): number | null {
  if (!config) return null

  const current = {
    yearly_price: Number(config.yearly_price),
    stream_yearly_price: Number(config.stream_yearly_price),
    movies_only_price: Number(config.movies_only_price),
    tv_only_price: Number(config.tv_only_price),
    downloads_price: Number(config.downloads_price ?? STANDARD_PRICING_CONFIG.downloads_price),
  }

  if (Object.values(current).some((value) => !Number.isFinite(value))) return null

  const discounts = [
    100 * (1 - current.yearly_price / STANDARD_PRICING_CONFIG.yearly_price),
    100 * (1 - current.stream_yearly_price / STANDARD_PRICING_CONFIG.stream_yearly_price),
    100 * (1 - current.movies_only_price / STANDARD_PRICING_CONFIG.movies_only_price),
    100 * (1 - current.tv_only_price / STANDARD_PRICING_CONFIG.tv_only_price),
    100 * (1 - current.downloads_price / (STANDARD_PRICING_CONFIG.downloads_price ?? 20)),
  ].map((value) => Math.min(100, Math.max(0, value)))

  const averageDiscount = discounts.reduce((sum, value) => sum + value, 0) / discounts.length
  const expected = applyUniformDiscount(averageDiscount)
  const matchesUniformDiscount =
    Math.abs(expected.yearly_price - current.yearly_price) <= 0.05 &&
    Math.abs(expected.stream_yearly_price - current.stream_yearly_price) <= 0.05 &&
    Math.abs(expected.movies_only_price - current.movies_only_price) <= 0.05 &&
    Math.abs(expected.tv_only_price - current.tv_only_price) <= 0.05 &&
    Math.abs((expected.downloads_price ?? 0) - current.downloads_price) <= 0.05

  if (!matchesUniformDiscount) return null
  return roundPrice(averageDiscount)
}

export function calculatePrice(plan: Plan, streams: number, config?: PricingConfig | null, downloads?: boolean): number {
  const cfg = config || readPricingConfig()
  const included = 1
  const extra = Math.max(0, streams - included)
  
  let base = STANDARD_PRICING_CONFIG.yearly_price
  let extraPrice = STANDARD_PRICING_CONFIG.stream_yearly_price

  if (plan === 'yearly') {
    base = cfg?.yearly_price ?? STANDARD_PRICING_CONFIG.yearly_price
    extraPrice = cfg?.stream_yearly_price ?? STANDARD_PRICING_CONFIG.stream_yearly_price
  } else if (plan === 'movies_only') {
    base = cfg?.movies_only_price ?? STANDARD_PRICING_CONFIG.movies_only_price
    extraPrice = cfg?.stream_yearly_price ?? STANDARD_PRICING_CONFIG.stream_yearly_price
  } else if (plan === 'tv_only') {
    base = cfg?.tv_only_price ?? STANDARD_PRICING_CONFIG.tv_only_price
    extraPrice = cfg?.stream_yearly_price ?? STANDARD_PRICING_CONFIG.stream_yearly_price
  }
  
  let total = base + extra * extraPrice
  if (downloads) {
    total += (cfg?.downloads_price ?? STANDARD_PRICING_CONFIG.downloads_price ?? 20)
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
  const days = differenceInCalendarDays(startOfDay(nextDue), startOfDay(new Date()))
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due Today'
  if (days <= 7) return 'Due Soon'
  return 'Active'
}
