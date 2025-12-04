import { NextResponse } from 'next/server'
import { supabase, getSupabase } from '@/lib/supabaseClient'

export async function GET(){
  const email = '' // replace with authenticated user email
  const s = supabase || getSupabase()
  if (!s) return NextResponse.json([])
  const { data: customers } = await s.from('customers').select('*').eq('email', email).limit(1)
  const customer = customers?.[0]
  if (!customer) return NextResponse.json([])
  const { data } = await s.from('payments').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })
  return NextResponse.json(data || [])
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
