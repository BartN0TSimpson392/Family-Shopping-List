import type { KrogerLocation, KrogerProduct } from './types'

const BASE = 'https://api.kroger.com/v1'

let cache: { token: string; exp: number } | null = null

async function getToken(): Promise<string> {
  if (cache && Date.now() < cache.exp) return cache.token
  const creds = Buffer.from(
    `${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch(`${BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Kroger auth failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  cache = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 }
  return cache.token
}

async function krogerFetch(path: string): Promise<Response> {
  const token = await getToken()
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
}

// Kroger's Locations API doesn't return a distance field, just an
// already-proximity-sorted list plus each store's raw geolocation — so real
// mile distances are computed here from the searched ZIP's centroid via a
// free, keyless geocoder (api.zippopotam.us). If that lookup fails for any
// reason, locations are still returned (just without distanceMiles) rather
// than failing the whole search over a "nice to have".
async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const place = data?.places?.[0]
    if (!place) return null
    const lat = parseFloat(place.latitude)
    const lng = parseFloat(place.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

export async function searchLocations(zip: string): Promise<KrogerLocation[]> {
  const [res, origin] = await Promise.all([
    krogerFetch(`/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=10&filter.chain=Kroger`),
    geocodeZip(zip),
  ])
  if (!res.ok) throw new Error(`Locations API ${res.status}`)
  const data = await res.json()
  const locations: KrogerLocation[] = data.data ?? []
  if (!origin) return locations

  const withDistance = locations.map(loc => {
    const geo = loc.geolocation
    if (!geo) return loc
    return { ...loc, distanceMiles: haversineMiles(origin, { lat: geo.latitude, lng: geo.longitude }) }
  })
  return withDistance.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
}

export async function searchProducts(
  term: string,
  locationId: string,
  start = 0
): Promise<{ products: KrogerProduct[]; total: number }> {
  const params = new URLSearchParams({
    'filter.term': term,
    'filter.locationId': locationId,
    'filter.limit': '20',
    'filter.start': String(start),
  })
  const res = await krogerFetch(`/products?${params}`)
  if (!res.ok) throw new Error(`Products API ${res.status}`)
  const data = await res.json()
  return { products: data.data ?? [], total: data.meta?.pagination?.total ?? 0 }
}
