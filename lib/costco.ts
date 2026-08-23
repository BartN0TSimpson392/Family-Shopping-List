import type { CostcoProduct } from './types'

const BASE = 'https://real-time-costco-data.p.rapidapi.com'
const HOST = 'real-time-costco-data.p.rapidapi.com'

// The RapidAPI response embeds raw Costco catalog fields (item_* / camelCase
// mixed) that vary a bit between listings, so pull each value from whichever
// key is actually present instead of trusting one shape.
interface RawCostcoProduct {
  item_number?: string
  id?: string
  item_product_name?: string
  name?: string
  item_name?: string
  description?: string
  Brand_attr?: string[]
  item_collateral_primaryimage?: string
  item_product_primary_image?: string
  image?: string
  item_location_pricing_salePrice?: number
  minSalePrice?: number
  item_location_pricing_listPrice?: number
  maxSalePrice?: number
  Quantity_attr?: string[]
  Package_Net_Weight_attr?: string[]
  item_location_availability?: string
  deliveryStatus?: string
  isItemInStock?: boolean
}

function decodeHtmlEntities(url: string): string {
  return url.replace(/&amp;/g, '&')
}

function normalizeProduct(raw: RawCostcoProduct): CostcoProduct {
  const id = raw.item_number || (raw.id ? raw.id.split('!')[0] : '') || ''
  const title = raw.item_product_name || raw.name || raw.item_name || raw.description || 'Unknown item'
  const brand = raw.Brand_attr?.[0] || ''
  const rawImage = raw.item_collateral_primaryimage || raw.item_product_primary_image || raw.image || ''
  const image = rawImage ? decodeHtmlEntities(rawImage) : ''
  const price = raw.item_location_pricing_salePrice ?? raw.minSalePrice ?? raw.item_location_pricing_listPrice ?? 0
  const listPrice = raw.item_location_pricing_listPrice ?? raw.maxSalePrice
  const size = raw.Quantity_attr?.[0] || raw.Package_Net_Weight_attr?.[0] || ''
  const availability = raw.item_location_availability || raw.deliveryStatus || 'unknown'
  const inStock = raw.isItemInStock ?? availability.toLowerCase().includes('in stock')

  return {
    id,
    title,
    brand,
    image,
    price,
    ...(listPrice !== undefined && listPrice !== price ? { listPrice } : {}),
    size,
    availability,
    inStock,
  }
}

// This API's payload shape has been consistent (`data.data.products`), but
// pull it out defensively anyway rather than assuming — a shape drift here
// should surface as a clear "unexpected response" error, not silent [].
function extractRawProducts(data: unknown): RawCostcoProduct[] {
  if (Array.isArray(data)) return data as RawCostcoProduct[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const inner = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null
    if (inner && Array.isArray(inner.products)) return inner.products as RawCostcoProduct[]
    if (Array.isArray(obj.products)) return obj.products as RawCostcoProduct[]
    if (Array.isArray(obj.results)) return obj.results as RawCostcoProduct[]
    if (Array.isArray(obj.items)) return obj.items as RawCostcoProduct[]
  }
  return []
}

function extractTotal(data: unknown, fallback: number): number {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const inner = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null
    if (inner && typeof inner.total_products === 'number') return inner.total_products
    if (typeof obj.total === 'number') return obj.total
  }
  return fallback
}

export async function searchCostcoProducts(
  query: string,
  country = 'US',
  start = 0
): Promise<{ products: CostcoProduct[]; total: number }> {
  if (!process.env.RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY is not configured')
  }
  const params = new URLSearchParams({ query, country, start: String(start) })
  const res = await fetch(`${BASE}/search?${params}`, {
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': HOST,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Costco search API HTTP ${res.status} for query="${query}":`, text)
    throw new Error(`Costco search API error (${res.status}): ${text || res.statusText}`)
  }

  const data = await res.json()
  const rawProducts = extractRawProducts(data)
  const products = rawProducts.map(normalizeProduct)
  const total = extractTotal(data, products.length)
  return { products, total }
}
