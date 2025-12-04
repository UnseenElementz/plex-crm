import { NextResponse } from 'next/server'

function extractMeta(html: string){
  const get = (property: string) => {
    const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
    const m = re.exec(html)
    return m?.[1] || ''
  }
  const getName = (name: string) => {
    const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
    const m = re.exec(html)
    return m?.[1] || ''
  }
  const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] || ''
  const title = get('og:title') || getName('twitter:title') || titleTag
  const description = get('og:description') || getName('description') || getName('twitter:description') || ''
  const image = get('og:image') || getName('twitter:image') || ''
  return { title, description, image }
}

export async function POST(req: Request){
  try{
    const { url } = await req.json().catch(()=>({}))
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url required' }, { status: 400 })
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await r.text()
    if (!r.ok || !html) return NextResponse.json({ error: 'failed to fetch' }, { status: 400 })
    const meta = extractMeta(html)
    return NextResponse.json({ ok: true, meta })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
