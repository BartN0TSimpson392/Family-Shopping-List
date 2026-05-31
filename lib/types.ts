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
  product: KrogerProduct
  quantity: number
  note: string
  replacement?: CartReplacement
}

export interface HistoryItem {
  productId: string
  description: string
  brand: string
  img: string
  size: string
  price: number
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
  addr: string
  items: SharedItem[]
  note: string
}

export interface Dispatch {
  id: string
  name: string
  cart: CartItem[]
  note: string
  firestoreId?: string
  shopperId?: string
  shopperName?: string
  sentAt?: number
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
  store: string
  addr: string
  locationId: string
  items: SharedItem[]
  note: string
  shopperId: string
  shopperName: string
  createdAt: number
  status: 'pending' | 'shopping' | 'complete'
  checkedItems: string[]
  confirmedQtys: Record<string, number>
  familyId?: string
}
