export type PlexBit = 0 | 1

export function toPlexBit(v: unknown): PlexBit {
  return v === true || v === 1 || v === '1' ? 1 : 0
}

export function isTruthyPlexBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1'
}

export function parseXmlAttrs(attrs: string) {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs))) out[m[1]] = m[2]
  return out
}

export function extractServerIdFromServersXml(xml: string, machineIdentifier: string): string | null {
  const matches = [...xml.matchAll(/<Server\s+([^>]+?)\/?>/g)].map(m => m[1])
  const match = matches.map(a => parseXmlAttrs(a)).find(a => String(a.machineIdentifier || '') === machineIdentifier)
  return match ? String(match.id || '') || null : null
}

export function extractUserIdOnServerFromUsersXml(
  xml: string,
  input: { plexUserId?: string | null; email?: string | null; machineIdentifier: string }
): string | null {
  const blocks = xml.split('</User>')
  const targetEmail = String(input.email || '').trim().toLowerCase()
  const targetUserId = String(input.plexUserId || '').trim()
  const machine = String(input.machineIdentifier || '').trim()
  for (const block of blocks) {
    if (!block.includes('<User')) continue
    const userAttrs = block.match(/<User\s+([^>]+?)\/?>/)?.[1] || ''
    const u = parseXmlAttrs(userAttrs)
    const uid = String(u.id || '').trim()
    const uemail = String(u.email || '').trim().toLowerCase()
    if (targetUserId) {
      if (uid !== targetUserId) continue
    } else if (targetEmail) {
      if (!uemail || uemail !== targetEmail) continue
    } else {
      continue
    }

    const serverTags = [...block.matchAll(/<Server\s+([^>]+?)\/?>/g)].map(m => m[1])
    for (const sattrs of serverTags) {
      const s = parseXmlAttrs(sattrs)
      const smachine =
        String(s.machineIdentifier || s.serverMachineIdentifier || s.machine_id || s.machineId || '').trim()
      if (smachine !== machine) continue
      const id = String(s.id || '').trim()
      if (id) return id
    }
  }
  return null
}

export function buildSharedServerUpdateForm(input: {
  serverId?: string | null
  librarySectionIds?: Array<number | string>
  settings?: Partial<{
    allow_sync: unknown
    allow_tuners: unknown
    allow_channels: unknown
    allow_camera_upload: unknown
    allow_subtitle_admin: unknown
  }>
  filters?: Partial<{
    filter_all: unknown
    filter_movies: unknown
    filter_television: unknown
  }>
}) {
  const form = new URLSearchParams()
  if (input.serverId) form.set('server_id', String(input.serverId))

  const libs = Array.isArray(input.librarySectionIds)
    ? input.librarySectionIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : []
  if (libs.length) form.set('shared_server[library_section_ids]', libs.join(','))

  const settings = input.settings || {}
  if (settings.allow_sync !== undefined) form.set('shared_server[allowSync]', String(toPlexBit(settings.allow_sync)))
  if (settings.allow_tuners !== undefined) form.set('shared_server[allowTuners]', String(toPlexBit(settings.allow_tuners)))
  if (settings.allow_channels !== undefined) form.set('shared_server[allowChannels]', String(toPlexBit(settings.allow_channels)))
  if (settings.allow_camera_upload !== undefined) form.set('shared_server[allowCameraUpload]', String(toPlexBit(settings.allow_camera_upload)))
  if (settings.allow_subtitle_admin !== undefined) form.set('shared_server[allowSubtitleAdmin]', String(toPlexBit(settings.allow_subtitle_admin)))

  const filters = input.filters || {}
  if (filters.filter_all !== undefined) form.set('shared_server[filterAll]', String(filters.filter_all || ''))
  if (filters.filter_movies !== undefined) form.set('shared_server[filterMovies]', String(filters.filter_movies || ''))
  if (filters.filter_television !== undefined) form.set('shared_server[filterTelevision]', String(filters.filter_television || ''))

  return { form, libs }
}
