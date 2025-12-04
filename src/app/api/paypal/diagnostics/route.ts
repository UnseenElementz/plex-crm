import { NextResponse } from 'next/server'
const sanitize = (v?: string) => (v || '').trim().replace(/^['"]|['"]$/g, '')

export const runtime = 'nodejs'

export async function GET(){
  try{
    const clientId = sanitize(process.env.PAYPAL_CLIENT_ID as string)
    const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET as string)
    const env = (process.env.PAYPAL_ENV || 'sandbox')
    const result: any = { env, hasId: !!clientId, hasSecret: !!clientSecret }
    async function tryEnv(base: string){
      try{
        const tokenRes = await fetch(base + '/v1/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials'
        })
        const raw = await tokenRes.text()
        let json: any = null
        try{ json = JSON.parse(raw) }catch{}
        return { ok: tokenRes.ok, status: tokenRes.status, body: raw.slice(0,200), token: json?.access_token ? true : false }
      } catch(e: any){
        return { ok: false, error: e?.message || String(e) }
      }
    }
    const live = await tryEnv('https://api-m.paypal.com')
    const sandbox = await tryEnv('https://api-m.sandbox.paypal.com')
    result.live = live
    result.sandbox = sandbox
    return NextResponse.json(result)
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'Diagnostics error' }, { status: 500 })
  }
}
