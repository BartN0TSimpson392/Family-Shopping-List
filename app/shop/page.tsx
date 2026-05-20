'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { SharedList, SharedItem } from '@/lib/types'

const IC = {
  cream: '#F2EDE0',
  green: '#1C3B2A',
  greenMid: '#2D5240',
  gold: '#C4943A',
  textMuted: '#5A7A6A',
} as const

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

function decodeList(encoded: string): SharedList | null {
  try { return JSON.parse(decodeURIComponent(atob(encoded))) as SharedList } catch { return null }
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: IC.green }}>
        <RadarLogoWhite className="w-20 h-20 mb-6 opacity-60" />
        <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-2">No Dispatch Found</h1>
        <p className="text-sm mb-6" style={{ color: IC.gold }}>This link doesn't have a shopping list attached.</p>
        <a href="/" className="font-bold px-6 py-3 rounded-2xl active:scale-95 transition-all duration-100 shadow-lg uppercase tracking-widest text-sm" style={{ backgroundColor: IC.gold, color: IC.green }}>
          Open Inner Circle →
        </a>
      </div>
    )
  }

  const list = decodeList(listParam)

  if (!list) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: IC.green }}>
        <p className="text-white font-bold text-lg mb-4">Couldn't decode this dispatch — the link may be corrupted.</p>
        <a href="/" className="font-bold px-6 py-3 rounded-2xl active:scale-95 transition-all duration-100 uppercase tracking-widest text-sm" style={{ backgroundColor: IC.gold, color: IC.green }}>
          Open Inner Circle →
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
      if (next.has(id)) next.delete(id) else next.add(id)
      return next
    })
  }

  const groups = groupByAisle(list.items)

  return (
    <div className="min-h-screen" style={{ backgroundColor: IC.cream }}>
      {/* Header */}
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <RadarLogoWhite className="w-5 h-5" />
                <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase">Inner Circle</span>
                <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: IC.gold }}>· Private Dispatch</span>
              </div>
              <h1 className="font-black text-xl text-white uppercase tracking-wider leading-tight">Dispatch List</h1>
              <p className="text-xs truncate mt-0.5" style={{ color: IC.gold }}>{list.store}</p>
              <p className="text-xs truncate opacity-60 text-white">{list.addr}</p>
            </div>
            <div className="text-right flex-shrink-0 rounded-2xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <p className="text-3xl font-black text-white leading-none">{checkedCount}</p>
              <p className="text-xs font-semibold" style={{ color: IC.gold }}>of {totalItems}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, backgroundColor: IC.gold }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-xs font-medium opacity-60 text-white">{Math.round(progress)}% complete</p>
            {allDone && <p className="text-xs font-black" style={{ color: IC.gold }}>Mission complete ✓</p>}
          </div>
        </div>
      </header>

      {/* Order note */}
      {list.note && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl px-4 py-3" style={{ border: `1px solid ${IC.gold}40` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-1" style={{ color: IC.gold }}>Dispatch Note</p>
            <p className="text-sm font-medium" style={{ color: IC.green }}>{list.note}</p>
          </div>
        </div>
      )}

      {/* Aisle groups */}
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-20 space-y-6">
        {list.items.length === 0 && (
          <p className="text-center py-16 font-medium" style={{ color: IC.textMuted }}>No items in this dispatch.</p>
        )}

        {Array.from(groups.entries()).map(([aisle, items]) => {
          const aisleChecked = items.filter((i) => checked.has(i.id)).length
          const aisleDone = aisleChecked === items.length
          return (
            <section key={aisle}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300"
                  style={{ backgroundColor: aisleDone ? IC.gold : IC.green }}
                >
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
                <h2 className="font-black text-sm uppercase tracking-wider transition-colors duration-300" style={{ color: aisleDone ? IC.textMuted : IC.green }}>
                  {aisle}
                </h2>
                <span className="text-xs font-bold ml-auto" style={{ color: IC.textMuted }}>
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
                        className="w-full text-left rounded-2xl transition-all duration-200 active:scale-[0.98]"
                        style={{
                          backgroundColor: isDone ? '#EDE8DA' : 'white',
                          border: isDone ? `2px solid ${IC.gold}50` : `1px solid #E5DDD0`,
                        }}
                      >
                        <div className="flex items-start gap-3 p-3">
                          {/* Checkbox */}
                          <div
                            className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                            style={{
                              backgroundColor: isDone ? IC.gold : 'transparent',
                              borderColor: isDone ? IC.gold : '#C8BFB0',
                              transform: isDone ? 'scale(1.1)' : 'scale(1)',
                            }}
                          >
                            {isDone && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          {item.img && (
                            <img
                              src={item.img}
                              alt={item.name}
                              loading="lazy"
                              className="w-14 h-14 object-contain flex-shrink-0 transition-all duration-200"
                              style={{ opacity: isDone ? 0.35 : 1, filter: isDone ? 'grayscale(1)' : 'none' }}
                            />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {item.brand && (
                                  <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: isDone ? '#9DB8A8' : IC.textMuted }}>
                                    {item.brand}
                                  </p>
                                )}
                                <p
                                  className="text-sm font-bold leading-tight transition-all duration-200"
                                  style={{ color: isDone ? '#9DB8A8' : IC.green, textDecoration: isDone ? 'line-through' : 'none' }}
                                >
                                  {item.name}
                                </p>
                                {item.size && (
                                  <p className="text-xs mt-0.5" style={{ color: isDone ? '#B8C8C0' : IC.textMuted }}>{item.size}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span
                                  className="inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-black px-2 transition-all duration-200"
                                  style={{ backgroundColor: isDone ? '#E5DDD0' : `${IC.gold}20`, color: isDone ? '#9DB8A8' : IC.gold }}
                                >
                                  ×{item.qty}
                                </span>
                                {item.price > 0 && (
                                  <p className="text-xs mt-1 font-bold" style={{ color: isDone ? '#9DB8A8' : IC.gold }}>
                                    ${(item.price * item.qty).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>

                            {item.note && (
                              <div
                                className="mt-2 text-xs rounded-xl px-3 py-1.5 font-medium"
                                style={{ backgroundColor: isDone ? '#E5DDD0' : `${IC.gold}15`, color: isDone ? '#9DB8A8' : IC.greenMid }}
                              >
                                <span className="font-black">Note:</span> {item.note}
                              </div>
                            )}

                            {item.sub && (
                              <div
                                className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2 transition-all duration-200"
                                style={{ backgroundColor: isDone ? '#E5DDD0' : 'white', border: isDone ? 'none' : `1px solid ${IC.gold}40` }}
                              >
                                {item.sub.img && (
                                  <img src={item.sub.img} alt={item.sub.name} className="w-8 h-8 object-contain flex-shrink-0" style={{ opacity: isDone ? 0.4 : 1, filter: isDone ? 'grayscale(1)' : 'none' }} />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-black" style={{ color: isDone ? '#9DB8A8' : IC.gold }}>If unavailable, use:</p>
                                  <p className="text-xs font-semibold truncate" style={{ color: isDone ? '#9DB8A8' : IC.green }}>{item.sub.name}</p>
                                  <p className="text-xs" style={{ color: isDone ? '#B8C8C0' : IC.textMuted }}>{item.sub.size} · ×{item.sub.qty}</p>
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
          <div className="rounded-3xl px-6 py-8 text-center shadow-xl" style={{ backgroundColor: IC.green }}>
            <RadarLogoWhite className="w-16 h-16 mx-auto mb-4" />
            <p className="font-black text-white text-2xl uppercase tracking-widest">Mission Complete</p>
            <p className="text-sm mt-2 font-medium" style={{ color: IC.gold }}>Every item has been collected.</p>
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
        <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: IC.green }}>
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
          <p className="font-bold text-sm uppercase tracking-widest" style={{ color: IC.gold }}>Loading dispatch…</p>
        </div>
      }
    >
      <ShopContent />
    </Suspense>
  )
}
