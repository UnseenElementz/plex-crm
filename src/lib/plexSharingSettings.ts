type SharingSettingsShape = {
  allowChannels: boolean
  filterMovies: string
  filterMusic: string
  filterPhotos: string | null
  filterTelevision: string
  filterAll: string | null
  allowSync: boolean
  allowCameraUpload: boolean
  allowSubtitleAdmin: boolean
  allowTuners: number
}

type SharingSettingsResult = {
  ok: boolean
  status: number
  responseText: string
  settings: SharingSettingsShape | null
}

function toBool(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function toNullableString(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

function normalizeSharingSettings(input: Record<string, unknown> | null | undefined): SharingSettingsShape {
  const source = input || {}
  return {
    allowChannels: toBool(source.allowChannels),
    filterMovies: String(source.filterMovies || ''),
    filterMusic: String(source.filterMusic || ''),
    filterPhotos: toNullableString(source.filterPhotos),
    filterTelevision: String(source.filterTelevision || ''),
    filterAll: toNullableString(source.filterAll),
    allowSync: toBool(source.allowSync),
    allowCameraUpload: toBool(source.allowCameraUpload),
    allowSubtitleAdmin: toBool(source.allowSubtitleAdmin),
    allowTuners: Number(source.allowTuners || 0) || 0,
  }
}

function buildSharingSettingsQuery(token: string, invitedId: string) {
  return new URLSearchParams({
    invitedId,
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.147.1',
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Platform': 'Chrome',
    'X-Plex-Platform-Version': '123.0',
    'X-Plex-Features': 'external-media,indirect-media,hub-style-list',
    'X-Plex-Model': 'bundled',
    'X-Plex-Device': 'Windows',
    'X-Plex-Device-Name': 'Chrome',
    'X-Plex-Device-Screen-Resolution': '1920x1080,1920x1080',
    'X-Plex-Language': 'en',
    'X-Plex-Token': token,
  })
}

function sharingSettingsUrl(token: string, invitedId: string) {
  return `https://clients.plex.tv/api/v2/sharing_settings?${buildSharingSettingsQuery(token, invitedId).toString()}`
}

function sharingSettingsHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  } as Record<string, string>
}

export async function getPlexSharingSettings(token: string, invitedId: string): Promise<SharingSettingsResult> {
  const res = await fetch(sharingSettingsUrl(token, invitedId), {
    method: 'GET',
    headers: sharingSettingsHeaders(token),
    cache: 'no-store',
  })
  const responseText = await res.text().catch(() => '')
  let settings: SharingSettingsShape | null = null
  try {
    settings = normalizeSharingSettings(JSON.parse(responseText))
  } catch {}
  return { ok: res.ok, status: res.status, responseText, settings }
}

export async function updatePlexSharingSettings(
  token: string,
  invitedId: string,
  partial: Partial<SharingSettingsShape>
): Promise<SharingSettingsResult> {
  const current = await getPlexSharingSettings(token, invitedId)
  const merged = normalizeSharingSettings({ ...(current.settings || {}), ...partial })

  const res = await fetch(sharingSettingsUrl(token, invitedId), {
    method: 'POST',
    headers: sharingSettingsHeaders(token),
    body: JSON.stringify({ settings: merged }),
    cache: 'no-store',
  })
  const responseText = await res.text().catch(() => '')

  let settings: SharingSettingsShape | null = null
  try {
    settings = normalizeSharingSettings(JSON.parse(responseText))
  } catch {}

  if (!settings) {
    const verified = await getPlexSharingSettings(token, invitedId).catch(() => null)
    if (verified?.settings) settings = verified.settings
  }

  return { ok: res.ok, status: res.status, responseText, settings }
}
