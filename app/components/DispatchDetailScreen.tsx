'use client'

// Shared "standard shopping checklist" UI — used by both the dedicated
// shopper view (/app/shop) and self-shopping ("Shop Now") inside the main
// app, so both paths behave identically (aisle grouping, checkboxes,
// quantity confirmation, substitute display, done-shopping flow).

import { useState } from 'react'
import type { LiveDispatch, SharedItem, StoreType } from '@/lib/types'

const IC = {
  cream: '#F2EDE0',
  green: '#1C3B2A',
  greenMid: '#2D5240',
  gold: '#C4943A',
  textMuted: '#5A7A6A',
  kroger: '#2A6CB0',
  costco: '#C0272D',
} as const

const STORE_ACCENT: Record<StoreType, string> = { kroger: IC.kroger, costco: IC.costco }
const STORE_LABEL: Record<StoreType, string> = { kroger: 'Kroger', costco: 'Costco' }

function StoreTag({ store }: { store: StoreType }) {
  const color = STORE_ACCENT[store]
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: `${color}18`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {STORE_LABEL[store]}
    </span>
  )
}

function groupByAisle(items: SharedItem[]): Map<string, SharedItem[]> {
  const groups = new Map<string, SharedItem[]>()
  for (const item of items) {
    const key = item.aisle || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  for (const g of groups.values()) g.sort((a, b) => (a.seq || 0) - (b.seq || 0))
  return new Map(
    Array.from(groups.entries()).sort(([ak, ai], [bk, bi]) => {
      if (ak === 'Other') return 1
      if (bk === 'Other') return -1
      const am = Math.min(...ai.map(i => i.seq || Infinity))
      const bm = Math.min(...bi.map(i => i.seq || Infinity))
      return am !== bm ? am - bm : (parseInt(ai[0]?.aisleNum) || 0) - (parseInt(bi[0]?.aisleNum) || 0)
    })
  )
}

export function DispatchDetailScreen({
  dispatch, onToggle, onConfirmQty, onBack, onCheckout, backLabel = 'All Dispatches',
}: {
  dispatch: LiveDispatch
  onToggle: (itemId: string, checked: boolean) => void
  onConfirmQty: (itemId: string, qty: number) => void
  onBack: () => void
  onCheckout: () => void
  backLabel?: string
}) {
  const [qtyItem, setQtyItem] = useState<SharedItem | null>(null)
  const [qtyValue, setQtyValue] = useState(1)
  const [detailItem, setDetailItem] = useState<SharedItem | null>(null)
  const [showDoneModal, setShowDoneModal] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)

  const copyAddress = () => {
    if (!dispatch.addr) return
    navigator.clipboard.writeText(`${dispatch.store}, ${dispatch.addr}`).then(() => {
      setAddressCopied(true)
      setTimeout(() => setAddressCopied(false), 2000)
    }).catch(() => {})
  }

  const total = dispatch.items.reduce((n, i) => n + i.qty, 0)
  const checkedCount = dispatch.checkedItems.length
  const progress = total > 0 ? (checkedCount / total) * 100 : 0
  const allDone = dispatch.items.length > 0 && checkedCount >= dispatch.items.length

  const handleItemPress = (item: SharedItem) => {
    if (dispatch.checkedItems.includes(item.id)) {
      onToggle(item.id, false)
    } else if (item.qty > 1) {
      setQtyItem(item)
      setQtyValue(item.qty)
    } else {
      onToggle(item.id, true)
    }
  }

  const confirmQty = () => {
    if (!qtyItem) return
    onConfirmQty(qtyItem.id, qtyValue)
    onToggle(qtyItem.id, true)
    setQtyItem(null)
  }

  const uncheckedItems = dispatch.items.filter(i => !dispatch.checkedItems.includes(i.id))
  const checkedItems = dispatch.items.filter(i => dispatch.checkedItems.includes(i.id))
  const groups = groupByAisle(uncheckedItems)

  return (
    <div className="min-h-screen" style={{ backgroundColor: IC.cream }}>
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <button
                onClick={onBack}
                className="flex items-center gap-1 mb-1 active:opacity-70 transition-opacity"
                style={{ color: IC.gold }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-[10px] font-black uppercase tracking-widest">{backLabel}</span>
              </button>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-black text-xl text-white uppercase tracking-wider leading-tight">{dispatch.name}</h1>
                <StoreTag store={dispatch.storeType ?? 'kroger'} />
              </div>
              {dispatch.addr ? (
                <button onClick={copyAddress} className="text-left active:opacity-70 transition-opacity mt-0.5">
                  <p className="text-xs truncate" style={{ color: addressCopied ? '#86efac' : IC.gold }}>
                    {addressCopied ? '✓ Address copied!' : dispatch.store}
                  </p>
                  {!addressCopied && <p className="text-xs truncate opacity-60 text-white">{dispatch.addr} · tap to copy</p>}
                </button>
              ) : (
                <p className="text-xs truncate mt-0.5" style={{ color: IC.gold }}>{dispatch.store}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0 rounded-2xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <p className="text-3xl font-black text-white leading-none">{checkedCount}</p>
              <p className="text-xs font-semibold" style={{ color: IC.gold }}>of {total}</p>
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, backgroundColor: IC.gold }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-xs font-medium opacity-60 text-white">{Math.round(progress)}% complete</p>
            {dispatch.tip !== undefined && dispatch.tip > 0 && (
              <p className="text-xs font-black" style={{ color: IC.gold }}>Tip: ${dispatch.tip.toFixed(2)}</p>
            )}
          </div>
        </div>
      </header>

      {dispatch.note && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl px-4 py-3" style={{ border: `1px solid ${IC.gold}40` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-1" style={{ color: IC.gold }}>Dispatch Note</p>
            <p className="text-sm font-medium" style={{ color: IC.green }}>{dispatch.note}</p>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-6">
        {Array.from(groups.entries()).map(([aisle, items]) => {
          const aisleChecked = items.filter(i => dispatch.checkedItems.includes(i.id)).length
          const aisleDone = aisleChecked === items.length
          return (
            <section key={aisle}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300"
                  style={{ backgroundColor: aisleDone ? IC.gold : IC.green }}>
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
                <h2 className="font-black text-sm uppercase tracking-wider" style={{ color: aisleDone ? IC.textMuted : IC.green }}>{aisle}</h2>
                <span className="text-xs font-bold ml-auto" style={{ color: IC.textMuted }}>{aisleChecked}/{items.length}</span>
              </div>

              <ul className="space-y-2">
                {items.map(item => {
                  const isDone = dispatch.checkedItems.includes(item.id)
                  const confirmedQty = dispatch.confirmedQtys[item.id]
                  return (
                    <li key={item.id}>
                      <div
                        className="w-full text-left rounded-2xl transition-all duration-200"
                        style={{
                          backgroundColor: isDone ? '#EDE8DA' : 'white',
                          border: isDone ? `2px solid ${IC.gold}50` : '1px solid #E5DDD0',
                        }}
                      >
                        <div className="flex items-start gap-3 p-3">
                          <button
                            onClick={() => handleItemPress(item)}
                            className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200 active:scale-90"
                            style={{ backgroundColor: isDone ? IC.gold : 'transparent', borderColor: isDone ? IC.gold : '#C8BFB0' }}>
                            {isDone && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          {item.img && (
                            <img src={item.img} alt={item.name} loading="lazy"
                              className="w-14 h-14 object-contain flex-shrink-0 transition-all duration-200"
                              style={{ opacity: isDone ? 0.35 : 1, filter: isDone ? 'grayscale(1)' : 'none' }} />
                          )}
                          <button
                            onClick={() => setDetailItem(item)}
                            className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {item.brand && (
                                  <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                                    style={{ color: isDone ? '#9DB8A8' : IC.textMuted }}>{item.brand}</p>
                                )}
                                <p className="text-sm font-bold leading-tight transition-all duration-200"
                                  style={{ color: isDone ? '#9DB8A8' : IC.green, textDecoration: isDone ? 'line-through' : 'none' }}>
                                  {item.name}
                                </p>
                                {item.size && <p className="text-xs mt-0.5 font-semibold" style={{ color: isDone ? '#B8C8C0' : IC.gold }}>{item.size}</p>}
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span className="inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-black px-2 transition-all duration-200"
                                  style={{ backgroundColor: isDone ? '#E5DDD0' : `${IC.gold}20`, color: isDone ? '#9DB8A8' : IC.gold }}>
                                  ×{isDone && confirmedQty !== undefined ? confirmedQty : item.qty}
                                </span>
                                {item.price > 0 && (
                                  <p className="text-xs mt-1 font-bold" style={{ color: isDone ? '#9DB8A8' : IC.gold }}>
                                    ${(item.price * item.qty).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>
                            {item.note && (
                              <div className="mt-2 text-xs rounded-xl px-3 py-1.5 font-medium"
                                style={{ backgroundColor: isDone ? '#E5DDD0' : `${IC.gold}15`, color: isDone ? '#9DB8A8' : IC.greenMid }}>
                                <span className="font-black">Note:</span> {item.note}
                              </div>
                            )}
                            {item.sub && (
                              <div className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2 transition-all duration-200"
                                style={{ backgroundColor: isDone ? '#E5DDD0' : 'white', border: isDone ? 'none' : `1px solid ${IC.gold}40` }}>
                                {item.sub.img && (
                                  <img src={item.sub.img} alt={item.sub.name} className="w-8 h-8 object-contain flex-shrink-0"
                                    style={{ opacity: isDone ? 0.4 : 1, filter: isDone ? 'grayscale(1)' : 'none' }} />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-black" style={{ color: isDone ? '#9DB8A8' : IC.gold }}>If unavailable, use:</p>
                                  <p className="text-xs font-semibold truncate" style={{ color: isDone ? '#9DB8A8' : IC.green }}>{item.sub.name}</p>
                                  <p className="text-xs" style={{ color: isDone ? '#B8C8C0' : IC.textMuted }}>{item.sub.size} · ×{item.sub.qty}</p>
                                </div>
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        {checkedItems.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: IC.gold }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-black text-sm uppercase tracking-wider" style={{ color: IC.textMuted }}>Items Found</h2>
              <span className="text-xs font-bold ml-auto" style={{ color: IC.textMuted }}>{checkedItems.length}</span>
            </div>
            <ul className="space-y-2">
              {checkedItems.map(item => {
                const confirmedQty = dispatch.confirmedQtys[item.id]
                return (
                  <li key={item.id}>
                    <div className="w-full text-left rounded-2xl transition-all duration-200" style={{ backgroundColor: '#EDE8DA', border: `2px solid ${IC.gold}50` }}>
                      <div className="flex items-start gap-3 p-3">
                        <button
                          onClick={() => handleItemPress(item)}
                          className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200 active:scale-90"
                          style={{ backgroundColor: IC.gold, borderColor: IC.gold }}>
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        {item.img && (
                          <img src={item.img} alt={item.name} loading="lazy" className="w-14 h-14 object-contain flex-shrink-0 opacity-40 grayscale" />
                        )}
                        <button onClick={() => setDetailItem(item)} className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {item.brand && <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#9DB8A8' }}>{item.brand}</p>}
                              <p className="text-sm font-bold leading-tight line-through" style={{ color: '#9DB8A8' }}>{item.name}</p>
                              {item.size && <p className="text-xs mt-0.5" style={{ color: '#B8C8C0' }}>{item.size}</p>}
                            </div>
                            <span className="inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-black px-2" style={{ backgroundColor: '#E5DDD0', color: '#9DB8A8' }}>
                              ×{confirmedQty !== undefined ? confirmedQty : item.qty}
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3 max-w-2xl mx-auto">
        <button
          onClick={() => setShowDoneModal(true)}
          className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] shadow-lg"
          style={{ backgroundColor: allDone ? IC.gold : IC.green, color: allDone ? IC.green : 'white' }}
        >
          {allDone ? '✓ All Items Found — I\'m Done' : `I'm Done Shopping (${checkedCount}/${total})`}
        </button>
      </div>

      {showDoneModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDoneModal(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-10">
            <div className="flex justify-center mb-5">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
            </div>
            <div className="text-center mb-6">
              <p className="font-black text-xl uppercase tracking-widest mb-1" style={{ color: IC.green }}>
                {allDone ? 'Mission Complete!' : 'Done Shopping?'}
              </p>
              <p className="text-sm" style={{ color: IC.textMuted }}>
                {checkedCount} of {total} item{total !== 1 ? 's' : ''} collected · {dispatch.store}
              </p>
              {!allDone && (
                <p className="text-xs mt-2 font-semibold" style={{ color: IC.gold }}>
                  {total - checkedCount} item{total - checkedCount !== 1 ? 's' : ''} still unchecked
                </p>
              )}
            </div>
            <div className="space-y-3">
              <button
                onClick={onCheckout}
                className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97]"
                style={{ backgroundColor: IC.green, color: 'white' }}
              >Mark Complete — Send for Review →</button>
              <button
                onClick={() => setShowDoneModal(false)}
                className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97]"
                style={{ backgroundColor: IC.cream, color: IC.green }}
              >Back to Dispatch</button>
            </div>
          </div>
        </div>
      )}

      {detailItem && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailItem(null)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl px-5 pt-4 pb-10 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
            </div>
            <div className="flex gap-4 mb-4">
              {detailItem.img && (
                <img src={detailItem.img} alt={detailItem.name} className="w-24 h-24 object-contain flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {detailItem.brand && (
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: IC.textMuted }}>{detailItem.brand}</p>
                )}
                <p className="text-base font-black leading-snug" style={{ color: IC.green }}>{detailItem.name}</p>
                {detailItem.size && (
                  <p className="text-sm font-bold mt-1" style={{ color: IC.gold }}>{detailItem.size}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid #E5DDD0' }}>
                <span className="text-sm font-semibold" style={{ color: IC.textMuted }}>Quantity needed</span>
                <span className="text-sm font-black" style={{ color: IC.green }}>×{detailItem.qty}</span>
              </div>
              {detailItem.price > 0 && (
                <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid #E5DDD0' }}>
                  <span className="text-sm font-semibold" style={{ color: IC.textMuted }}>Price (est.)</span>
                  <span className="text-sm font-black" style={{ color: IC.gold }}>${(detailItem.price * detailItem.qty).toFixed(2)}</span>
                </div>
              )}
              {detailItem.aisle && detailItem.aisle !== 'Other' && (
                <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid #E5DDD0' }}>
                  <span className="text-sm font-semibold" style={{ color: IC.textMuted }}>Aisle</span>
                  <span className="text-sm font-black" style={{ color: IC.green }}>{detailItem.aisle} {detailItem.aisleNum ? `(#${detailItem.aisleNum})` : ''}</span>
                </div>
              )}
              {detailItem.note && (
                <div className="py-2" style={{ borderBottom: '1px solid #E5DDD0' }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: IC.textMuted }}>Note from orderer</p>
                  <p className="text-sm font-medium" style={{ color: IC.green }}>{detailItem.note}</p>
                </div>
              )}
              {detailItem.sub && (
                <div className="py-2">
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: IC.gold }}>If unavailable, substitute with:</p>
                  <div className="flex items-center gap-3 bg-white rounded-2xl p-3" style={{ border: `1px solid ${IC.gold}40` }}>
                    {detailItem.sub.img && <img src={detailItem.sub.img} alt={detailItem.sub.name} className="w-12 h-12 object-contain flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: IC.green }}>{detailItem.sub.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: IC.textMuted }}>{detailItem.sub.size} · ×{detailItem.sub.qty}</p>
                      {detailItem.sub.price > 0 && <p className="text-xs font-bold" style={{ color: IC.gold }}>${(detailItem.sub.price * detailItem.sub.qty).toFixed(2)}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => { handleItemPress(detailItem); setDetailItem(null) }}
              className="w-full mt-5 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] text-white"
              style={{ backgroundColor: dispatch.checkedItems.includes(detailItem.id) ? '#9B8470' : IC.green }}
            >
              {dispatch.checkedItems.includes(detailItem.id) ? 'Unmark as Collected' : 'Mark as Collected ✓'}
            </button>
          </div>
        </div>
      )}

      {qtyItem && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setQtyItem(null)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl px-5 pt-4 pb-8">
            <div className="flex justify-center mb-5">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
            </div>
            <h3 className="font-black uppercase tracking-wider text-sm mb-1" style={{ color: IC.green }}>Confirm Quantity</h3>
            <p className="text-sm mb-1 truncate font-medium" style={{ color: IC.green }}>{qtyItem.name}</p>
            <p className="text-xs mb-6" style={{ color: IC.textMuted }}>Ordered: {qtyItem.qty} — how many did you find?</p>
            <div className="flex items-center justify-center gap-8 mb-6">
              <button onClick={() => setQtyValue(v => Math.max(1, v - 1))}
                className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-2xl active:scale-90 transition-all duration-100"
                style={{ backgroundColor: '#E5DDD0', color: IC.green }}>−</button>
              <span className="text-4xl font-black w-16 text-center" style={{ color: IC.green }}>{qtyValue}</span>
              <button onClick={() => setQtyValue(v => Math.min(qtyItem.qty, v + 1))}
                className="w-14 h-14 rounded-full text-white flex items-center justify-center font-bold text-2xl active:scale-90 transition-all duration-100"
                style={{ backgroundColor: IC.green }}>+</button>
            </div>
            <button onClick={confirmQty}
              className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] text-white"
              style={{ backgroundColor: IC.green }}>
              Found {qtyValue} — Mark Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
