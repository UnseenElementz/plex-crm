import { NextResponse } from 'next/server'

export async function GET(req: Request){
  try{
    const url = new URL(req.url)
    let src = url.searchParams.get('src') || ''
    if (!src) return NextResponse.json({ error: 'src required' }, { status: 400 })
    try{
      const u = new URL(src)
      if (u.hostname.includes('drive.google.com')){
        // Convert common Google Drive share formats to direct download
        const path = u.pathname
        let id = ''
        const fileMatch = path.match(/\/file\/d\/([^/]+)/)
        if (fileMatch && fileMatch[1]) id = fileMatch[1]
        const idParam = u.searchParams.get('id')
        if (!id && idParam) id = idParam
        if (id) src = `https://drive.google.com/uc?export=download&id=${id}`
      }
    }catch{}
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return NextResponse.json({ error: 'failed to fetch' }, { status: r.status })
    const contentType = r.headers.get('content-type') || 'audio/mpeg'
    const buf = await r.arrayBuffer()
    return new NextResponse(Buffer.from(buf), { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } })
  }catch(e:any){ return NextResponse.json({ error: e?.message || 'proxy failed' }, { status: 500 }) }
}
