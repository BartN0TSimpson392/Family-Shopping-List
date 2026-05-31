'use client'

import { Suspense } from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, onSnapshot, query, where, updateDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { LiveDispatch, MemberRole, SharedItem } from '@/lib/types'

const FAMILY_ID_KEY = 'ic-family-id'
const MEMBER_ID_KEY = 'ic-member-id'
const MEMBER_NAME_KEY = 'ic-member-name'
const MEMBER_ROLES_KEY = 'ic-member-roles'

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

// ── No-access screen ──────────────────────────────────────────────────────────

function NoAccessScreen({ onGoHome }: { onGoHome: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ backgroundColor: IC.green }}>
      <RadarLogoWhite className="w-20 h-20 mb-6 opacity-80" />
      <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-2">Inner Circle</h1>
      <p className="text-sm font-bold tracking-widest uppercase mb-10" style={{ color: IC.gold }}>Not logged in</p>
      <p className="text-white opacity-70 text-sm text-center mb-8">
        Please open the app and log into your family account first.
      </p>
      <button
        onClick={onGoHome}
        className="py-4 px-8 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97]"
        style={{ backgroundColor: IC.gold, color: IC.green }}
      >
        Go to App →
      </button>
    </div>
  )
}

// ── Dispatch list ─────────────────────────────────────────────────────────────

