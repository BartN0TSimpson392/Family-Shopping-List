import { NextRequest } from 'next/server'
import { searchCostcoProducts } from '@/lib/costco'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const query = searchParams.get('query')
  const country = searchParams.get('country') ?? 'US'
  const start = parseInt(searchParams.get('start') ?? '0')
  if (!query) {
    return Response.json({ error: 'query required' }, { status: 400 })
  }
  try {
    const result = await searchCostcoProducts(query, country, start)
    return Response.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error(`/api/costco/search failed for query="${query}":`, msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
