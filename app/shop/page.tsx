'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { SharedList, SharedItem } from '@/lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function decodeList(encoded: string): SharedList | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as SharedList
  } catch {
    return null
  }
}

function groupByAisle(items: SharedItem[]): Map<string, SharedItem[]> {
  // Step 1: group items into aisles
  const groups = new Map<string, SharedItem[]>()
  for (const item of items) {
    const key = item.aisle || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  // Step 2: sort items within each aisle by seq
  for (const aisleItems of groups.values()) {
    aisleItems.sort((a, b) => (a.seq || 0) - (b.seq || 0))
  }

  // Step 3: sort aisles by their minimum seq (= where that aisle sits in the store)
  // Items with no seq data (seq=0, aisle='Other') go last
  const aisleOrder = Array.from(groups.entries()).sort(([aKey, aItems], [bKey, bItems]) => {
    if (aKey === 'Other') return 1
    if (bKey === 'Other') return -1
    const aMin = Math.min(...aItems.map(i => i.seq || Infinity))
    const bMin = Math.min(...bItems.map(i => i.seq || Infinity))
    if (aMin !== bMin) return aMin - bMin
    // Tiebreak: numeric aisle number
    return (parseInt(aItems[0]?.aisleNum) || 0) - (parseInt(bItems[0]?.aisleNum) || 0)
  })

  return new Map(aisleOrder)
}

// ── inner content (reads search params) ──────────────────────────────────────

function ShopContent() {
  const searchParams = useSearchParams()
  const listParam = searchParams.get('list')
  const [checked, setChecked] = useState<Set<string>>(new Set())

  if (!listParam) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h1 className="text-xl font-bold text-gray-800 mb-2">No shopping list found</h1>
        <p className="text-gray-500 text-sm">Use the Kroger Shopping List app to generate a shopper link.</p>
        <a href="/" className="mt-4 text-blue-600 underline text-sm">Go to Shopping List Builder</a>
      </div>
    )
  }

  const list = decodeList(listParam)

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <p className="text-red-600 font-semibold">Could not decode shopping list. The link may be corrupted.</p>
        <a href="/" className="mt-4 text-blue-600 underline text-sm">Go to Shopping List Builder</a>
      </div>
    )
  }

  const totalItems = list.items.reduce((n, i) => n + i.qty, 0)
  const checkedCount = list.items
    .filter((i) => checked.has(i.id))
    .reduce((n, i) => n + i.qty, 0)
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0

  const toggleItem = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const groups = groupByAisle(list.items)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-lg leading-tight">Shopping List</h1>
              <p className="text-blue-200 text-sm truncate">{list.store}</p>
              <p className="text-blue-300 text-xs truncate">{list.addr}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold leading-none">{checkedCount}</p>
              <p className="text-blue-200 text-xs">of {totalItems} done</p>
            </div>
          </div>

          {/* progress bar */}
          <div className="mt-3 bg-blue-900/50 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-blue-200 mt-1">{Math.round(progress)}% complete</p>
        </div>
      </header>

      {/* Order note */}
      {list.note && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-yellow-700 mb-1 uppercase tracking-wide">Order Note</p>
            <p className="text-sm text-yellow-900">{list.note}</p>
          </div>
        </div>
      )}

      {/* Aisle groups */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-16 space-y-6">
        {list.items.length === 0 && (
          <p className="text-center text-gray-400 py-12">No items in this list.</p>
        )}

        {Array.from(groups.entries()).map(([aisle, items]) => (
          <section key={aisle}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <h2 className="font-bold text-gray-800 text-base">{aisle}</h2>
              <span className="text-xs text-gray-400 font-medium">
                {items.filter((i) => checked.has(i.id)).length}/{items.length}
              </span>
            </div>

            <ul className="space-y-2">
              {items.map((item) => {
                const isDone = checked.has(item.id)
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`w-full text-left bg-white rounded-xl border transition-all active:scale-[0.99] ${
                        isDone
                          ? 'border-green-200 bg-green-50 opacity-70'
                          : 'border-gray-200 hover:border-blue-200 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {/* checkbox */}
                        <div className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isDone
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-300'
                        }`}>
                          {isDone && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>

                        {/* product image */}
                        {item.img && (
                          <img
                            src={item.img}
                            alt={item.name}
                            loading="lazy"
                            className={`w-14 h-14 object-contain flex-shrink-0 ${isDone ? 'grayscale opacity-50' : ''}`}
                          />
                        )}

                        {/* info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {item.brand && (
                                <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${isDone ? 'text-gray-400' : 'text-gray-400'}`}>
                                  {item.brand}
                                </p>
                              )}
                              <p className={`text-sm font-semibold leading-tight ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                {item.name}
                              </p>
                              {item.size && (
                                <p className={`text-xs mt-0.5 ${isDone ? 'text-gray-400' : 'text-gray-500'}`}>{item.size}</p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <span className={`inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-bold px-2 ${
                                isDone
                                  ? 'bg-gray-100 text-gray-400'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                ×{item.qty}
                              </span>
                              {item.price > 0 && (
                                <p className={`text-xs mt-1 ${isDone ? 'text-gray-400' : 'text-green-700 font-medium'}`}>
                                  ${(item.price * item.qty).toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* item note */}
                          {item.note && (
                            <div className={`mt-2 text-xs rounded-lg px-2 py-1.5 ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'}`}>
                              <span className="font-medium">Note:</span> {item.note}
                            </div>
                          )}
                          {/* substitute */}
                          {item.sub && (
                            <div className={`mt-2 rounded-lg px-2 py-2 flex items-center gap-2 ${isDone ? 'bg-gray-100' : 'bg-amber-50 border border-amber-200'}`}>
                              {item.sub.img && (
                                <img src={item.sub.img} alt={item.sub.name} className={`w-8 h-8 object-contain flex-shrink-0 ${isDone ? 'grayscale opacity-40' : ''}`} />
                              )}
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold ${isDone ? 'text-gray-400' : 'text-amber-700'}`}>If unavailable, substitute with:</p>
                                <p className={`text-xs font-medium truncate ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>{item.sub.name}</p>
                                <p className={`text-xs ${isDone ? 'text-gray-400' : 'text-gray-500'}`}>{item.sub.size} · ×{item.sub.qty}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {/* completion banner */}
        {list.items.length > 0 && checkedCount >= totalItems && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="font-bold text-green-800 text-lg">All done!</p>
            <p className="text-green-600 text-sm mt-1">Every item has been collected.</p>
          </div>
        )}
      </main>
    </div>
  )
}

// ── page export with Suspense ─────────────────────────────────────────────────

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ShopContent />
    </Suspense>
  )
}
