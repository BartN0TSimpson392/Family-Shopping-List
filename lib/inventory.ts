import { supabase } from './supabase'
import type { InventoryItem, InventoryStatus, InventoryStore, StoreType } from './types'

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see supabase/README.md)')
  }
  return supabase
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('inventory_items')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as InventoryItem[]
}

export async function updateInventoryStatus(id: string, status: InventoryStatus): Promise<InventoryItem> {
  const client = requireClient()
  const { data, error } = await client
    .from('inventory_items')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as InventoryItem
}

export interface PutAwayInput {
  name: string
  brand: string | null
  image_url: string | null
  store: StoreType
  original_product_id: string
  size: string | null
  unit_price: number | null
}

// Upserts by (store, original_product_id) — a re-put-away of an item already
// tracked in the pantry just refreshes last_restocked_at and flips it back
// to in_stock instead of creating a duplicate row.
export async function putAwayItem(input: PutAwayInput): Promise<InventoryItem> {
  const client = requireClient()
  const { data, error } = await client
    .from('inventory_items')
    .upsert(
      {
        ...input,
        status: 'in_stock' satisfies InventoryStatus,
        last_restocked_at: new Date().toISOString(),
      },
      { onConflict: 'store,original_product_id' }
    )
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as InventoryItem
}

export interface CreateInventoryInput {
  name: string
  brand: string | null
  image_url: string | null
  store: InventoryStore
  barcode: string | null
  size: string | null
  unit_price: number | null
  // Set when a barcode scan resolved to an official store catalog item
  // (currently: Kroger, via lib/kroger.ts product search) — lets later
  // dispatch/restock flows reference the store's real SKU instead of this
  // pantry row's own id.
  original_product_id: string | null
}

// Plain insert for manually-added pantry items (the "Add Pantry Item" flow,
// optionally barcode-assisted) — distinct from putAwayItem's upsert, since
// these aren't tied to a dispatch's original_product_id.
export async function createInventoryItem(input: CreateInventoryInput): Promise<InventoryItem> {
  const client = requireClient()
  const { data, error } = await client
    .from('inventory_items')
    .insert({
      ...input,
      status: 'in_stock' satisfies InventoryStatus,
      last_restocked_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as InventoryItem
}

export interface OpenFoodFactsLookup {
  found: boolean
  name?: string
  brand?: string
  imageUrl?: string
}

// Free, keyless, CORS-enabled — safe to call directly from the browser.
export async function lookupBarcode(barcode: string): Promise<OpenFoodFactsLookup> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`)
  if (!res.ok) {
    throw new Error(`Open Food Facts lookup failed (${res.status})`)
  }
  const data = await res.json()
  if (data?.status !== 1 || !data?.product) {
    return { found: false }
  }
  const p = data.product
  const name: string | undefined = p.product_name || p.product_name_en || p.generic_name || undefined
  const brand: string | undefined = typeof p.brands === 'string' ? p.brands.split(',')[0]?.trim() || undefined : undefined
  const imageUrl: string | undefined = p.image_front_url || p.image_url || p.image_small_url || undefined
  return { found: true, name, brand, imageUrl }
}

// Live-syncs the pantry across every family member's device: does an initial
// fetch, then refetches on any insert/update/delete via Supabase Realtime.
// Returns an unsubscribe function.
export function subscribeInventory(
  onChange: (items: InventoryItem[]) => void,
  onError: (message: string) => void
): () => void {
  if (!supabase) {
    onError('Supabase is not configured — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see supabase/README.md)')
    return () => {}
  }
  const client = supabase
  let cancelled = false

  const refresh = async () => {
    try {
      const items = await listInventoryItems()
      if (!cancelled) onChange(items)
    } catch (e) {
      if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load pantry items')
    }
  }

  refresh()
  const channel = client
    .channel('inventory_items_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, refresh)
    .subscribe()

  return () => {
    cancelled = true
    client.removeChannel(channel)
  }
}
