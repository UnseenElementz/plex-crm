import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { recordManualPayPalPayment } from '@/lib/payments'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const result = await recordManualPayPalPayment({
      customerId: body?.customerId,
      amount: body?.amount,
      currency: body?.currency,
      paidAt: body?.paidAt,
      payerEmail: body?.payerEmail,
      payerName: body?.payerName,
      transactionId: body?.transactionId,
      note: body?.note,
    })

    return NextResponse.json({ ok: true, payment: result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to record direct PayPal payment' }, { status: 400 })
  }
}

export const runtime = 'nodejs'
