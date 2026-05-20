import { NextRequest } from 'next/server'
import { searchLocations } from '@/lib/kroger'

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get('zip')
  if (!zip) return Response.json({ error: 'zip required' }, { status: 400 })
  try {
    const locations = await searchLocations(zip)
    return Response.json(locations)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
