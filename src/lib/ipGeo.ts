type IpGeoResult = {
  city: string | null
  region: string | null
  country: string | null
  postalCode: string | null
  latitude: string | null
  longitude: string | null
  label: string | null
}

const GEO_TTL_MS = 1000 * 60 * 60 * 12
const geoCache = new Map<string, { expiresAt: number; value: IpGeoResult | null }>()

function cleanText(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function isPrivateOrInvalidIp(ip: string) {
  const value = String(ip || '').trim()
  if (!value || value === 'unknown') return true
  if (value === '127.0.0.1' || value === '::1') return true
  if (value.startsWith('10.')) return true
  if (value.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true
  if (value.startsWith('169.254.')) return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('fe80:')) return true
  return false
}

function buildLabel(input: {
  city?: string | null
  region?: string | null
  country?: string | null
  postalCode?: string | null
}) {
  const place = [cleanText(input.city), cleanText(input.region), cleanText(input.country)].filter(Boolean).join(', ')
  if (!place) return null
  const postal = cleanText(input.postalCode)
  return postal ? `${place} ${postal}` : place
}

function buildGeoValue(input: {
  city?: unknown
  region?: unknown
  country?: unknown
  postalCode?: unknown
  latitude?: unknown
  longitude?: unknown
}): IpGeoResult {
  const city = cleanText(input.city)
  const region = cleanText(input.region)
  const country = cleanText(input.country)
  const postalCode = cleanText(input.postalCode)
  return {
    city,
    region,
    country,
    postalCode,
    latitude: cleanText(input.latitude),
    longitude: cleanText(input.longitude),
    label: buildLabel({ city, region, country, postalCode }),
  }
}

export async function lookupIpGeo(ip: string): Promise<IpGeoResult | null> {
  const normalizedIp = String(ip || '').trim()
  if (isPrivateOrInvalidIp(normalizedIp)) return null

  const cached = geoCache.get(normalizedIp)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      next: { revalidate: 3600 },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      geoCache.set(normalizedIp, { expiresAt: Date.now() + 1000 * 60 * 15, value: null })
      return null
    }

    const payload = await response.json().catch(() => null)
    if (payload?.success) {
      const value = buildGeoValue({
        city: payload.city,
        region: payload.region,
        country: payload.country,
        postalCode: payload.postal,
        latitude: payload.latitude,
        longitude: payload.longitude,
      })
      geoCache.set(normalizedIp, { expiresAt: Date.now() + GEO_TTL_MS, value })
      return value
    }

    const fallbackController = new AbortController()
    const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 3500)
    const fallbackResponse = await fetch(`https://ipapi.co/${encodeURIComponent(normalizedIp)}/json/`, {
      signal: fallbackController.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      next: { revalidate: 3600 },
    }).catch(() => null)
    clearTimeout(fallbackTimeoutId)

    if (!fallbackResponse?.ok) {
      geoCache.set(normalizedIp, { expiresAt: Date.now() + 1000 * 60 * 15, value: null })
      return null
    }

    const fallbackPayload = await fallbackResponse.json().catch(() => null)
    if (!fallbackPayload || fallbackPayload.error) {
      geoCache.set(normalizedIp, { expiresAt: Date.now() + 1000 * 60 * 15, value: null })
      return null
    }

    const fallbackValue = buildGeoValue({
      city: fallbackPayload.city,
      region: fallbackPayload.region,
      country: fallbackPayload.country_name || fallbackPayload.country,
      postalCode: fallbackPayload.postal,
      latitude: fallbackPayload.latitude,
      longitude: fallbackPayload.longitude,
    })

    geoCache.set(normalizedIp, { expiresAt: Date.now() + GEO_TTL_MS, value: fallbackValue })
    return fallbackValue
  } catch {
    geoCache.set(normalizedIp, { expiresAt: Date.now() + 1000 * 60 * 15, value: null })
    return null
  }
}
