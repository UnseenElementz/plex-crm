import { NextResponse } from 'next/server'
import { supabase, getSupabase } from '@/lib/supabaseClient'

export async function GET(_: Request, { params }: { params: { id: string } }){
  const s = supabase || getSupabase()
  if (!s) return NextResponse.json([])
  const { data } = await s.from('payments').select('*').eq('customer_id', params.id).order('created_at', { ascending: false })
  return NextResponse.json(data || [])
}
