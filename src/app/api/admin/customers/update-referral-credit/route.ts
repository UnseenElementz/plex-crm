import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { parseCustomerNotes, mergeCustomerNotes } from '@/lib/customerNotes'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customerId = String(body?.customerId || '').trim()
    const nextCredit = Math.max(0, Number(body?.credit ?? 0))

    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    }

    if (!Number.isFinite(nextCredit)) {
      return NextResponse.json({ error: 'Credit must be a valid number' }, { status: 400 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id,email,notes')
      .eq('id', customerId)
      .single()

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 })
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer account was not found' }, { status: 404 })
    }

    const parsedNotes = parseCustomerNotes(customer.notes || '')
    const previousCredit = Number(parsedNotes.referralCredit || 0)
    const nextNotes = mergeCustomerNotes({
      existing: customer.notes,
      referralCredit: Number(nextCredit.toFixed(2)),
    })

    const { error: updateError } = await supabase
      .from('customers')
      .update({ notes: nextNotes })
      .eq('id', customerId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      customerId,
      customerEmail: customer.email,
      previousCredit,
      referralCredit: Number(nextCredit.toFixed(2)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update referral credit' }, { status: 400 })
  }
}

export const runtime = 'nodejs'
