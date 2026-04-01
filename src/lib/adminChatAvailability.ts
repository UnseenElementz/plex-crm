export type AdminAvailability = 'off' | 'waiting' | 'active'

export function normalizeAvailability(v: any): AdminAvailability {
  const s = String(v || '').toLowerCase()
  if (s === 'off' || s === 'waiting' || s === 'active') return s
  return 'active'
}

export function resolveAvailability(opts: { local?: any; dbAvailability?: any; dbChatOnline?: any }): AdminAvailability {
  const dbAvail = opts.dbAvailability !== undefined && opts.dbAvailability !== null ? normalizeAvailability(opts.dbAvailability) : null
  if (dbAvail) return dbAvail
  if (opts.dbChatOnline === false) return 'off'
  const local = opts.local !== undefined && opts.local !== null ? normalizeAvailability(opts.local) : null
  return local || 'active'
}

