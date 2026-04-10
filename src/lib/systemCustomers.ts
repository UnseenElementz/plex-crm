export const COMMUNITY_STORAGE_CUSTOMER_EMAIL = 'system-community-access@local.streamzr'
export const COMMUNITY_STORAGE_CUSTOMER_NAME = 'System Community Access'
export const PAYPAL_LEDGER_CUSTOMER_EMAIL = 'system-paypal-ledger@local.streamzr'
export const PAYPAL_LEDGER_CUSTOMER_NAME = 'System PayPal Ledger'

const SYSTEM_CUSTOMER_EMAILS = new Set([
  COMMUNITY_STORAGE_CUSTOMER_EMAIL,
  PAYPAL_LEDGER_CUSTOMER_EMAIL,
])

export function normalizeCustomerEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function isSystemCustomerEmail(value: unknown) {
  return SYSTEM_CUSTOMER_EMAILS.has(normalizeCustomerEmail(value))
}
