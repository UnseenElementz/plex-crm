import { NextResponse } from 'next/server'
import { supabase, getSupabase } from '@/lib/supabaseClient'
import { addMonths, addYears } from 'date-fns'

export async function POST(request: Request) {
  const event = await request.json()
  const type = event.event_type
  if (type !== 'PAYMENT.CAPTURE.COMPLETED') return NextResponse.json({ ok: true })

  const capture = event.resource
  const email = capture?.payer?.email_address
  const amount = Number(capture?.amount?.value || 0)

  if (!email) return NextResponse.json({ error: 'no email' }, { status: 400 })

  const s = supabase || getSupabase()
  if (!s) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { data: customers } = await s.from('customers').select('*').eq('email', email).limit(1)
  const customer = customers?.[0]
  if (!customer) return NextResponse.json({ error: 'customer not found' }, { status: 404 })

  const nextDue = customer.plan === 'yearly' ? addYears(new Date(customer.next_due_date), 1) : addMonths(new Date(customer.next_due_date), 1)

  await s.from('payments').insert({ customer_id: customer.id, amount, currency: 'GBP', provider: 'paypal', status: 'completed' })
  await s.from('customers').update({ next_due_date: nextDue.toISOString() }).eq('id', customer.id)

  return NextResponse.json({ ok: true })
}
