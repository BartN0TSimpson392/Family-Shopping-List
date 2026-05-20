import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return Response.json({ error: 'url required' }, { status: 400 })
  try {
    const res = await fetch(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
      { cache: 'no-store' }
    )
    const short = await res.text()
    if (!short.startsWith('https://is.gd/')) throw new Error('Bad response')
    return Response.json({ url: short })
  } catch {
    return Response.json({ url }, { status: 200 }) // fall back to original URL
  }
}
