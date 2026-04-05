import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !anon) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function GET(request: Request){
  const header = String(request.headers.get('authorization') || '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = authClient()
  const service = serviceClient()
  if (!auth || !service) return NextResponse.json([])

  const { data: authData, error: authError } = await auth.auth.getUser(token)
  const email = String(authData?.user?.email || '').trim().toLowerCase()
  if (authError || !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customers } = await service.from('customers').select('id').eq('email', email).limit(1)
  const customer = customers?.[0]
  if (!customer) return NextResponse.json([])
  const { data } = await service.from('payments').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })
  const rows = Array.isArray(data)
    ? data.map((row: any) => ({
        ...row,
        provider: row.provider || row.payment_method || 'PayPal',
        currency: row.currency || 'GBP',
      }))
    : []
  return NextResponse.json(rows)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
