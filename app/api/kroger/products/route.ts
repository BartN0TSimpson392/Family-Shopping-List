import { NextRequest } from 'next/server'
import { searchProducts } from '@/lib/kroger'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const term = searchParams.get('term')
  const locationId = searchParams.get('locationId')
  const start = parseInt(searchParams.get('start') ?? '0')
  if (!term || !locationId) {
    return Response.json({ error: 'term and locationId required' }, { status: 400 })
  }
  try {
    const result = await searchProducts(term, locationId, start)
    return Response.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
