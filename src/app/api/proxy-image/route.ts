import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isAllowed(url: URL){
  return ['https:', 'http:'].includes(url.protocol)
}

export async function GET(request: Request){
  try{
    const u = new URL(request.url)
    const src = u.searchParams.get('src') || ''
    if (!src) return NextResponse.json({ error: 'src required' }, { status: 400 })
    const target = new URL(src)
    if (!isAllowed(target)) return NextResponse.json({ error: 'invalid url' }, { status: 400 })
    let res = await fetch(target.toString(), { redirect: 'follow' })
    if (!res.ok) return NextResponse.json({ error: `fetch ${res.status}` }, { status: 502 })
    let ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html')){
      try{
        const html = await res.text()
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
        const direct = og || (html.match(/https:\/\/i\.postimg\.cc\/[A-Za-z0-9\/_.-]+\.(?:png|jpg|jpeg|webp)/i)?.[0]) || ''
        if (direct){
          res = await fetch(direct, { redirect: 'follow' })
          ct = res.headers.get('content-type') || 'image/jpeg'
        }
      } catch {}
    }
    const out = new NextResponse(res.body, { status: 200 })
    out.headers.set('Content-Type', ct || 'image/jpeg')
    out.headers.set('Cache-Control', 'public, max-age=3600')
    return out
  } catch (e: any){
    return NextResponse.json({ error: e?.message || 'proxy failed' }, { status: 500 })
  }
}
