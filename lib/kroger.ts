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

export async function searchLocations(zip: string): Promise<KrogerLocation[]> {
  const res = await krogerFetch(
    `/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=10&filter.chain=Kroger`
  )
  if (!res.ok) throw new Error(`Locations API ${res.status}`)
  const data = await res.json()
  return data.data ?? []
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
