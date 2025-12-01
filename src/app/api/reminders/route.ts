import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { differenceInDays } from 'date-fns'
import { sendRenewalEmail, renewalEmailTemplate30Days, renewalEmailTemplate7Days, renewalEmailTemplate0Days } from '@/lib/email'

export async function POST() {
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  const { data: customers, error } = await supabase.from('customers').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const today = new Date()
  const candidates = (customers || []).map((c: any) => ({ c, daysLeft: differenceInDays(new Date(c.next_due_date), today) }))
  const dueSoon = candidates.filter(({ daysLeft }) => daysLeft === 30 || daysLeft === 7 || daysLeft === 0)
  let sent = 0
  for (const item of dueSoon) {
    try {
      const tpl = item.daysLeft === 30 ? renewalEmailTemplate30Days() : item.daysLeft === 7 ? renewalEmailTemplate7Days() : renewalEmailTemplate0Days()
      await sendRenewalEmail(item.c.email, tpl)
      sent++
    } catch (e) {}
  }
  return NextResponse.json({ ok: true, count: sent })
}
