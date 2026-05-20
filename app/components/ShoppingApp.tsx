'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KrogerLocation, KrogerProduct, CartItem, CartReplacement, HistoryItem, SharedList, SharedItem } from '@/lib/types'

const HISTORY_KEY = 'kroger-purchase-history'

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

// ── helpers ──────────────────────────────────────────────────────────────────

function getProductImage(product: KrogerProduct, size: string): string {
  for (const img of product.images ?? []) {
    if (img.perspective === 'front') {
      const found = img.sizes?.find((s) => s.id === size)
      if (found) return found.url
      // fall back to any size
      if (img.sizes?.length) return img.sizes[0].url
    }
  }
  // try any perspective
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

// ── sub-components ───────────────────────────────────────────────────────────

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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 bg-gray-50 min-h-screen">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Kroger Shopping List</h1>
          <p className="text-gray-500">Enter your zip code to find a nearby Kroger store</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Zip Code</label>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            maxLength={5}
            onBlur={trySearch}
            placeholder="e.g. 45202"
            className="w-full border border-gray-300 rounded-xl px-4 py-4 text-xl tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={trySearch}
            className="mt-3 w-full bg-blue-600 text-white font-semibold py-4 rounded-xl text-lg active:bg-blue-800"
          >
            {isLoading ? (
              <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Find My Kroger'}
          </button>
          {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
        </div>

        {locationResults.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {locationResults.length} store{locationResults.length !== 1 ? 's' : ''} found
            </p>
            <ul>
              {locationResults.map((loc, idx) => (
                <li key={loc.locationId}>
                  <button
                    onClick={() => onSelect(loc)}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 active:bg-blue-100 transition-colors ${idx < locationResults.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <p className="font-semibold text-gray-900">{loc.name}</p>
                    <p className="text-sm text-gray-500">
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      {/* image */}
      <div className="relative bg-gray-50 flex items-center justify-center h-36">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={product.description}
            loading="lazy"
            className="h-28 w-28 object-contain mix-blend-multiply"
          />
        ) : (
          <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* info */}
      <div className="flex flex-col flex-1 px-3 pt-2 pb-3 gap-1">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">{product.brand || ''}</p>
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">{product.description}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            {size && <p className="text-xs text-gray-500">{size}</p>}
            {price > 0 && (
              <p className="text-sm font-bold text-green-700">${price.toFixed(2)}</p>
            )}
          </div>

          {/* add / qty stepper */}
          {cartItem ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity - 1)}
                className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center hover:bg-blue-200 transition-colors text-lg leading-none"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold text-gray-900">{cartItem.quantity}</span>
              <button
                onClick={() => onUpdateQty(product.productId, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= 20}
                className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-lg leading-none"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAdd(product)}
              className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              aria-label="Add to cart"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<KrogerProduct[]>([])
  const [searching, setSearching] = useState(false)

  const search = async () => {
    const term = inputRef.current?.value?.trim()
    if (!term) return
    setSearching(true)
    try {
      const res = await fetch(`/api/kroger/products?term=${encodeURIComponent(term)}&locationId=${store.locationId}&start=0`)
      const data = await res.json()
      setResults(data.products ?? [])
    } catch { /* ignore */ } finally { setSearching(false) }
  }

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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Choose Substitute</h3>
            <p className="text-xs text-gray-500 truncate max-w-[240px]">for {forItem.product.description}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {/* Previously purchased */}
          {filteredHistory.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Previously Purchased</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filteredHistory.map(h => (
                  <button
                    key={h.productId}
                    onClick={() => pickFromHistory(h)}
                    className="flex-shrink-0 w-24 bg-gray-50 border border-gray-200 rounded-xl p-2 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    {h.img && <img src={h.img} alt={h.description} className="w-12 h-12 object-contain mx-auto mb-1" />}
                    <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{h.description}</p>
                    {h.price > 0 && <p className="text-xs text-green-700 mt-0.5">${h.price.toFixed(2)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Search Products</p>
            <div className="flex gap-2 mb-3">
              <input
                ref={inputRef}
                type="search"
                placeholder="Search for a substitute..."
                onBlur={search}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={search}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
              >
                {searching ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Go'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {results.map(p => (
                <button
                  key={p.productId}
                  onClick={() => pick(p)}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  {getProductImage(p, 'thumbnail') && (
                    <img src={getProductImage(p, 'thumbnail')} alt={p.description} className="w-14 h-14 object-contain mx-auto mb-1" />
                  )}
                  <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{p.description}</p>
                  <p className="text-xs text-gray-400">{p.items?.[0]?.size}</p>
                  {getPrice(p) > 0 && <p className="text-xs text-green-700 font-medium">${getPrice(p).toFixed(2)}</p>}
                </button>
              ))}
            </div>
            {results.length === 0 && !searching && inputRef.current?.value && (
              <p className="text-sm text-gray-400 text-center py-4">No results. Try a different search.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        onClick={onClose}
      />
      {/* panel */}
      <aside className="fixed z-50 bottom-0 left-0 right-0 md:right-0 md:top-0 md:left-auto md:bottom-0 md:w-96 bg-white shadow-2xl flex flex-col rounded-t-2xl md:rounded-none max-h-[85vh] md:max-h-none">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Cart
            {cart.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({cart.reduce((n, i) => n + i.quantity, 0)} items)
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* item list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {cart.length === 0 && (
            <p className="text-center text-gray-400 py-12">Your cart is empty</p>
          )}
          {cart.map((item) => {
            const imgUrl = getProductImage(item.product, 'thumbnail')
            const price = getPrice(item.product)
            return (
              <div key={item.product.productId} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                {imgUrl && (
                  <img
                    src={imgUrl}
                    alt={item.product.description}
                    loading="lazy"
                    className="w-14 h-14 object-contain flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{item.product.description}</p>
                  {price > 0 && (
                    <p className="text-xs text-green-700 font-medium mt-0.5">${(price * item.quantity).toFixed(2)}</p>
                  )}
                  {/* qty stepper */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => onUpdateQty(item.product.productId, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-white border border-gray-300 text-gray-700 font-bold flex items-center justify-center hover:bg-gray-100 transition-colors text-base leading-none"
                      aria-label="Decrease"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.product.productId, item.quantity + 1)}
                      disabled={item.quantity >= 20}
                      className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-base leading-none"
                      aria-label="Increase"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onRemove(item.product.productId)}
                      className="ml-auto w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors"
                      aria-label="Remove item"
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {/* item note */}
                  <input
                    type="text"
                    value={item.note}
                    onChange={(e) => onUpdateNote(item.product.productId, e.target.value)}
                    placeholder="Add a note..."
                    className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  />
                  {/* replacement */}
                  {item.replacement ? (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-2">
                      <div className="flex items-center gap-2">
                        {item.replacement.img && (
                          <img src={item.replacement.img} alt={item.replacement.description} className="w-8 h-8 object-contain flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-amber-700 font-semibold">If unavailable, substitute with:</p>
                          <p className="text-xs text-gray-800 font-medium truncate">{item.replacement.description}</p>
                          {item.replacement.price > 0 && <p className="text-xs text-green-700">${item.replacement.price.toFixed(2)}</p>}
                        </div>
                        <button
                          onClick={() => onRemoveReplacement(item.product.productId)}
                          className="text-xs text-red-400 hover:text-red-600 flex-shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAddReplacement(item.product.productId)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add substitute
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* footer */}
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">
          {cartTotal > 0 && (
            <div className="flex justify-between text-sm font-semibold text-gray-700">
              <span>Estimated total</span>
              <span className="text-green-700">${cartTotal.toFixed(2)}</span>
            </div>
          )}
          <textarea
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="Order note for shopper (optional)..."
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <button
            onClick={onGenerateLink}
            disabled={cart.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Generate Shopper Link
          </button>
        </div>
      </aside>
    </>
  )
}

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
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Close"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Shopper Link Ready</h3>
          <p className="text-sm text-gray-500 mt-1">Share this link with your shopper</p>
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 text-xs border border-gray-300 rounded-xl px-3 py-2.5 bg-gray-50 text-gray-700 truncate focus:outline-none"
          />
          <button
            onClick={onCopy}
            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-sm text-blue-600 underline"
        >
          Open shopper view
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
    if (zip.length < 5) {
      setLocationError('Please enter a 5-digit zip code.')
      return
    }
    setLocationLoading(true)
    setLocationError('')
    try {
      const res = await fetch(`/api/kroger/locations?zip=${zip}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch locations')
      setLocationResults(data)
      if (data.length === 0) setLocationError('No Kroger stores found near that zip code.')
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
      const params = new URLSearchParams({
        term: term.trim(),
        locationId: store.locationId,
        start: String(start),
      })
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
          i.product.productId === productId
            ? { ...i, quantity: Math.min(qty, 20) }
            : i
        )
      )
    }
  }, [removeFromCart])

  const updateNote = useCallback((productId: string, note: string) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.productId === productId ? { ...i, note } : i
      )
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
    // shorten in background, update when ready
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
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-bold text-lg">Kroger Shopping List</span>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
            aria-label="Open cart"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm font-semibold">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Store bar */}
      {store && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-blue-900 truncate">{store.name}</p>
            <p className="text-xs text-blue-600 truncate">
              {store.address.addressLine1}, {store.address.city}, {store.address.state}
            </p>
          </div>
          <button
            onClick={() => {
              setStore(null)
              setLocationResults([])
              setProducts([])
            }}
            className="ml-3 text-xs text-blue-700 underline whitespace-nowrap"
          >
            Change store
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="max-w-3xl mx-auto flex gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products (e.g. milk, bread, chicken)..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm min-w-[70px]"
          >
            {isSearching && searchStart === 0 ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Search'
            )}
          </button>
        </form>
      </div>

      {/* Product grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {searchError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {searchError}
          </div>
        )}

        {products.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg font-medium">Search for products</p>
            <p className="text-sm mt-1">Start typing to find items at {store?.name}</p>
          </div>
        )}

        {products.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Showing {products.length} of {searchTotal} results
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
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-8 py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSearching ? 'Loading...' : `Load more (${searchTotal - products.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}

        {isSearching && products.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </main>

      {/* Cart panel */}
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

      {/* Replacement panel */}
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

      {/* Share modal */}
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
