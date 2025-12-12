import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateNextDue } from '@/lib/pricing'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(){
  try{
    const s = svc()
    if (!s) return NextResponse.json({ error: 'service unavailable' }, { status: 503 })

    const { data: profiles } = await s.from('profiles').select('email,full_name,role')
    const customersAdded: any[] = []
    const customersUpdated: any[] = []
    for (const p of (profiles||[])){
      if ((p as any).role !== 'customer') continue
      const email = (p as any).email as string
      if (!email) continue
      const { data: existing } = await s.from('customers').select('*').eq('email', email).limit(1)
      const row = existing?.[0]
      if (!row){
        const now = new Date()
        const ins = {
          email,
          name: (p as any).full_name || email,
          subscription_type: null,
          streams: 1,
          start_date: now.toISOString(),
          next_payment_date: null,
          subscription_status: 'inactive'
        }
        const { data: inserted } = await s.from('customers').insert(ins).select('*')
        if (inserted && inserted[0]) customersAdded.push(inserted[0])
        continue
      }
      const { data: payments } = await s.from('payments').select('id').eq('customer_id', row.id).limit(1)
      const hasPayment = Boolean(payments && payments.length)
      const current = String(row.subscription_status || row.status || '').toLowerCase()
      if (!hasPayment && current !== 'inactive'){
        const { data: updated } = await s.from('customers').update({ subscription_status: 'inactive' }).eq('id', row.id).select('*')
        if (updated && updated[0]) customersUpdated.push(updated[0])
      }
    }
    return NextResponse.json({ added: customersAdded.length, updated: customersUpdated.length, added_rows: customersAdded, updated_rows: customersUpdated })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
