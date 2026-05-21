'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KrogerLocation, KrogerProduct, CartItem, CartReplacement, HistoryItem, SharedList, SharedItem, Dispatch } from '@/lib/types'

const HISTORY_KEY = 'ic-purchase-history'
const FAVORITES_KEY = 'ic-favorites'

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}
function loadFavorites(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') } catch { return [] }
}
function saveFavorites(items: HistoryItem[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}
function historyItemToProduct(h: HistoryItem): KrogerProduct {
  return {
    productId: h.productId,
    description: h.description,
    brand: h.brand,
    categories: [],
    images: h.img ? [{ perspective: 'front', featured: true, sizes: [{ id: 'thumbnail', url: h.img }] }] : [],
    items: [{ itemId: h.productId, price: { regular: h.price, promo: 0 }, size: h.size, soldBy: 'Unit' }],
    aisleLocations: [],
    upc: '',
  }
}
function addToHistory(product: KrogerProduct, current: HistoryItem[]): HistoryItem[] {
  const entry: HistoryItem = {
    productId: product.productId,
    description: product.description,
    brand: product.brand || '',
    img: getProductImage(product, 'thumbnail') || getProductImage(product, 'small'),
    size: product.items?.[0]?.size ?? '',
    price: product.items?.[0]?.price?.regular ?? 0,
  }
  return [entry, ...current.filter(h => h.productId !== product.productId)].slice(0, 30)
}

function getProductImage(product: KrogerProduct, size: string): string {
  for (const img of product.images ?? []) {
    if (img.perspective === 'front') {
      const found = img.sizes?.find((s) => s.id === size)
      if (found) return found.url
      if (img.sizes?.length) return img.sizes[0].url
    }
  }
  for (const img of product.images ?? []) {
    const found = img.sizes?.find((s) => s.id === size)
    if (found) return found.url
    if (img.sizes?.length) return img.sizes[0].url
  }
  return ''
}

function getPrice(product: KrogerProduct): number {
  return product.items?.[0]?.price?.regular ?? 0
}
function getSize(product: KrogerProduct): string {
  return product.items?.[0]?.size ?? ''
}

// ── Brand tokens ──────────────────────────────────────────────────────────────
const IC = {
  cream: '#F2EDE0',
  green: '#1C3B2A',
  greenMid: '#2D5240',
  greenLight: '#3D6B50',
  gold: '#C4943A',
  goldLight: '#D4A84A',
  text: '#1C3B2A',
  textMuted: '#5A7A6A',
} as const

// ── Logo ──────────────────────────────────────────────────────────────────────

function RadarLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      {/* Crosshair arms */}
      <line x1="60" y1="1" x2="60" y2="19" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="60" y1="101" x2="60" y2="119" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="1" y1="60" x2="19" y2="60" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="101" y1="60" x2="119" y2="60" stroke={IC.green} strokeWidth="1.5"/>
      {/* Outer tick marks */}
      <line x1="57" y1="4" x2="63" y2="4" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="57" y1="116" x2="63" y2="116" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="4" y1="57" x2="4" y2="63" stroke={IC.green} strokeWidth="1.5"/>
      <line x1="116" y1="57" x2="116" y2="63" stroke={IC.green} strokeWidth="1.5"/>
      {/* Concentric circles — outermost to innermost, increasing opacity */}
      <circle cx="60" cy="60" r="55" stroke={IC.green} strokeWidth="0.75" strokeOpacity="0.2"/>
      <circle cx="60" cy="60" r="43" stroke={IC.green} strokeWidth="1" strokeOpacity="0.4"/>
      <circle cx="60" cy="60" r="31" stroke={IC.green} strokeWidth="1.5" strokeOpacity="0.6"/>
      <circle cx="60" cy="60" r="19" stroke={IC.green} strokeWidth="2" strokeOpacity="0.85"/>
      {/* Gold center */}
      <circle cx="60" cy="60" r="5.5" fill={IC.gold}/>
      <circle cx="60" cy="60" r="2" fill={IC.green}/>
    </svg>
  )
}

function RadarLogoWhite({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <line x1="60" y1="1" x2="60" y2="19" stroke="white" strokeWidth="1.5" strokeOpacity="0.8"/>
      <line x1="60" y1="101" x2="60" y2="119" stroke="white" strokeWidth="1.5" strokeOpacity="0.8"/>
      <line x1="1" y1="60" x2="19" y2="60" stroke="white" strokeWidth="1.5" strokeOpacity="0.8"/>
      <line x1="101" y1="60" x2="119" y2="60" stroke="white" strokeWidth="1.5" strokeOpacity="0.8"/>
      <circle cx="60" cy="60" r="55" stroke="white" strokeWidth="0.75" strokeOpacity="0.2"/>
      <circle cx="60" cy="60" r="43" stroke="white" strokeWidth="1" strokeOpacity="0.4"/>
      <circle cx="60" cy="60" r="31" stroke="white" strokeWidth="1.5" strokeOpacity="0.6"/>
      <circle cx="60" cy="60" r="19" stroke="white" strokeWidth="2" strokeOpacity="0.85"/>
      <circle cx="60" cy="60" r="5.5" fill={IC.gold}/>
      <circle cx="60" cy="60" r="2" fill="white"/>
    </svg>
  )
}

