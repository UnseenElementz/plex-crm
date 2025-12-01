import { NextResponse } from 'next/server'
import { supabase, getSupabase } from '@/lib/supabaseClient'
import { calculatePrice } from '@/lib/pricing'

export async function GET(){
  const s = supabase || getSupabase()
  if (!s) return new NextResponse('', { headers: { 'Content-Type': 'text/csv' } })
  const { data } = await s.from('customers').select('*')
  const rows = (data || []).map((c:any)=> {
    const plan = c.plan ?? c.subscription_type
    const nextDue = c.next_due_date ?? c.next_payment_date
    const status = c.status ?? c.subscription_status
    return {
      Name: c.full_name ?? c.name,
      Email: c.email,
      Plan: plan,
      Streams: c.streams,
      Price: calculatePrice(plan, c.streams),
      NextDue: nextDue,
      Status: status
    }
  })
  const header = Object.keys(rows[0] || {}).join(',')
  const csv = [header, ...rows.map(r=> Object.values(r).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv' } })
}
