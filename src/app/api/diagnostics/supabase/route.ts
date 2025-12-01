import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabaseClient'

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const hasEnv = Boolean(url && key)

    const s = getSupabase()
    if (!s) {
      return NextResponse.json({
        ok: false,
        message: 'Supabase client not initialized',
        env: { hasEnv, urlPresent: Boolean(url), keyPresent: Boolean(key) }
      }, { status: 500 })
    }

    // Ping admin_settings
    let settings: any = null
    let settingsError: any = null
    try {
      const { data, error } = await s.from('admin_settings').select('*').single()
      settings = data || null
      settingsError = error || null
    } catch (e: any) {
      settingsError = e?.message || String(e)
    }

    // Count customers
    let customersCount: number | null = null
    let customersError: any = null
    try {
      const { count, error } = await s.from('customers').select('*', { count: 'exact', head: true })
      customersCount = typeof count === 'number' ? count : null
      customersError = error || null
    } catch (e: any) {
      customersError = e?.message || String(e)
    }

    // Count profiles
    let profilesCount: number | null = null
    let profilesError: any = null
    try {
      const { count, error } = await s.from('profiles').select('*', { count: 'exact', head: true })
      profilesCount = typeof count === 'number' ? count : null
      profilesError = error || null
    } catch (e: any) {
      profilesError = e?.message || String(e)
    }

    const settingsErrorStr = settingsError
      ? (typeof settingsError === 'string' ? settingsError : (settingsError.message || JSON.stringify(settingsError)))
      : ''
    const adminStatus = settings
      ? 'found'
      : (settingsError
        ? (settingsErrorStr.toLowerCase().includes('permission denied') ? 'restricted' : 'error')
        : 'missing')

    return NextResponse.json({
      ok: true,
      env: { hasEnv, urlPresent: Boolean(url), keyPresent: Boolean(key) },
      admin_settings: adminStatus,
      admin_settings_sample: settings ? {
        company_name: settings.company_name,
        monthly_price: settings.monthly_price,
        yearly_price: settings.yearly_price
      } : null,
      customers: { count: customersCount, error: customersError ? String(customersError) : null },
      profiles: { count: profilesCount, error: profilesError ? String(profilesError) : null }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || 'Unknown error' }, { status: 500 })
  }
}
