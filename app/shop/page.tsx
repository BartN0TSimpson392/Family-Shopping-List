'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { SharedList, SharedItem } from '@/lib/types'

function decodeList(encoded: string): SharedList | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as SharedList
  } catch {
    return null
  }
}

function groupByAisle(items: SharedItem[]): Map<string, SharedItem[]> {
  const groups = new Map<string, SharedItem[]>()
  for (const item of items) {
    const key = item.aisle || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  for (const aisleItems of groups.values()) {
    aisleItems.sort((a, b) => (a.seq || 0) - (b.seq || 0))
  }
  const aisleOrder = Array.from(groups.entries()).sort(([aKey, aItems], [bKey, bItems]) => {
    if (aKey === 'Other') return 1
    if (bKey === 'Other') return -1
    const aMin = Math.min(...aItems.map(i => i.seq || Infinity))
    const bMin = Math.min(...bItems.map(i => i.seq || Infinity))
    if (aMin !== bMin) return aMin - bMin
    return (parseInt(aItems[0]?.aisleNum) || 0) - (parseInt(bItems[0]?.aisleNum) || 0)
  })
  return new Map(aisleOrder)
}

function ShopContent() {
  const searchParams = useSearchParams()
  const listParam = searchParams.get('list')
  const [checked, setChecked] = useState<Set<string>>(new Set())

  if (!listParam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-violet-700 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white mb-2">No list found</h1>
        <p className="text-indigo-200 text-sm mb-6">This link doesn't have a shopping list attached.</p>
        <a href="/" className="bg-white text-indigo-700 font-bold px-6 py-3 rounded-2xl active:scale-95 transition-all duration-100 shadow-lg">
          Open FSL →
        </a>
      </div>
    )
  }

  const list = decodeList(listParam)

  if (!list) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-violet-700 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-white font-bold text-lg mb-4">Couldn't decode this list — the link may be corrupted.</p>
        <a href="/" className="bg-white text-indigo-700 font-bold px-6 py-3 rounded-2xl active:scale-95 transition-all duration-100">
          Open FSL →
        </a>
      </div>
    )
  }

  const totalItems = list.items.reduce((n, i) => n + i.qty, 0)
  const checkedCount = list.items.filter((i) => checked.has(i.id)).reduce((n, i) => n + i.qty, 0)
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0
  const allDone = list.items.length > 0 && checkedCount >= totalItems

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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-violet-600 sticky top-0 z-30 shadow-lg shadow-indigo-900/20">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-black text-indigo-200 uppercase tracking-widest">FSL</span>
                <span className="text-indigo-300 text-xs">·</span>
                <span className="text-xs text-indigo-200 truncate">{list.store}</span>
              </div>
              <h1 className="font-black text-2xl text-white leading-tight">Shopping List</h1>
              <p className="text-indigo-300 text-xs truncate mt-0.5">{list.addr}</p>
            </div>
            <div className="text-right flex-shrink-0 bg-white/20 rounded-2xl px-3 py-2">
              <p className="text-3xl font-black text-white leading-none">{checkedCount}</p>
              <p className="text-indigo-200 text-xs font-semibold">of {totalItems}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 bg-indigo-900/40 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-xs text-indigo-300 font-medium">{Math.round(progress)}% complete</p>
            {allDone && <p className="text-xs text-emerald-300 font-bold">All done! 🎉</p>}
          </div>
        </div>
      </header>

      {/* Order note */}
      {list.note && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Note from shopper</p>
            <p className="text-sm text-amber-900 font-medium">{list.note}</p>
          </div>
        </div>
      )}

      {/* Aisle groups */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-20 space-y-6">
        {list.items.length === 0 && (
          <p className="text-center text-slate-400 py-16 font-medium">No items in this list.</p>
        )}

        {Array.from(groups.entries()).map(([aisle, items]) => {
          const aisleChecked = items.filter((i) => checked.has(i.id)).length
          const aisleDone = aisleChecked === items.length
          return (
            <section key={aisle}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  aisleDone ? 'bg-emerald-500' : 'bg-gradient-to-br from-indigo-500 to-violet-500'
                }`}>
                  {aisleDone ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  )}
                </div>
                <h2 className={`font-black text-base transition-colors duration-300 ${aisleDone ? 'text-slate-400' : 'text-slate-800'}`}>
                  {aisle}
                </h2>
                <span className="text-xs text-slate-400 font-bold ml-auto">
                  {aisleChecked}/{items.length}
                </span>
              </div>

              <ul className="space-y-2">
                {items.map((item) => {
                  const isDone = checked.has(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`w-full text-left rounded-2xl border-2 transition-all duration-200 active:scale-[0.98] ${
                          isDone
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50'
                        }`}
                      >
                        <div className="flex items-start gap-3 p-3">
                          {/* checkbox */}
                          <div className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-500 scale-110'
                              : 'border-slate-300'
                          }`}>
                            {isDone && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              className={`w-14 h-14 object-contain flex-shrink-0 transition-all duration-200 ${isDone ? 'grayscale opacity-40' : ''}`}
                            />
                          )}

                          {/* info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {item.brand && (
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                                    {item.brand}
                                  </p>
                                )}
                                <p className={`text-sm font-bold leading-tight transition-all duration-200 ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {item.name}
                                </p>
                                {item.size && (
                                  <p className={`text-xs mt-0.5 ${isDone ? 'text-slate-300' : 'text-slate-400'}`}>{item.size}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span className={`inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-black px-2 transition-all duration-200 ${
                                  isDone ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 text-indigo-700'
                                }`}>
                                  ×{item.qty}
                                </span>
                                {item.price > 0 && (
                                  <p className={`text-xs mt-1 font-bold ${isDone ? 'text-slate-300' : 'text-emerald-600'}`}>
                                    ${(item.price * item.qty).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>

                            {item.note && (
                              <div className={`mt-2 text-xs rounded-xl px-3 py-1.5 font-medium ${isDone ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-700'}`}>
                                <span className="font-black">Note:</span> {item.note}
                              </div>
                            )}

                            {item.sub && (
                              <div className={`mt-2 rounded-xl px-3 py-2 flex items-center gap-2 transition-all duration-200 ${isDone ? 'bg-slate-100' : 'bg-amber-50 border border-amber-200'}`}>
                                {item.sub.img && (
                                  <img src={item.sub.img} alt={item.sub.name} className={`w-8 h-8 object-contain flex-shrink-0 ${isDone ? 'grayscale opacity-40' : ''}`} />
                                )}
                                <div className="min-w-0">
                                  <p className={`text-xs font-black ${isDone ? 'text-slate-400' : 'text-amber-700'}`}>If unavailable, use:</p>
                                  <p className={`text-xs font-semibold truncate ${isDone ? 'text-slate-400' : 'text-slate-800'}`}>{item.sub.name}</p>
                                  <p className={`text-xs ${isDone ? 'text-slate-300' : 'text-slate-400'}`}>{item.sub.size} · ×{item.sub.qty}</p>
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
          )
        })}

        {/* Completion banner */}
        {allDone && (
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl px-6 py-8 text-center shadow-xl shadow-emerald-200">
            <div className="text-5xl mb-3">🎉</div>
            <p className="font-black text-white text-2xl">All done!</p>
            <p className="text-emerald-100 text-sm mt-2 font-medium">Every item has been collected. Great work!</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-gradient-to-br from-indigo-600 to-violet-700">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-bold text-sm">Loading your list…</p>
        </div>
      }
    >
      <ShopContent />
    </Suspense>
  )
}
