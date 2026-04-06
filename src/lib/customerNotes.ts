export type ParsedCustomerNotes = {
  plainNotes: string
  plexUsername: string
  timezone: string
  downloads: boolean
}

export function parseCustomerNotes(notes?: string | null): ParsedCustomerNotes {
  const source = String(notes || '')
  const plexMatch = source.match(/Plex:\s*([^\n]+)/i)
  const timezoneMatch = source.match(/Timezone:\s*([^\n]+)/i)
  const downloads = /Downloads:\s*Yes/i.test(source)

  const plainNotes = source
    .replace(/Plex:\s*[^\n]+\n?/gi, '')
    .replace(/Timezone:\s*[^\n]+\n?/gi, '')
    .replace(/Downloads:\s*Yes\n?/gi, '')
    .trim()

  return {
    plainNotes,
    plexUsername: plexMatch?.[1]?.trim() || '',
    timezone: timezoneMatch?.[1]?.trim() || '',
    downloads,
  }
}

export function buildCustomerNotes(input: {
  plainNotes?: string | null
  plexUsername?: string | null
  timezone?: string | null
  downloads?: boolean | null
}) {
  return [
    String(input.plainNotes || '').trim() || undefined,
    input.plexUsername ? `Plex: ${String(input.plexUsername).trim()}` : undefined,
    input.timezone ? `Timezone: ${String(input.timezone).trim()}` : undefined,
    input.downloads ? 'Downloads: Yes' : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}
