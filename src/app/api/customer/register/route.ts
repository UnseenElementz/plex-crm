import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import {
  createReferralCode,
  getReferralRewardAmount,
  normalizeReferralCode,
  REFERRAL_CREDIT_CAP_GBP,
} from '@/lib/referrals'

export const runtime = 'nodejs'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function ensureUniqueReferralCode(supabase: any, seed: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextCode = createReferralCode(seed, attempt)
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('referral_code', nextCode)
      .maybeSingle()

    if (!existing) return nextCode
  }

  return createReferralCode(`${seed}${Math.random().toString(36).slice(2, 6)}`)
}

export async function POST(request: Request) {
  try {
    const supabase = serviceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase service role is not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const userId = String(body?.userId || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const fullName = String(body?.fullName || '').trim()
    const plexUsername = String(body?.plexUsername || '').trim()
    const referralCodeInput = normalizeReferralCode(body?.referralCode)
    const createCustomer = Boolean(body?.createCustomer)

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required registration details' }, { status: 400 })
    }

    await supabase.from('profiles').upsert(
      {
        user_id: userId,
        email,
        role: 'customer',
        full_name: fullName || null,
      },
      { onConflict: 'email' }
    )

    const { data: existingCustomer, error: existingCustomerError } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (existingCustomerError) {
      return NextResponse.json({ error: existingCustomerError.message }, { status: 500 })
    }

    if (!existingCustomer && !createCustomer) {
      return NextResponse.json({ ok: true, referral_cap: REFERRAL_CREDIT_CAP_GBP })
    }

    const parsedNotes = parseCustomerNotes(existingCustomer?.notes)
    const referralCode =
      normalizeReferralCode(existingCustomer?.referral_code) ||
      (await ensureUniqueReferralCode(supabase, fullName || email))

    const customerPayload = {
      name: fullName || existingCustomer?.name || email,
      email,
      subscription_type: existingCustomer?.subscription_type || 'monthly',
      streams: Number(existingCustomer?.streams || 1) || 1,
      start_date: existingCustomer?.start_date || null,
      next_payment_date: existingCustomer?.next_payment_date || null,
      subscription_status: existingCustomer?.subscription_status || 'inactive',
      notes: buildCustomerNotes({
        plainNotes: parsedNotes.plainNotes,
        plexUsername: plexUsername || parsedNotes.plexUsername,
        timezone: parsedNotes.timezone,
        downloads: parsedNotes.downloads,
      }),
      referral_code: referralCode,
      referral_credit_balance: Number(existingCustomer?.referral_credit_balance || 0),
      referral_credit_earned_total: Number(existingCustomer?.referral_credit_earned_total || 0),
      referral_credit_redeemed_total: Number(existingCustomer?.referral_credit_redeemed_total || 0),
      successful_referrals_count: Number(existingCustomer?.successful_referrals_count || 0),
      referred_by_customer_id: existingCustomer?.referred_by_customer_id || null,
    }

    let customerId = existingCustomer?.id as string | undefined

    if (existingCustomer?.id) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(customerPayload)
        .eq('id', existingCustomer.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      const { data: insertedCustomer, error: insertError } = await supabase
        .from('customers')
        .insert(customerPayload)
        .select('id')
        .single()

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      customerId = insertedCustomer.id
    }

    if (!customerId || !referralCodeInput) {
      return NextResponse.json({ ok: true, referral_code: referralCode, referral_cap: REFERRAL_CREDIT_CAP_GBP })
    }

    const { data: freshCustomer, error: freshCustomerError } = await supabase
      .from('customers')
      .select('id,email,referred_by_customer_id')
      .eq('id', customerId)
      .single()

    if (freshCustomerError) {
      return NextResponse.json({ error: freshCustomerError.message }, { status: 500 })
    }

    if (freshCustomer.referred_by_customer_id) {
      return NextResponse.json({ ok: true, referral_code: referralCode, referral_cap: REFERRAL_CREDIT_CAP_GBP })
    }

    const { data: referrer, error: referrerError } = await supabase
      .from('customers')
      .select('id,email,referral_credit_balance,referral_credit_earned_total,successful_referrals_count,referral_code')
      .eq('referral_code', referralCodeInput)
      .maybeSingle()

    if (referrerError) {
      return NextResponse.json({ error: referrerError.message }, { status: 500 })
    }

    if (!referrer || referrer.id === freshCustomer.id || String(referrer.email || '').toLowerCase() === email) {
      return NextResponse.json({ ok: true, referral_code: referralCode, referral_cap: REFERRAL_CREDIT_CAP_GBP })
    }

    const rewardAmount = getReferralRewardAmount(referrer.referral_credit_earned_total)
    const nowIso = new Date().toISOString()

    await supabase.from('customers').update({ referred_by_customer_id: referrer.id }).eq('id', freshCustomer.id)

    if (rewardAmount <= 0) {
      await supabase.from('referral_events').insert({
        referrer_customer_id: referrer.id,
        referred_customer_id: freshCustomer.id,
        referral_code: referralCodeInput,
        reward_amount: 0,
        status: 'capped',
        created_at: nowIso,
      })

      return NextResponse.json({ ok: true, referral_code: referralCode, referral_cap: REFERRAL_CREDIT_CAP_GBP })
    }

    const nextBalance = Number(referrer.referral_credit_balance || 0) + rewardAmount
    const nextEarned = Number(referrer.referral_credit_earned_total || 0) + rewardAmount
    const nextCount = Number(referrer.successful_referrals_count || 0) + 1

    const { error: referrerUpdateError } = await supabase
      .from('customers')
      .update({
        referral_credit_balance: nextBalance,
        referral_credit_earned_total: nextEarned,
        successful_referrals_count: nextCount,
      })
      .eq('id', referrer.id)

    if (referrerUpdateError) {
      return NextResponse.json({ error: referrerUpdateError.message }, { status: 500 })
    }

    const { error: eventError } = await supabase.from('referral_events').insert({
      referrer_customer_id: referrer.id,
      referred_customer_id: freshCustomer.id,
      referral_code: referralCodeInput,
      reward_amount: rewardAmount,
      status: 'rewarded',
      created_at: nowIso,
    })

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      referral_code: referralCode,
      referral_reward_awarded: rewardAmount,
      referral_cap: REFERRAL_CREDIT_CAP_GBP,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Registration sync failed' }, { status: 500 })
  }
}
