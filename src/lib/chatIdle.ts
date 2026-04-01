export function shouldAutoWait(opts: { lastAdminAt?: string | null; lastCustomerAt?: string | null; nowMs: number; idleMinutes: number }) {
  const lastAdmin = opts.lastAdminAt ? new Date(opts.lastAdminAt).getTime() : 0
  if (!lastAdmin) return false
  const lastCustomer = opts.lastCustomerAt ? new Date(opts.lastCustomerAt).getTime() : 0
  if (lastCustomer > lastAdmin) return false
  const diffMin = (opts.nowMs - lastAdmin) / 60000
  return diffMin >= opts.idleMinutes
}

export function nextConversationStatus(opts: { current: 'active' | 'waiting' | 'closed'; senderType: 'customer' | 'admin' }) {
  if (opts.current === 'closed') return 'closed' as const
  if (opts.senderType === 'admin') return 'active' as const
  if (opts.senderType === 'customer' && opts.current === 'waiting') return 'active' as const
  return opts.current
}

