import { NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'

function client() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured')
  }
  
  const env = process.env.PAYPAL_ENV === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret)
  return new paypal.core.PayPalHttpClient(env)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { amount, currency = 'GBP' } = body || {}
    
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })
    }

    const c = client()
    const order = new paypal.orders.OrdersCreateRequest()
    order.prefer('return=representation')
    
    const purchaseUnit: any = { 
      amount: { 
        currency_code: currency, 
        value: String(Number(amount).toFixed(2)) 
      } 
    }
    
    const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL
    if (merchantEmail) {
      purchaseUnit.payee = { email_address: merchantEmail }
    }
    
    order.requestBody({
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit]
    })

    const res = await c.execute(order)
    
    if (!res.result || !res.result.id) {
      throw new Error('Invalid PayPal response')
    }
    
    return NextResponse.json({ 
      id: res.result.id,
      status: res.result.status 
    })
    
  } catch (error: any) {
    console.error('PayPal create order error:', error)
    
    if (error.message === 'PayPal credentials not configured') {
      return NextResponse.json({ 
        error: 'PayPal payment service is not configured. Please contact support.' 
      }, { status: 503 })
    }
    if ((error.statusCode === 401) || String(error?.message || '').includes('invalid_client')) {
      return NextResponse.json({
        error: 'Invalid PayPal credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.'
      }, { status: 503 })
    }
    
    return NextResponse.json({ 
      error: error.message || 'Failed to create PayPal order' 
    }, { status: 500 })
  }
}
