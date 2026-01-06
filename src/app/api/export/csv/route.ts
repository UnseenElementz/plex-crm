import { NextResponse } from 'next/server'
import { supabase, getSupabase } from '@/lib/supabaseClient'
import { calculatePrice } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'

export async function GET(){
  let pricingConfig: any = null
  try{
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    if (url && key){
      const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const r = await s.from('admin_settings').select('*').maybeSingle()
      const d: any = r.data || null
      if (d){
        pricingConfig = {
          monthly_price: Number(d.monthly_price) || 15,
          yearly_price: Number(d.yearly_price) || 85,
          stream_monthly_price: Number(d.stream_monthly_price) || 5,
          stream_yearly_price: Number(d.stream_yearly_price) || 20,
        }
      }
    }
  }catch{}
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
      Price: calculatePrice(plan, c.streams, pricingConfig),
      NextDue: nextDue,
      Status: status
    }
  })
  const header = Object.keys(rows[0] || {}).join(',')
  const csv = [header, ...rows.map(r=> Object.values(r).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv' } })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
