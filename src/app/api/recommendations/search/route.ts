import { NextResponse } from 'next/server'

type ImdbSuggestion = {
  id?: string
  l?: string
  q?: string
  qid?: string
  s?: string
  y?: number
  yr?: string
  i?: {
    imageUrl?: string
  }
}

function getSuggestionPrefix(query: string) {
  const first = query.trim().charAt(0).toLowerCase()
  return /^[a-z0-9]$/.test(first) ? first : 'x'
}

function formatTypeLabel(raw: string) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'feature') return 'Movie'
  if (value === 'tv series') return 'TV Series'
  if (value === 'tv mini series') return 'TV Mini Series'
  if (value === 'tv movie') return 'TV Movie'
  if (!value) return ''
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildDescription(item: ImdbSuggestion) {
  return [formatTypeLabel(item.q || ''), item.yr || item.y, item.s].filter(Boolean).join(' • ')
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = String(searchParams.get('q') || '').trim()

    if (q.length < 2) {
      return NextResponse.json({ items: [] })
    }

    const prefix = getSuggestionPrefix(q)
    const endpoint = `https://v3.sg.media-imdb.com/suggestion/${prefix}/${encodeURIComponent(q)}.json`
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 502 })
    }

    const payload = await response.json().catch(() => ({}))
    const rawItems = Array.isArray(payload?.d) ? (payload.d as ImdbSuggestion[]) : []
    const items = rawItems
      .filter((item) => String(item.id || '').startsWith('tt') && String(item.l || '').trim())
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id || '').trim(),
        title: String(item.l || '').trim(),
        type: formatTypeLabel(item.q || ''),
        year: String(item.yr || item.y || '').trim(),
        subtitle: String(item.s || '').trim(),
        image: item.i?.imageUrl || '',
        url: `https://www.imdb.com/title/${String(item.id || '').trim()}/`,
        description: buildDescription(item),
      }))

    return NextResponse.json({ items })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Search failed.' }, { status: 500 })
  }
}
