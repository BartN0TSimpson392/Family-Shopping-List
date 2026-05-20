'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KrogerLocation, KrogerProduct, CartItem, CartReplacement, HistoryItem, SharedList, SharedItem } from '@/lib/types'

const HISTORY_KEY = 'fsl-purchase-history'

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch { return [] }
}

function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)) } catch { /* ignore */ }
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
  const filtered = current.filter(h => h.productId !== product.productId)
  return [entry, ...filtered].slice(0, 30)
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

function getAisle(product: KrogerProduct): string {
  return product.aisleLocations?.[0]?.description || 'Other'
}

function getPrice(product: KrogerProduct): number {
  return product.items?.[0]?.price?.regular ?? 0
}

function getSize(product: KrogerProduct): string {
  return product.items?.[0]?.size ?? ''
}

// ── FSL logo mark ────────────────────────────────────────────────────────────

function FslLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-24 h-24' : size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const icon = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <div className={`${dims} bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg`}>
      <svg className={`${icon} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    </div>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-10">
        {/* Brand */}
        <div className="mb-10 text-center">
          <FslLogo size="lg" />
          <h1 className="text-5xl font-black text-white tracking-tight mt-5">FSL</h1>
          <p className="text-indigo-200 text-lg font-semibold mt-1">Family Shopping List</p>
          <p className="text-indigo-300 text-sm mt-2">Your family, always stocked.</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7">
          <h2 className="text-xl font-black text-slate-900 mb-1">Find your store</h2>
          <p className="text-sm text-slate-400 mb-5">Enter your zip code to get started</p>

          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            maxLength={5}
            onBlur={trySearch}
            placeholder="45202"
            className="w-full border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-4 text-3xl tracking-[0.4em] text-center focus:outline-none transition-colors duration-150 font-black text-slate-900 placeholder:text-slate-200 placeholder:tracking-widest placeholder:font-light"
          />
          <button
            type="button"
            onClick={trySearch}
            className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.97] text-white font-bold py-4 rounded-2xl text-lg transition-all duration-150 shadow-lg shadow-indigo-300"
          >
            {isLoading
              ? <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Find My Store →'}
          </button>
          {error && <p className="mt-3 text-sm text-red-500 text-center font-medium">{error}</p>}
        </div>

        {locationResults.length > 0 && (
          <div className="mt-4 w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <p className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {locationResults.length} store{locationResults.length !== 1 ? 's' : ''} nearby
            </p>
            <ul className="pb-2">
              {locationResults.map((loc, idx) => (
                <li key={loc.locationId}>
                  <button
                    onClick={() => onSelect(loc)}
                    className={`w-full text-left px-5 py-4 hover:bg-indigo-50 active:bg-indigo-100 active:scale-[0.99] transition-all duration-100 ${idx < locationResults.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <p className="font-bold text-slate-900">{loc.name}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {loc.address.addressLine1}, {loc.address.city}, {loc.address.state} {loc.address.zipCode}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({
  product,
  cartItem,
  onAdd,
  onUpdateQty,
}: {
  product: KrogerProduct
  cartItem: CartItem | undefined
  onAdd: (p: KrogerProduct) => void
  onUpdateQty: (id: string, qty: number) => void
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
    <div className={`bg-white rounded-2xl flex flex-col overflow-hidden transition-all duration-200 ${
      cartItem
        ? 'border-2 border-indigo-300 shadow-md shadow-indigo-100'
        : 'border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50 hover:-translate-y-0.5'
    }`}>
      {/* image */}
      <div className="relative bg-slate-50 flex items-center justify-center h-36">
        {cartItem && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shadow">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {imgUrl ? (
          <img src={imgUrl} alt={product.description} loading="lazy" className="h-28 w-28 object-contain mix-blend-multiply" />
        ) : (
          <div className="w-20 h-20 bg-slate-200 rounded-xl flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-col flex-1 px-3 pt-2 pb-3 gap-1">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{product.brand || ''}</p>
        <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2 flex-1">{product.description}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            {size && <p className="text-xs text-slate-400">{size}</p>}
            {price > 0 && <p className="text-sm font-black text-emerald-600">${price.toFixed(2)}</p>}
          </div>

          {cartItem ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity - 1)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 active:scale-[0.85] transition-all duration-100 text-lg leading-none"
                aria-label="Decrease quantity"
              >−</button>
              <span className="w-6 text-center text-sm font-black text-slate-900">{cartItem.quantity}</span>
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= 20}
                className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center hover:bg-indigo-700 disabled:bg-indigo-300 active:scale-[0.85] transition-all duration-100 text-lg leading-none"
                aria-label="Increase quantity"
              >+</button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              className={`w-9 h-9 rounded-full text-white flex items-center justify-center transition-all duration-150 shadow-md active:scale-[0.82] ${
                justAdded
                  ? 'bg-emerald-500 scale-110 shadow-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
              aria-label="Add to list"
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
  forItem,
  store,
  history,
  onSelect,
  onClose,
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

  const pickFromHistory = (h: HistoryItem) => {
    onSelect({ ...h, quantity: forItem.quantity, note: '' })
  }

  const filteredHistory = history.filter(h => h.productId !== forItem.product.productId)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900">Choose Substitute</h3>
            <p className="text-xs text-slate-400 truncate max-w-[240px]">for {forItem.product.description}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center transition-all duration-100">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {filteredHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Previously Purchased</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filteredHistory.map(h => (
                  <button
                    key={h.productId}
                    onClick={() => pickFromHistory(h)}
                    className="flex-shrink-0 w-24 bg-slate-50 border border-slate-200 rounded-2xl p-2 text-left hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all duration-100"
                  >
                    {h.img && <img src={h.img} alt={h.description} className="w-12 h-12 object-contain mx-auto mb-1" />}
                    <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{h.description}</p>
                    {h.price > 0 && <p className="text-xs text-emerald-600 font-bold mt-0.5">${h.price.toFixed(2)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Search Products</p>
            <div className="relative mb-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a substitute..."
                className="w-full border-2 border-slate-200 focus:border-indigo-400 rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 pr-10"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {results.map(p => (
                <button
                  key={p.productId}
                  onClick={() => pick(p)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-2 text-left hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all duration-100"
                >
                  {getProductImage(p, 'thumbnail') && (
                    <img src={getProductImage(p, 'thumbnail')} alt={p.description} className="w-14 h-14 object-contain mx-auto mb-1" />
                  )}
                  <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{p.description}</p>
                  <p className="text-xs text-slate-400">{p.items?.[0]?.size}</p>
                  {getPrice(p) > 0 && <p className="text-xs text-emerald-600 font-bold">${getPrice(p).toFixed(2)}</p>}
                </button>
              ))}
            </div>
            {results.length === 0 && !searching && query.trim() && (
              <p className="text-sm text-slate-400 text-center py-6 font-medium">No results. Try a different search.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CartPanel ─────────────────────────────────────────────────────────────────

function CartPanel({
  cart,
  orderNote,
  setOrderNote,
  onClose,
  onUpdateQty,
  onUpdateNote,
  onRemove,
  onGenerateLink,
  onAddReplacement,
  onRemoveReplacement,
}: {
  cart: CartItem[]
  orderNote: string
  setOrderNote: (v: string) => void
  onClose: () => void
  onUpdateQty: (id: string, qty: number) => void
  onUpdateNote: (id: string, note: string) => void
  onRemove: (id: string) => void
  onGenerateLink: () => void
  onAddReplacement: (productId: string) => void
  onRemoveReplacement: (productId: string) => void
}) {
  const cartTotal = cart.reduce((sum, item) => sum + getPrice(item.product) * item.quantity, 0)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed z-50 bottom-0 left-0 right-0 md:right-0 md:top-0 md:left-auto md:bottom-0 md:w-96 bg-white shadow-2xl flex flex-col rounded-t-3xl md:rounded-none max-h-[90vh] md:max-h-none">
        <div className="md:hidden flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-black text-slate-900">Your List</h2>
            {cart.length > 0 && (
              <p className="text-sm text-slate-400 font-medium">{cart.reduce((n, i) => n + i.quantity, 0)} items</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center transition-all duration-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <p className="text-slate-500 font-bold">Your list is empty</p>
              <p className="text-slate-300 text-sm mt-1">Search and add items above</p>
            </div>
          )}
          {cart.map((item) => {
            const imgUrl = getProductImage(item.product, 'thumbnail')
            const price = getPrice(item.product)
            return (
              <div key={item.product.productId} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <div className="flex gap-3">
                  {imgUrl && (
                    <img src={imgUrl} alt={item.product.description} loading="lazy" className="w-14 h-14 object-contain flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 leading-tight truncate">{item.product.description}</p>
                    {price > 0 && (
                      <p className="text-xs text-emerald-600 font-bold mt-0.5">${(price * item.quantity).toFixed(2)}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={() => onUpdateQty(item.product.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-100 active:scale-[0.85] transition-all duration-100 text-base leading-none"
                        aria-label="Decrease"
                      >−</button>
                      <span className="w-6 text-center text-sm font-black text-slate-900">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(item.product.productId, item.quantity + 1)}
                        disabled={item.quantity >= 20}
                        className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center hover:bg-indigo-700 disabled:bg-indigo-300 active:scale-[0.85] transition-all duration-100 text-base leading-none"
                        aria-label="Increase"
                      >+</button>
                      <button
                        onClick={() => onRemove(item.product.productId)}
                        className="ml-auto w-7 h-7 rounded-full hover:bg-red-50 active:scale-[0.85] flex items-center justify-center transition-all duration-100"
                        aria-label="Remove"
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
                  className="mt-2 w-full text-[16px] border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white placeholder:text-slate-300 transition-shadow"
                />
                {item.replacement ? (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      {item.replacement.img && (
                        <img src={item.replacement.img} alt={item.replacement.description} className="w-8 h-8 object-contain flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-amber-700 font-bold">If unavailable, use:</p>
                        <p className="text-xs text-slate-800 font-medium truncate">{item.replacement.description}</p>
                        {item.replacement.price > 0 && <p className="text-xs text-emerald-600 font-bold">${item.replacement.price.toFixed(2)}</p>}
                      </div>
                      <button
                        onClick={() => onRemoveReplacement(item.product.productId)}
                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 active:scale-90 transition-all duration-100 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onAddReplacement(item.product.productId)}
                    className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-bold active:scale-95 transition-all duration-100"
                  >
                    + Add substitute
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-100 px-5 py-5 space-y-3 bg-white">
          {cartTotal > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500">Estimated total</span>
              <span className="text-xl font-black text-emerald-600">${cartTotal.toFixed(2)}</span>
            </div>
          )}
          <textarea
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="Leave a note for your shopper..."
            rows={2}
            className="w-full text-[16px] border-2 border-slate-200 focus:border-indigo-400 rounded-2xl px-4 py-3 focus:outline-none transition-colors duration-150 resize-none placeholder:text-slate-300"
          />
          <button
            onClick={onGenerateLink}
            disabled={cart.length === 0}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] shadow-lg shadow-indigo-200 disabled:shadow-none text-base"
          >
            {cart.length === 0 ? 'Add items to share' : '✨ Create Shopper Link'}
          </button>
        </div>
      </aside>
    </>
  )
}

// ── ShareModal ────────────────────────────────────────────────────────────────

function ShareModal({
  url,
  copied,
  onCopy,
  onClose,
}: {
  url: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-7">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 flex items-center justify-center transition-all duration-100"
          aria-label="Close"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="text-5xl mb-4 animate-bounce">🎉</div>
          <h3 className="text-2xl font-black text-slate-900">List is ready!</h3>
          <p className="text-slate-400 mt-1">Share this link with your shopper</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <input
            readOnly
            value={url}
            className="w-full text-sm bg-transparent text-slate-500 focus:outline-none truncate font-mono"
          />
        </div>

        <button
          onClick={onCopy}
          className={`w-full py-4 rounded-2xl font-black text-lg transition-all duration-200 active:scale-[0.97] shadow-lg ${
            copied
              ? 'bg-emerald-500 text-white shadow-emerald-200'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-200'
          }`}
        >
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-800 active:scale-95 transition-all duration-100"
        >
          Preview shopper view
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

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

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [orderNote, setOrderNote] = useState('')

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [replacingForId, setReplacingForId] = useState<string | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([])

  useEffect(() => { setPurchaseHistory(loadHistory()) }, [])

  useEffect(() => {
    if (cart.length === 0) return
    let h = loadHistory()
    for (const item of cart) h = addToHistory(item.product, h)
    saveHistory(h)
    setPurchaseHistory(h)
  }, [cart])

  // ── location search ────────────────────────────────────────────────────────

  const searchLocations = useCallback(async (zip: string) => {
    if (zip.length < 5) { setLocationError('Please enter a 5-digit zip code.'); return }
    setLocationLoading(true)
    setLocationError('')
    try {
      const res = await fetch(`/api/kroger/locations?zip=${zip}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch locations')
      setLocationResults(data)
      if (data.length === 0) setLocationError('No stores found near that zip code.')
    } catch (e: unknown) {
      setLocationError(e instanceof Error ? e.message : 'Could not load stores')
    } finally {
      setLocationLoading(false)
    }
  }, [])

  const selectStore = useCallback((loc: KrogerLocation) => {
    setStore(loc)
    setLocationResults([])
    setShowLocationSearch(false)
    setProducts([])
    setSearchQuery('')
    setSearchStart(0)
    setSearchTotal(0)
  }, [])

  // ── product search ─────────────────────────────────────────────────────────

  const runSearch = useCallback(async (term: string, start: number) => {
    if (!store || !term.trim()) return
    setIsSearching(true)
    setSearchError('')
    if (start === 0) setProducts([])
    try {
      const params = new URLSearchParams({ term: term.trim(), locationId: store.locationId, start: String(start) })
      const res = await fetch(`/api/kroger/products?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setProducts((prev) => (start === 0 ? data.products : [...prev, ...data.products]))
      setSearchTotal(data.total)
      setSearchStart(start)
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [store])

  const handleSearch = useCallback(() => {
    runSearch(searchQuery, 0)
  }, [runSearch, searchQuery])

  useEffect(() => {
    if (!searchQuery.trim()) { setProducts([]); setSearchTotal(0); return }
    const t = setTimeout(() => runSearch(searchQuery, 0), 500)
    return () => clearTimeout(t)
  }, [searchQuery, runSearch])

  const handleLoadMore = useCallback(() => {
    runSearch(searchQuery, searchStart + 20)
  }, [runSearch, searchQuery, searchStart])

  // ── cart ops ───────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: KrogerProduct) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.productId === product.productId)
      if (existing) {
        return prev.map((i) =>
          i.product.productId === product.productId
            ? { ...i, quantity: Math.min(i.quantity + 1, 20) }
            : i
        )
      }
      return [...prev, { product, quantity: 1, note: '' }]
    })
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.productId !== productId))
  }, [])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId)
    } else {
      setCart((prev) =>
        prev.map((i) =>
          i.product.productId === productId ? { ...i, quantity: Math.min(qty, 20) } : i
        )
      )
    }
  }, [removeFromCart])

  const updateNote = useCallback((productId: string, note: string) => {
    setCart((prev) =>
      prev.map((i) => i.product.productId === productId ? { ...i, note } : i)
    )
  }, [])

  const setReplacement = useCallback((productId: string, replacement: CartReplacement) => {
    setCart(prev => prev.map(i => i.product.productId === productId ? { ...i, replacement } : i))
    setReplacingForId(null)
  }, [])

  const removeReplacement = useCallback((productId: string) => {
    setCart(prev => prev.map(i => i.product.productId === productId ? { ...i, replacement: undefined } : i))
  }, [])

  const cartCount = cart.reduce((n, i) => n + i.quantity, 0)

  // ── share link ─────────────────────────────────────────────────────────────

  const generateLink = useCallback(() => {
    if (!store || cart.length === 0) return
    const items: SharedItem[] = cart.map((ci) => ({
      id: ci.product.productId,
      qty: ci.quantity,
      note: ci.note,
      name: ci.product.description,
      brand: ci.product.brand || '',
      img: getProductImage(ci.product, 'small') || getProductImage(ci.product, 'thumbnail'),
      size: getSize(ci.product),
      price: getPrice(ci.product),
      aisle: ci.product.aisleLocations?.[0]?.description || 'Other',
      aisleNum: ci.product.aisleLocations?.[0]?.number || '0',
      seq: parseInt(ci.product.aisleLocations?.[0]?.sequenceNumber || '0', 10),
      ...(ci.replacement ? { sub: {
        id: ci.replacement.productId,
        name: ci.replacement.description,
        brand: ci.replacement.brand,
        img: ci.replacement.img,
        size: ci.replacement.size,
        price: ci.replacement.price,
        qty: ci.replacement.quantity,
        note: ci.replacement.note,
      }} : {}),
    }))
    const list: SharedList = {
      store: store.name,
      addr: `${store.address.addressLine1}, ${store.address.city}, ${store.address.state}`,
      items,
      note: orderNote,
    }
    const encoded = btoa(encodeURIComponent(JSON.stringify(list)))
    const longUrl = `${window.location.origin}/shop?list=${encoded}`
    setShareUrl(longUrl)
    setCopied(false)
    fetch(`/api/shorten?url=${encodeURIComponent(longUrl)}`)
      .then(r => r.json())
      .then(data => { if (data.url) setShareUrl(data.url) })
      .catch(() => {})
  }, [store, cart, orderNote])

  const copyUrl = useCallback(() => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareUrl])

  // ── render: no store selected ──────────────────────────────────────────────

  if (!store && !showLocationSearch) {
    return (
      <StorePicker
        locationResults={locationResults}
        isLoading={locationLoading}
        error={locationError}
        onSearch={searchLocations}
        onSelect={selectStore}
      />
    )
  }

  // ── render: main app ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-violet-600 sticky top-0 z-30 shadow-lg shadow-indigo-900/20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <span className="font-black text-xl text-white tracking-tight">FSL</span>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:scale-95 active:bg-white/40 rounded-full px-3 py-1.5 transition-all duration-100"
            aria-label="Open list"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="text-sm font-bold text-white">List</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-400 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Store bar */}
      {store && (
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 bg-indigo-100 rounded-lg flex-shrink-0 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{store.name}</p>
              <p className="text-xs text-slate-400 truncate">{store.address.addressLine1}, {store.address.city}, {store.address.state}</p>
            </div>
          </div>
          <button
            onClick={() => { setStore(null); setLocationResults([]); setProducts([]) }}
            className="ml-3 text-xs text-indigo-600 font-bold hover:text-indigo-800 active:scale-95 transition-all duration-100 whitespace-nowrap"
          >
            Change
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="sticky top-14 z-20 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="max-w-3xl mx-auto flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full border-2 border-slate-200 focus:border-indigo-400 rounded-2xl pl-10 pr-4 py-2.5 text-base focus:outline-none transition-colors duration-150"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </form>
      </div>

      {/* Product grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {searchError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm font-medium">
            {searchError}
          </div>
        )}

        {products.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center mb-5">
              <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-xl font-black text-slate-900">Find something good</p>
            <p className="text-slate-400 text-sm mt-2">Search for products at {store?.name}</p>
          </div>
        )}

        {isSearching && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Searching…</p>
          </div>
        )}

        {products.length > 0 && (
          <>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              {products.length} of {searchTotal} results
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  cartItem={cart.find((i) => i.product.productId === product.productId)}
                  onAdd={addToCart}
                  onUpdateQty={updateQty}
                />
              ))}
            </div>

            {products.length < searchTotal && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isSearching}
                  className="bg-white border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 font-bold px-8 py-3 rounded-2xl transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
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
          cart={cart}
          orderNote={orderNote}
          setOrderNote={setOrderNote}
          onClose={() => setCartOpen(false)}
          onUpdateQty={updateQty}
          onUpdateNote={updateNote}
          onRemove={removeFromCart}
          onGenerateLink={() => { generateLink(); setCartOpen(false) }}
          onAddReplacement={(id) => setReplacingForId(id)}
          onRemoveReplacement={removeReplacement}
        />
      )}

      {replacingForId && store && (() => {
        const forItem = cart.find(i => i.product.productId === replacingForId)
        if (!forItem) return null
        return (
          <ReplacementPanel
            forItem={forItem}
            store={store}
            history={purchaseHistory}
            onSelect={(r) => setReplacement(replacingForId, r)}
            onClose={() => setReplacingForId(null)}
          />
        )
      })()}

      {shareUrl && (
        <ShareModal
          url={shareUrl}
          copied={copied}
          onCopy={copyUrl}
          onClose={() => setShareUrl(null)}
        />
      )}
    </div>
  )
}
