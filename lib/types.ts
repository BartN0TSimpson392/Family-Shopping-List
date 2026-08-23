export type StoreType = 'kroger' | 'costco'

export interface CostcoProduct {
  id: string
  title: string
  brand: string
  image: string
  price: number
  listPrice?: number
  size: string
  availability: string
  inStock: boolean
}

// Flat shape both KrogerProduct and CostcoProduct normalize into, so the
// cart/search/dispatch UI never has to branch on which store an item came from.
export interface Product {
  id: string
  store: StoreType
  name: string
  brand: string
  image: string
  price: number
  size: string
  aisle?: string
  aisleNum?: string
  seq?: number
  inStock?: boolean
}

export interface KrogerLocation {
  locationId: string
  name: string
  chain: string
  address: {
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    zipCode: string
  }
  phone?: string
}

export interface ProductImage {
  perspective: string
  featured: boolean
  sizes: { id: string; url: string }[]
}

export interface AisleLocation {
  bayNumber: string
  description: string
  number: string
  sequenceNumber: string
  side: string
  shelfNumber: string
}

export interface KrogerProduct {
  productId: string
  description: string
  brand: string
  categories: string[]
  images: ProductImage[]
  items: {
    itemId: string
    price?: { regular: number; promo: number }
    size: string
    soldBy: string
  }[]
  aisleLocations: AisleLocation[]
  upc: string
}

export interface CartReplacement {
  productId: string
  description: string
  brand: string
  img: string
  size: string
  price: number
  quantity: number
  note: string
}

export interface CartItem {
  product: Product
  quantity: number
  note: string
  replacement?: CartReplacement
  // Set when this line item was auto-added/updated by the Pantry's restock
  // trigger (item went to Running Low / Out of Stock while put away).
  restockStatus?: 'running_low' | 'out_of_stock'
}

export interface HistoryItem {
  productId: string
  description: string
  brand: string
  img: string
  size: string
  price: number
  store: StoreType
}

// Compact format stored in URL
export interface SharedItem {
  id: string
  qty: number
  note: string
  name: string
  brand: string
  img: string
  size: string
  price: number
  aisle: string
  aisleNum: string
  seq: number
  store?: StoreType
  sub?: {
    id: string
    name: string
    brand: string
    img: string
    size: string
    price: number
    qty: number
    note: string
  }
}

export interface SharedList {
  store: string
  storeType?: StoreType
  addr: string
  items: SharedItem[]
  note: string
}

export interface Dispatch {
  id: string
  name: string
  store: StoreType
  cart: CartItem[]
  note: string
  tip?: number
  firestoreId?: string
  shopperId?: string
  shopperName?: string
  sentAt?: number
  // Set locally once someone has run this dispatch through "Put Away Groceries".
  putAwayAt?: number
}

export interface Shopper {
  id: string
  name: string
  createdAt: number
}

export type MemberRole = 'order' | 'shopper' | 'admin'

export interface FamilyMember {
  id: string
  name: string
  roles: MemberRole[]
  createdAt: number
}

export interface Family {
  id: string
  name: string
  password: string
  createdAt: number
}

export interface LiveDispatch {
  id: string
  name: string
  storeType: StoreType
  store: string
  addr: string
  locationId: string
  items: SharedItem[]
  note: string
  shopperId: string
  shopperName: string
  createdAt: number
  status: 'pending' | 'shopping' | 'complete' | 'archived'
  checkedItems: string[]
  confirmedQtys: Record<string, number>
  familyId?: string
  tip?: number
}

// ── Family Pantry Inventory (Supabase) ──────────────────────────────────────

export type InventoryStatus = 'in_stock' | 'running_low' | 'out_of_stock'
export type InventoryStore = StoreType | 'other'

// Mirrors the `inventory_items` table — see supabase/migrations/0001_inventory_items.sql,
// 0002_inventory_items_barcode.sql, and 0003_inventory_items_size.sql
export interface InventoryItem {
  id: string
  name: string
  brand: string | null
  image_url: string | null
  store: InventoryStore
  status: InventoryStatus
  original_product_id: string | null
  barcode: string | null
  size: string | null
  unit_price: number | null
  last_restocked_at: string
  updated_at: string
}
