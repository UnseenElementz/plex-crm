import { NextResponse } from 'next/server'

function extractMeta(html: string){
  const get = (property: string) => {
    const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
    const m = re.exec(html)
    if (m) return m[1]
    const reReverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
    const m2 = reReverse.exec(html)
    return m2?.[1] || ''
  }
  const getName = (name: string) => {
    const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
    const m = re.exec(html)
    if (m) return m[1]
    const reReverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i')
    const m2 = reReverse.exec(html)
    return m2?.[1] || ''
  }
  const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] || ''
  const title = get('og:title') || getName('twitter:title') || titleTag.replace(' - IMDb', '').trim()
  const description = get('og:description') || getName('description') || getName('twitter:description') || ''
  
  // IMDb often uses JSON-LD which is more reliable for posters
  let image = get('og:image') || getName('twitter:image') || ''
  if (!image) {
    const jsonLdMatch = /<script type="application\/ld\+json">([\s\S]+?)<\/script>/i.exec(html)
    if (jsonLdMatch) {
      try {
        const json = JSON.parse(jsonLdMatch[1])
        image = json.image || ''
      } catch {}
    }
  }
  
  return { title, description, image }
}

export async function POST(req: Request){
  try{
    const { url } = await req.json().catch(()=>({}))
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url required' }, { status: 400 })
    
    // Improved fetch with more realistic browser headers
    const r = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      } 
    })
    
    if (!r.ok) {
      console.error(`Preview fetch failed: ${r.status} ${r.statusText} for ${url}`)
      return NextResponse.json({ error: `Could not reach IMDb (Error ${r.status}). Please try again or submit without preview.` }, { status: 400 })
    }

    const html = await r.text()
    if (!html) return NextResponse.json({ error: 'failed to fetch' }, { status: 400 })
    
    const meta = extractMeta(html)
    return NextResponse.json({ ok: true, meta })
  }catch(e:any){
    console.error('Preview error:', e)
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