// ── StorePicker ───────────────────────────────────────────────────────────────

function StorePicker({
  locationResults,
  isLoading,
  error,
  onSearch,
  onSelect,
}: {
  locationResults: KrogerLocation[]
  isLoading: boolean
  error: string
  onSearch: (zip: string) => void
  onSelect: (loc: KrogerLocation) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const trySearch = () => {
    const zip = (inputRef.current?.value ?? '').replace(/\D/g, '').slice(0, 5)
    if (zip.length === 5) onSearch(zip)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ backgroundColor: IC.cream }}>
      {/* Logo mark */}
      <div className="mb-6">
        <RadarLogo className="w-28 h-28" />
      </div>

      {/* Brand name */}
      <div className="text-center mb-10">
        <h1
          className="text-4xl font-black tracking-[0.15em] uppercase"
          style={{ color: IC.green }}
        >
          Inner Circle
        </h1>
        <p
          className="text-xs font-bold tracking-[0.35em] uppercase mt-1"
          style={{ color: IC.textMuted }}
        >
          Private Dispatch
        </p>
      </div>

      {/* Zip input — white pill */}
      <div className="w-full max-w-sm space-y-3">
        <div className="bg-white rounded-2xl shadow-sm flex items-center px-5 py-4 gap-3 border border-stone-200">
          {/* Mic icon */}
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
          </svg>
          <div className="w-px h-5 bg-stone-200 flex-shrink-0" />
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            maxLength={5}
            onBlur={trySearch}
            placeholder="Enter your zip code"
            className="flex-1 text-base focus:outline-none placeholder:text-stone-400 bg-transparent"
            style={{ color: IC.green }}
          />
          {/* Search icon */}
          <button onClick={trySearch} className="flex-shrink-0 active:scale-90 transition-transform duration-100">
            <svg className="w-5 h-5" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={trySearch}
          className="w-full py-4 rounded-2xl font-bold tracking-widest uppercase text-sm transition-all duration-150 active:scale-[0.97] shadow-md text-white"
          style={{ backgroundColor: IC.green }}
        >
          {isLoading
            ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Find My Store'}
        </button>

        {error && (
          <p className="text-sm text-red-600 text-center font-medium">{error}</p>
        )}
      </div>

      {/* Store results */}
      {locationResults.length > 0 && (
        <div className="mt-5 w-full max-w-sm bg-white rounded-2xl shadow-md overflow-hidden border border-stone-200">
          <p className="px-5 pt-4 pb-2 text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: IC.textMuted }}>
            {locationResults.length} location{locationResults.length !== 1 ? 's' : ''} found
          </p>
          <ul className="pb-2">
            {locationResults.map((loc, idx) => (
              <li key={loc.locationId}>
                <button
                  onClick={() => onSelect(loc)}
                  className={`w-full text-left px-5 py-3.5 transition-all duration-100 active:scale-[0.99] ${idx < locationResults.length - 1 ? 'border-b border-stone-100' : ''}`}
                  style={{ color: IC.green }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F2EDE0')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <p className="font-bold text-sm">{loc.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: IC.textMuted }}>
                    {loc.address.addressLine1}, {loc.address.city}, {loc.address.state} {loc.address.zipCode}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({
  product,
  cartItem,
  isFavorite,
  onAdd,
  onUpdateQty,
  onToggleFavorite,
}: {
  product: KrogerProduct
  cartItem: CartItem | undefined
  isFavorite: boolean
  onAdd: (p: KrogerProduct) => void
  onUpdateQty: (id: string, qty: number) => void
  onToggleFavorite: (p: KrogerProduct) => void
}) {
  const imgUrl = getProductImage(product, 'thumbnail') || getProductImage(product, 'small')
  const price = getPrice(product)
  const size = getSize(product)
  const [justAdded, setJustAdded] = useState(false)

  const handleAdd = () => {
    onAdd(product)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 700)
  }

  return (
    <div
      className={`bg-white rounded-2xl flex flex-col overflow-hidden transition-all duration-200 ${
        cartItem
          ? 'shadow-md'
          : 'hover:shadow-xl hover:-translate-y-0.5'
      }`}
      style={{ border: cartItem ? `2px solid ${IC.gold}` : '1px solid #E5DDD0' }}
    >
      <div className="relative flex items-center justify-center h-36" style={{ backgroundColor: IC.cream }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(product) }}
          className="absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 z-10"
          style={{ backgroundColor: isFavorite ? `${IC.gold}25` : 'rgba(255,255,255,0.85)' }}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg className="w-4 h-4" fill={isFavorite ? IC.gold : 'none'} stroke={isFavorite ? IC.gold : IC.textMuted} strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        {cartItem && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm" style={{ backgroundColor: IC.gold }}>
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {imgUrl ? (
          <img src={imgUrl} alt={product.description} loading="lazy" className="h-28 w-28 object-contain mix-blend-multiply" />
        ) : (
          <div className="w-20 h-20 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E5DDD0' }}>
            <svg className="w-8 h-8" fill="none" stroke={IC.textMuted} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 px-3 pt-2 pb-3 gap-1">
        <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: IC.textMuted }}>{product.brand || ''}</p>
        <p className="text-sm font-semibold leading-tight line-clamp-2 flex-1" style={{ color: IC.green }}>{product.description}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            {size && <p className="text-xs" style={{ color: IC.textMuted }}>{size}</p>}
            {price > 0 && <p className="text-sm font-black" style={{ color: IC.gold }}>${price.toFixed(2)}</p>}
          </div>

          {cartItem ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity - 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-lg leading-none"
                style={{ backgroundColor: '#E5DDD0', color: IC.green }}
              >−</button>
              <span className="w-6 text-center text-sm font-black" style={{ color: IC.green }}>{cartItem.quantity}</span>
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= 20}
                className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-lg leading-none disabled:opacity-40"
                style={{ backgroundColor: IC.green }}
              >+</button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className="w-9 h-9 rounded-full text-white flex items-center justify-center transition-all duration-150 shadow-md active:scale-[0.82]"
              style={{ backgroundColor: justAdded ? IC.gold : IC.green, transform: justAdded ? 'scale(1.1)' : undefined }}
              aria-label="Add to dispatch"
            >
              {justAdded ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ReplacementPanel ──────────────────────────────────────────────────────────

function ReplacementPanel({
  forItem, store, history, onSelect, onClose,
}: {
  forItem: CartItem
  store: KrogerLocation
  history: HistoryItem[]
  onSelect: (r: CartReplacement) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KrogerProduct[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/kroger/products?term=${encodeURIComponent(term)}&locationId=${store.locationId}&start=0`)
      const data = await res.json()
      setResults(data.products ?? [])
    } catch { /* ignore */ } finally { setSearching(false) }
  }, [store.locationId])

  useEffect(() => {
    const t = setTimeout(() => search(query), 500)
    return () => clearTimeout(t)
  }, [query, search])

  const pick = (product: KrogerProduct) => {
    onSelect({
      productId: product.productId,
      description: product.description,
      brand: product.brand || '',
      img: getProductImage(product, 'small') || getProductImage(product, 'thumbnail'),
      size: product.items?.[0]?.size ?? '',
      price: product.items?.[0]?.price?.regular ?? 0,
      quantity: forItem.quantity,
      note: '',
    })
  }

  const filteredHistory = history.filter(h => h.productId !== forItem.product.productId)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <div>
            <h3 className="font-black uppercase tracking-wider text-sm" style={{ color: IC.green }}>Choose Substitute</h3>
            <p className="text-xs truncate max-w-[240px]" style={{ color: IC.textMuted }}>for {forItem.product.description}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100" style={{ backgroundColor: IC.cream }}>
            <svg className="w-5 h-5" fill="none" stroke={IC.green} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {filteredHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: IC.textMuted }}>Previously Purchased</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filteredHistory.map(h => (
                  <button
                    key={h.productId}
                    onClick={() => { /* pickFromHistory */ onSelect({ ...h, quantity: forItem.quantity, note: '' }) }}
                    className="flex-shrink-0 w-24 bg-white rounded-2xl p-2 text-left active:scale-95 transition-all duration-100"
                    style={{ border: `1px solid #E5DDD0` }}
                  >
                    {h.img && <img src={h.img} alt={h.description} className="w-12 h-12 object-contain mx-auto mb-1" />}
                    <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: IC.green }}>{h.description}</p>
                    {h.price > 0 && <p className="text-xs font-bold mt-0.5" style={{ color: IC.gold }}>${h.price.toFixed(2)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: IC.textMuted }}>Search Products</p>
            <div className="relative mb-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a substitute..."
                className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 pr-10 bg-white"
                style={{ border: `2px solid #E5DDD0`, color: IC.green }}
                onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
              />
              {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {results.map(p => (
                <button
                  key={p.productId}
                  onClick={() => pick(p)}
                  className="rounded-2xl p-2 text-left active:scale-95 transition-all duration-100"
                  style={{ backgroundColor: IC.cream, border: `1px solid #E5DDD0` }}
                >
                  {getProductImage(p, 'thumbnail') && (
                    <img src={getProductImage(p, 'thumbnail')} alt={p.description} className="w-14 h-14 object-contain mx-auto mb-1" />
                  )}
                  <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: IC.green }}>{p.description}</p>
                  <p className="text-xs" style={{ color: IC.textMuted }}>{p.items?.[0]?.size}</p>
                  {getPrice(p) > 0 && <p className="text-xs font-bold" style={{ color: IC.gold }}>${getPrice(p).toFixed(2)}</p>}
                </button>
              ))}
            </div>
            {results.length === 0 && !searching && query.trim() && (
              <p className="text-sm text-center py-6 font-medium" style={{ color: IC.textMuted }}>No results. Try a different term.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CartPanel ─────────────────────────────────────────────────────────────────

function CartPanel({
  dispatch, canDelete, onRename, onDeleteDispatch,
  onClose, onUpdateQty, onUpdateNote, onRemove, onGenerateLink,
  onAddReplacement, onRemoveReplacement, onSetNote,
}: {
  dispatch: Dispatch
  canDelete: boolean
  onRename: (name: string) => void
  onDeleteDispatch: () => void
  onClose: () => void
  onUpdateQty: (id: string, qty: number) => void
  onUpdateNote: (id: string, note: string) => void
  onRemove: (id: string) => void
  onGenerateLink: () => void
  onAddReplacement: (productId: string) => void
  onRemoveReplacement: (productId: string) => void
  onSetNote: (note: string) => void
}) {
  const cartTotal = dispatch.cart.reduce((sum, item) => sum + getPrice(item.product) * item.quantity, 0)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed z-50 bottom-0 left-0 right-0 md:right-0 md:top-0 md:left-auto md:bottom-0 md:w-96 bg-white shadow-2xl flex flex-col rounded-t-3xl md:rounded-none max-h-[90vh] md:max-h-none">
        <div className="md:hidden flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid #E5DDD0` }}>
          <div className="flex-1 min-w-0 mr-2">
            <input
              value={dispatch.name}
              onChange={(e) => onRename(e.target.value)}
              className="text-xl font-black uppercase tracking-wider bg-transparent focus:outline-none w-full border-b-2 transition-colors duration-150"
              style={{ color: IC.green, borderColor: 'transparent' }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
            />
            {dispatch.cart.length > 0 && (
              <p className="text-sm font-medium mt-0.5" style={{ color: IC.textMuted }}>{dispatch.cart.reduce((n, i) => n + i.quantity, 0)} items</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {canDelete && (
              <button
                onClick={onDeleteDispatch}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
                style={{ backgroundColor: '#FEE2E2' }}
                aria-label="Delete dispatch"
              >
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
              style={{ backgroundColor: IC.cream }}
            >
              <svg className="w-5 h-5" fill="none" stroke={IC.green} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {dispatch.cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <RadarLogo className="w-16 h-16 opacity-20 mb-4" />
              <p className="font-bold uppercase tracking-wider text-sm" style={{ color: IC.textMuted }}>Dispatch empty</p>
              <p className="text-sm mt-1" style={{ color: '#9DB8A8' }}>Search and add items above</p>
            </div>
          )}
          {dispatch.cart.map((item) => {
            const imgUrl = getProductImage(item.product, 'thumbnail')
            const price = getPrice(item.product)
            return (
              <div key={item.product.productId} className="rounded-2xl p-3" style={{ backgroundColor: IC.cream, border: '1px solid #E5DDD0' }}>
                <div className="flex gap-3">
                  {imgUrl && (
                    <img src={imgUrl} alt={item.product.description} loading="lazy" className="w-14 h-14 object-contain flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight truncate" style={{ color: IC.green }}>{item.product.description}</p>
                    {price > 0 && (
                      <p className="text-xs font-black mt-0.5" style={{ color: IC.gold }}>${(price * item.quantity).toFixed(2)}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={() => onUpdateQty(item.product.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none"
                        style={{ border: `1px solid #E5DDD0`, color: IC.green }}
                      >−</button>
                      <span className="w-6 text-center text-sm font-black" style={{ color: IC.green }}>{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(item.product.productId, item.quantity + 1)}
                        disabled={item.quantity >= 20}
                        className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none disabled:opacity-40"
                        style={{ backgroundColor: IC.green }}
                      >+</button>
                      <button
                        onClick={() => onRemove(item.product.productId)}
                        className="ml-auto w-7 h-7 rounded-full bg-white flex items-center justify-center active:scale-[0.85] transition-all duration-100"
                        style={{ border: '1px solid #E5DDD0' }}
                      >
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  value={item.note}
                  onChange={(e) => onUpdateNote(item.product.productId, e.target.value)}
                  placeholder="Add a note..."
                  className="mt-2 w-full text-[16px] bg-white rounded-xl px-3 py-1.5 focus:outline-none placeholder:text-stone-300 transition-shadow"
                  style={{ border: '1px solid #E5DDD0', color: IC.green }}
                />
                {item.replacement ? (
                  <div className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2 bg-white" style={{ border: `1px solid ${IC.gold}40` }}>
                    {item.replacement.img && (
                      <img src={item.replacement.img} alt={item.replacement.description} className="w-8 h-8 object-contain flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: IC.gold }}>If unavailable, use:</p>
                      <p className="text-xs font-medium truncate" style={{ color: IC.green }}>{item.replacement.description}</p>
                      {item.replacement.price > 0 && <p className="text-xs font-bold" style={{ color: IC.gold }}>${item.replacement.price.toFixed(2)}</p>}
                    </div>
                    <button
                      onClick={() => onRemoveReplacement(item.product.productId)}
                      className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 active:scale-90 transition-all duration-100 font-medium"
                    >Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => onAddReplacement(item.product.productId)}
                    className="mt-2 text-xs font-bold active:scale-95 transition-all duration-100"
                    style={{ color: IC.gold }}
                  >+ Add substitute</button>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 py-5 space-y-3 bg-white" style={{ borderTop: `1px solid #E5DDD0` }}>
          {cartTotal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: IC.textMuted }}>Estimated Total</span>
              <span className="text-xl font-black" style={{ color: IC.gold }}>${cartTotal.toFixed(2)}</span>
            </div>
          )}
          <textarea
            value={dispatch.note}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="Leave a note for your shopper..."
            rows={2}
            className="w-full text-[16px] bg-white rounded-2xl px-4 py-3 focus:outline-none transition-colors duration-150 resize-none placeholder:text-stone-300"
            style={{ border: `2px solid #E5DDD0`, color: IC.green }}
            onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
          />
          <button
            onClick={onGenerateLink}
            disabled={dispatch.cart.length === 0}
            className="w-full text-white font-black py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] text-sm tracking-widest uppercase disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {dispatch.cart.length === 0 ? 'Add items to dispatch' : 'Send Dispatch →'}
          </button>
        </div>
      </aside>
    </>
  )
}

// ── ShareModal ────────────────────────────────────────────────────────────────

function ShareModal({ url, copied, onCopy, onClose }: {
  url: string | null; copied: boolean; onCopy: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-7">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
          style={{ backgroundColor: IC.cream }}
        >
          <svg className="w-4 h-4" fill="none" stroke={IC.green} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <RadarLogo className="w-16 h-16 mx-auto mb-4" />
          <h3 className="text-xl font-black uppercase tracking-widest" style={{ color: IC.green }}>Dispatch Ready</h3>
          <p className="text-sm mt-1" style={{ color: IC.textMuted }}>Share this link with your shopper</p>
        </div>

        {!url ? (
          <div className="flex flex-col items-center py-4">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            <p className="text-sm font-medium" style={{ color: IC.textMuted }}>Generating link…</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: IC.cream, border: '1px solid #E5DDD0' }}>
              <input
                readOnly
                value={url}
                className="w-full text-sm bg-transparent focus:outline-none truncate font-mono"
                style={{ color: IC.textMuted }}
              />
            </div>

            <button
              onClick={onCopy}
              className="w-full py-4 rounded-2xl font-black text-base tracking-widest uppercase transition-all duration-200 active:scale-[0.97] text-white"
              style={{ backgroundColor: copied ? IC.gold : IC.green }}
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center gap-1 text-sm font-bold hover:underline active:scale-95 transition-all duration-100 uppercase tracking-wider"
              style={{ color: IC.gold }}
            >
              Preview Shopper View
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShoppingApp() {
  const [store, setStore] = useState<KrogerLocation | null>(null)
  const [locationResults, setLocationResults] = useState<KrogerLocation[]>([])
  const [showLocationSearch, setShowLocationSearch] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState<KrogerProduct[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchStart, setSearchStart] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [dispatches, setDispatches] = useState<Dispatch[]>([{ id: 'dispatch-1', name: 'Dispatch 1', cart: [], note: '' }])
  const [activeDispatchId, setActiveDispatchId] = useState<string>('dispatch-1')
  const [cartOpen, setCartOpen] = useState(false)
  const dispatchCounter = useRef(2)

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [replacingForId, setReplacingForId] = useState<string | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([])
  const [favorites, setFavorites] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'favorites' | 'recent'>('favorites')

  useEffect(() => { setPurchaseHistory(loadHistory()) }, [])
  useEffect(() => { setFavorites(loadFavorites()) }, [])
  useEffect(() => {
    const allItems = dispatches.flatMap(d => d.cart)
    if (allItems.length === 0) return
    let h = loadHistory()
    for (const item of allItems) h = addToHistory(item.product, h)
    saveHistory(h)
    setPurchaseHistory(h)
  }, [dispatches])

  const searchLocations = useCallback(async (zip: string) => {
    if (zip.length < 5) { setLocationError('Please enter a 5-digit zip code.'); return }
    setLocationLoading(true); setLocationError('')
    try {
      const res = await fetch(`/api/kroger/locations?zip=${zip}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch locations')
      setLocationResults(data)
      if (data.length === 0) setLocationError('No stores found near that zip code.')
    } catch (e: unknown) {
      setLocationError(e instanceof Error ? e.message : 'Could not load stores')
    } finally { setLocationLoading(false) }
  }, [])

  const selectStore = useCallback((loc: KrogerLocation) => {
    setStore(loc); setLocationResults([]); setShowLocationSearch(false)
    setProducts([]); setSearchQuery(''); setSearchStart(0); setSearchTotal(0)
  }, [])

  const runSearch = useCallback(async (term: string, start: number) => {
    if (!store || !term.trim()) return
    setIsSearching(true); setSearchError('')
    if (start === 0) setProducts([])
    try {
      const params = new URLSearchParams({ term: term.trim(), locationId: store.locationId, start: String(start) })
      const res = await fetch(`/api/kroger/products?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setProducts((prev) => (start === 0 ? data.products : [...prev, ...data.products]))
      setSearchTotal(data.total); setSearchStart(start)
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Search failed')
    } finally { setIsSearching(false) }
  }, [store])

  const handleSearch = useCallback(() => { runSearch(searchQuery, 0) }, [runSearch, searchQuery])

  useEffect(() => {
    if (!searchQuery.trim()) { setProducts([]); setSearchTotal(0); return }
    const t = setTimeout(() => runSearch(searchQuery, 0), 500)
    return () => clearTimeout(t)
  }, [searchQuery, runSearch])

  const handleLoadMore = useCallback(() => {
    runSearch(searchQuery, searchStart + 20)
  }, [runSearch, searchQuery, searchStart])

  const updateActiveDispatch = useCallback((updater: (d: Dispatch) => Dispatch) => {
    setDispatches(prev => prev.map(d => d.id === activeDispatchId ? updater(d) : d))
  }, [activeDispatchId])

  const addToCart = useCallback((product: KrogerProduct) => {
    updateActiveDispatch(d => {
      const existing = d.cart.find(i => i.product.productId === product.productId)
      return {
        ...d,
        cart: existing
          ? d.cart.map(i => i.product.productId === product.productId ? { ...i, quantity: Math.min(i.quantity + 1, 20) } : i)
          : [...d.cart, { product, quantity: 1, note: '' }],
      }
    })
  }, [updateActiveDispatch])

  const removeFromCart = useCallback((productId: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.filter(i => i.product.productId !== productId) }))
  }, [updateActiveDispatch])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) removeFromCart(productId)
    else updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.productId === productId ? { ...i, quantity: Math.min(qty, 20) } : i) }))
  }, [removeFromCart, updateActiveDispatch])

  const updateNote = useCallback((productId: string, note: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.productId === productId ? { ...i, note } : i) }))
  }, [updateActiveDispatch])

  const setReplacement = useCallback((productId: string, replacement: CartReplacement) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.productId === productId ? { ...i, replacement } : i) }))
    setReplacingForId(null)
  }, [updateActiveDispatch])

  const removeReplacement = useCallback((productId: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.productId === productId ? { ...i, replacement: undefined } : i) }))
  }, [updateActiveDispatch])

  const addDispatch = useCallback(() => {
    const num = dispatchCounter.current++
    const d: Dispatch = { id: `dispatch-${Date.now()}`, name: `Dispatch ${num}`, cart: [], note: '' }
    setDispatches(prev => [...prev, d])
    setActiveDispatchId(d.id)
  }, [])

  const renameDispatch = useCallback((id: string, name: string) => {
    setDispatches(prev => prev.map(d => d.id === id ? { ...d, name } : d))
  }, [])

  const deleteDispatch = useCallback((id: string) => {
    setDispatches(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(d => d.id !== id)
      if (id === activeDispatchId) setActiveDispatchId(next[0].id)
      return next
    })
  }, [activeDispatchId])

  const setOrderNote = useCallback((note: string) => {
    updateActiveDispatch(d => ({ ...d, note }))
  }, [updateActiveDispatch])

  const toggleFavorite = useCallback((product: KrogerProduct) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.productId === product.productId)
      const next = isFav
        ? prev.filter(f => f.productId !== product.productId)
        : [...prev, {
            productId: product.productId,
            description: product.description,
            brand: product.brand || '',
            img: getProductImage(product, 'thumbnail') || getProductImage(product, 'small'),
            size: product.items?.[0]?.size ?? '',
            price: product.items?.[0]?.price?.regular ?? 0,
          }]
      saveFavorites(next)
      return next
    })
  }, [])

  const activeDispatch = dispatches.find(d => d.id === activeDispatchId) ?? dispatches[0]
  const cartCount = activeDispatch.cart.reduce((n, i) => n + i.quantity, 0)

  const generateLink = useCallback(() => {
    if (!store || activeDispatch.cart.length === 0) return
    const items: SharedItem[] = activeDispatch.cart.map((ci) => ({
      id: ci.product.productId, qty: ci.quantity, note: ci.note,
      name: ci.product.description, brand: ci.product.brand || '',
      img: getProductImage(ci.product, 'small') || getProductImage(ci.product, 'thumbnail'),
      size: getSize(ci.product), price: getPrice(ci.product),
      aisle: ci.product.aisleLocations?.[0]?.description || 'Other',
      aisleNum: ci.product.aisleLocations?.[0]?.number || '0',
      seq: parseInt(ci.product.aisleLocations?.[0]?.sequenceNumber || '0', 10),
      ...(ci.replacement ? { sub: { id: ci.replacement.productId, name: ci.replacement.description, brand: ci.replacement.brand, img: ci.replacement.img, size: ci.replacement.size, price: ci.replacement.price, qty: ci.replacement.quantity, note: ci.replacement.note } } : {}),
    }))
    const list: SharedList = {
      store: store.name,
      addr: `${store.address.addressLine1}, ${store.address.city}, ${store.address.state}`,
      items, note: activeDispatch.note,
    }
    const listJson = JSON.stringify(list)

    // Open modal immediately in loading state
    setShareUrl(null)
    setShareModalOpen(true)
    setCopied(false)

    // Build fallback URL (encoded in query param) in case the POST fails
    const buildFallbackUrl = () => {
      const bytes = new TextEncoder().encode(listJson)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return `${window.location.origin}/shop?list=${btoa(binary)}`
    }

    fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: listJson,
    })
      .then(r => r.json())
      .then(data => {
        if (data.id) setShareUrl(`${window.location.origin}/shop?id=${data.id}`)
        else setShareUrl(buildFallbackUrl())
      })
      .catch(() => setShareUrl(buildFallbackUrl()))
  }, [store, activeDispatch])

  const copyUrl = useCallback(() => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }, [shareUrl])

  if (!store && !showLocationSearch) {
    return <StorePicker locationResults={locationResults} isLoading={locationLoading} error={locationError} onSearch={searchLocations} onSelect={selectStore} />
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: IC.cream }}>
      {/* Header */}
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RadarLogoWhite className="w-7 h-7" />
            <div>
              <span className="font-black text-white tracking-[0.12em] uppercase text-base leading-none block">Inner Circle</span>
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase leading-none block" style={{ color: IC.gold }}>Private Dispatch</span>
            </div>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all duration-100 active:scale-95"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            aria-label="Open dispatch"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="text-sm font-bold text-white">{activeDispatch.name}</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center shadow-md" style={{ backgroundColor: IC.gold }}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Store bar */}
      {store && (
        <div className="bg-white px-4 py-2.5 flex items-center justify-between shadow-sm" style={{ borderBottom: `1px solid #E5DDD0` }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${IC.gold}20` }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: IC.green }}>{store.name}</p>
              <p className="text-xs truncate" style={{ color: IC.textMuted }}>{store.address.addressLine1}, {store.address.city}, {store.address.state}</p>
            </div>
          </div>
          <button
            onClick={() => { setStore(null); setLocationResults([]); setProducts([]) }}
            className="ml-3 text-xs font-bold active:scale-95 transition-all duration-100 whitespace-nowrap"
            style={{ color: IC.gold }}
          >Change</button>
        </div>
      )}

      {/* Sticky area: dispatch switcher + search bar */}
      <div className="sticky top-14 z-20 bg-white shadow-sm" style={{ borderBottom: `1px solid #E5DDD0` }}>
        {/* Dispatch switcher */}
        {store && (
          <div className="px-4 pt-2 overflow-x-auto" style={{ borderBottom: `1px solid #E5DDD0` }}>
            <div className="flex gap-2 min-w-max pb-2">
              {dispatches.map(d => {
                const isActive = d.id === activeDispatchId
                const count = d.cart.reduce((n, i) => n + i.quantity, 0)
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveDispatchId(d.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-150 active:scale-95"
                    style={{
                      backgroundColor: isActive ? IC.green : IC.cream,
                      color: isActive ? 'white' : IC.green,
                      border: isActive ? 'none' : `1px solid #E5DDD0`,
                    }}
                  >
                    {d.name}
                    {count > 0 && (
                      <span
                        className="text-xs font-black rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isActive ? IC.gold : '#C8BFB0', color: 'white' }}
                      >
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </button>
                )
              })}
              <button
                onClick={addDispatch}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-150 active:scale-95"
                style={{ border: `1.5px dashed ${IC.gold}`, color: IC.gold }}
              >
                + New
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="max-w-3xl mx-auto">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-2xl pl-11 pr-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
              style={{ border: `2px solid #E5DDD0`, color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
            {isSearching && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            )}
          </div>
        </form>
        </div>
      </div>

      {/* Product grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {searchError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm font-medium">{searchError}</div>
        )}

        {/* Tabs shown when search is empty */}
        {!searchQuery.trim() && !isSearching && (
          <>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('favorites')}
                className="flex-1 py-3 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all duration-150"
                style={{
                  backgroundColor: activeTab === 'favorites' ? IC.green : 'transparent',
                  color: activeTab === 'favorites' ? 'white' : IC.textMuted,
                  border: activeTab === 'favorites' ? 'none' : `2px solid #E5DDD0`,
                }}
              >Favorites</button>
              <button
                onClick={() => setActiveTab('recent')}
                className="flex-1 py-3 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all duration-150"
                style={{
                  backgroundColor: activeTab === 'recent' ? IC.green : 'transparent',
                  color: activeTab === 'recent' ? 'white' : IC.textMuted,
                  border: activeTab === 'recent' ? 'none' : `2px solid #E5DDD0`,
                }}
              >Recent Purchases</button>
            </div>

            {activeTab === 'favorites' && (
              favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <RadarLogo className="w-20 h-20 opacity-30 mb-5" />
                  <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>No Favorites Yet</p>
                  <p className="text-sm mt-2" style={{ color: IC.textMuted }}>Tap ♡ on any product to save it here</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {favorites.map(fav => (
                    <ProductCard
                      key={fav.productId}
                      product={historyItemToProduct(fav)}
                      cartItem={activeDispatch.cart.find(i => i.product.productId === fav.productId)}
                      isFavorite={true}
                      onAdd={addToCart}
                      onUpdateQty={updateQty}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )
            )}

            {activeTab === 'recent' && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <RadarLogo className="w-20 h-20 opacity-30 mb-5" />
                <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>Coming Soon</p>
                <p className="text-sm mt-2" style={{ color: IC.textMuted }}>Your recent purchases will appear here</p>
              </div>
            )}
          </>
        )}

        {/* No results for a non-empty search */}
        {searchQuery.trim() && !isSearching && products.length === 0 && !searchError && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>No Results</p>
            <p className="text-sm mt-2" style={{ color: IC.textMuted }}>Try a different search term</p>
          </div>
        )}

        {isSearching && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            <p className="text-sm font-medium" style={{ color: IC.textMuted }}>Scanning…</p>
          </div>
        )}

        {products.length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-4" style={{ color: IC.textMuted }}>
              {products.length} of {searchTotal} results
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  cartItem={activeDispatch.cart.find((i) => i.product.productId === product.productId)}
                  isFavorite={favorites.some(f => f.productId === product.productId)}
                  onAdd={addToCart}
                  onUpdateQty={updateQty}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
            {products.length < searchTotal && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isSearching}
                  className="bg-white font-bold px-8 py-3 rounded-2xl transition-all duration-150 active:scale-[0.97] disabled:opacity-50 text-sm uppercase tracking-wider"
                  style={{ border: `2px solid #E5DDD0`, color: IC.green }}
                >
                  {isSearching ? 'Loading…' : `Load more (${searchTotal - products.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {cartOpen && (
        <CartPanel
          dispatch={activeDispatch}
          canDelete={dispatches.length > 1}
          onRename={(name) => renameDispatch(activeDispatchId, name)}
          onDeleteDispatch={() => { deleteDispatch(activeDispatchId); setCartOpen(false) }}
          onClose={() => setCartOpen(false)}
          onUpdateQty={updateQty}
          onUpdateNote={updateNote}
          onRemove={removeFromCart}
          onSetNote={setOrderNote}
          onGenerateLink={() => { setCartOpen(false); generateLink() }}
          onAddReplacement={(id) => setReplacingForId(id)}
          onRemoveReplacement={removeReplacement}
        />
      )}

      {replacingForId && store && (() => {
        const forItem = activeDispatch.cart.find(i => i.product.productId === replacingForId)
        if (!forItem) return null
        return (
          <ReplacementPanel
            forItem={forItem} store={store} history={purchaseHistory}
            onSelect={(r) => setReplacement(replacingForId, r)}
            onClose={() => setReplacingForId(null)}
          />
        )
      })()}

      {shareModalOpen && (
        <ShareModal url={shareUrl} copied={copied} onCopy={copyUrl} onClose={() => { setShareModalOpen(false); setShareUrl(null) }} />
      )}
    </div>
  )
}