function DispatchListScreen({
  shopperName, dispatches, hasOrderRole, onOpen, onSwitchToOrders,
}: {
  shopperName: string
  dispatches: LiveDispatch[]
  hasOrderRole: boolean
  onOpen: (d: LiveDispatch) => void
  onSwitchToOrders: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: IC.cream }}>
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RadarLogoWhite className="w-7 h-7" />
            <div>
              <span className="font-black text-white tracking-[0.12em] uppercase text-sm leading-none block">Inner Circle</span>
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase leading-none block" style={{ color: IC.gold }}>Shopper View</span>
            </div>
          </div>
          <button
            onClick={onSwitchToOrders}
            className="text-xs font-bold active:scale-95 transition-all duration-100"
            style={{ color: IC.gold }}
          >{hasOrderRole ? '← Orders' : 'Log Out'}</button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <p className="text-2xl font-black uppercase tracking-widest mb-1" style={{ color: IC.green }}>
          Hey, {shopperName}
        </p>
        <p className="text-sm mb-6" style={{ color: IC.textMuted }}>Your active dispatches</p>

        {dispatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <RadarLogoWhite className="w-20 h-20 opacity-20 mb-5" />
            <p className="text-lg font-black uppercase tracking-widest mb-2" style={{ color: IC.green }}>No Dispatches Yet</p>
            <p className="text-sm" style={{ color: IC.textMuted }}>Waiting for an order to be sent your way.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dispatches.map(d => {
              const total = d.items.reduce((n, i) => n + i.qty, 0)
              const checked = d.checkedItems.length
              const pct = total > 0 ? (checked / total) * 100 : 0
              return (
                <button
                  key={d.id}
                  onClick={() => onOpen(d)}
                  className="w-full bg-white rounded-2xl px-5 py-4 text-left transition-all duration-150 active:scale-[0.98] shadow-sm"
                  style={{ border: d.status === 'complete' ? `1px solid ${IC.gold}60` : '1px solid #E5DDD0' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-base" style={{ color: IC.green }}>{d.name}</p>
                        {d.status === 'complete' && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${IC.gold}20`, color: IC.gold }}>All Found ✓</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: IC.textMuted }}>{d.store} · {d.addr}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-2xl font-black leading-none" style={{ color: checked === total && total > 0 ? IC.gold : IC.green }}>{checked}</span>
                      <span className="text-sm font-bold" style={{ color: IC.textMuted }}>/{total}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E5DDD0' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: checked === total && total > 0 ? IC.gold : IC.green }}
                    />
                  </div>
                  {d.note && (
                    <p className="mt-2 text-xs font-medium rounded-xl px-3 py-1.5" style={{ backgroundColor: `${IC.gold}15`, color: IC.greenMid }}>
                      <span className="font-black">Note: </span>{d.note}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Dispatch detail ───────────────────────────────────────────────────────────

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

function DispatchDetailScreen({
  dispatch, onToggle, onConfirmQty, onBack, onCheckout,
}: {
  dispatch: LiveDispatch
  onToggle: (itemId: string, checked: boolean) => void
  onConfirmQty: (itemId: string, qty: number) => void
  onBack: () => void
  onCheckout: () => void
}) {
  const [qtyItem, setQtyItem] = useState<SharedItem | null>(null)
  const [qtyValue, setQtyValue] = useState(1)
  const [detailItem, setDetailItem] = useState<SharedItem | null>(null)
  const [showDoneModal, setShowDoneModal] = useState(false)

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
                <span className="text-[10px] font-black uppercase tracking-widest">All Dispatches</span>
              </button>
              <h1 className="font-black text-xl text-white uppercase tracking-wider leading-tight">{dispatch.name}</h1>
              <p className="text-xs truncate mt-0.5" style={{ color: IC.gold }}>{dispatch.store}</p>
              <p className="text-xs truncate opacity-60 text-white">{dispatch.addr}</p>
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
            {allDone && <p className="text-xs font-black" style={{ color: IC.gold }}>Mission complete ✓</p>}
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
              >Checkout & Save to History →</button>
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

// ── Main shop component ───────────────────────────────────────────────────────

type Screen = 'loading' | 'dispatches' | 'detail' | 'noaccess'

function ShopContent() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('loading')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberName, setMemberName] = useState<string | null>(null)
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([])
  const [dispatches, setDispatches] = useState<LiveDispatch[]>([])
  const [activeDispatch, setActiveDispatch] = useState<LiveDispatch | null>(null)

  useEffect(() => {
    const fid = localStorage.getItem(FAMILY_ID_KEY)
    const mid = localStorage.getItem(MEMBER_ID_KEY)
    const mname = localStorage.getItem(MEMBER_NAME_KEY)
    const mroles = localStorage.getItem(MEMBER_ROLES_KEY)
    if (mid && mname && mroles) {
      try {
        const roles = JSON.parse(mroles) as MemberRole[]
        if (!roles.includes('shopper')) {
          setScreen('noaccess')
          return
        }
        setFamilyId(fid)
        setMemberId(mid)
        setMemberName(mname)
        setMemberRoles(roles)
        setScreen('dispatches')
      } catch {
        setScreen('noaccess')
      }
    } else {
      setScreen('noaccess')
    }
  }, [])

  useEffect(() => {
    if (!memberId) return
    const q = query(
      collection(db, 'dispatches'),
      where('shopperId', '==', memberId)
    )
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => d.data() as LiveDispatch)
        .filter(d => d.status !== 'archived')
        .sort((a, b) => b.createdAt - a.createdAt)
      setDispatches(docs)
      setActiveDispatch(prev => prev ? (docs.find(d => d.id === prev.id) ?? prev) : prev)
    })
    return unsub
  }, [memberId])

  const handleCheckout = async () => {
    if (!activeDispatch) return
    const ref = doc(db, 'dispatches', activeDispatch.id)
    await updateDoc(ref, { status: 'archived' })
    if (familyId) {
      await setDoc(doc(db, 'families', familyId, 'orderHistory', activeDispatch.id), {
        id: activeDispatch.id,
        name: activeDispatch.name,
        store: activeDispatch.store,
        addr: activeDispatch.addr,
        items: activeDispatch.items,
        shopperId: activeDispatch.shopperId,
        shopperName: activeDispatch.shopperName,
        completedAt: Date.now(),
        totalItems: activeDispatch.items.reduce((n, i) => n + i.qty, 0),
      })
    }
    setActiveDispatch(null)
    setScreen('dispatches')
  }

  const switchToOrders = () => {
    if (memberRoles.includes('order') || memberRoles.includes('admin')) {
      router.push('/')
    } else {
      // Logout
      localStorage.removeItem(FAMILY_ID_KEY)
      localStorage.removeItem(MEMBER_ID_KEY)
      localStorage.removeItem(MEMBER_NAME_KEY)
      localStorage.removeItem(MEMBER_ROLES_KEY)
      router.push('/')
    }
  }

  const toggleItem = async (itemId: string, checked: boolean) => {
    if (!activeDispatch) return
    const ref = doc(db, 'dispatches', activeDispatch.id)
    const newChecked = checked
      ? [...activeDispatch.checkedItems, itemId]
      : activeDispatch.checkedItems.filter(id => id !== itemId)
    const allTotal = activeDispatch.items.length
    await updateDoc(ref, {
      checkedItems: newChecked,
      status: newChecked.length >= allTotal ? 'complete' : newChecked.length > 0 ? 'shopping' : 'pending',
    })
  }

  const confirmQty = async (itemId: string, qty: number) => {
    if (!activeDispatch) return
    await updateDoc(doc(db, 'dispatches', activeDispatch.id), { [`confirmedQtys.${itemId}`]: qty })
  }

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: IC.green }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (screen === 'noaccess') {
    return <NoAccessScreen onGoHome={() => router.push('/')} />
  }

  if (screen === 'dispatches') {
    return (
      <DispatchListScreen
        shopperName={memberName!}
        dispatches={dispatches}
        hasOrderRole={memberRoles.includes('order') || memberRoles.includes('admin')}
        onOpen={d => { setActiveDispatch(d); setScreen('detail') }}
        onSwitchToOrders={switchToOrders}
      />
    )
  }

  if (screen === 'detail' && activeDispatch) {
    return (
      <DispatchDetailScreen
        dispatch={activeDispatch}
        onToggle={toggleItem}
        onConfirmQty={confirmQty}
        onBack={() => setScreen('dispatches')}
        onCheckout={handleCheckout}
      />
    )
  }

  return null
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: IC.green }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
      </div>
    }>
      <ShopContent />
    </Suspense>
  )
}
