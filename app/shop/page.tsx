'use client'

import { Suspense } from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, onSnapshot, query, where, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DispatchDetailScreen } from '@/app/components/DispatchDetailScreen'
import type { LiveDispatch, MemberRole, StoreType } from '@/lib/types'

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
                        <StoreTag store={d.storeType ?? 'kroger'} />
                        {d.status === 'complete' && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${IC.gold}20`, color: IC.gold }}>All Found ✓</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: IC.textMuted }}>{d.addr ? `${d.store} · ${d.addr}` : d.store}</p>
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

// ── Main shop component ───────────────────────────────────────────────────────

type Screen = 'loading' | 'dispatches' | 'detail' | 'noaccess'

function ShopContent() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('loading')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberName, setMemberName] = useState<string | null>(null)
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([])
  const [dispatches, setDispatches] = useState<LiveDispatch[]>([])
  const [activeDispatch, setActiveDispatch] = useState<LiveDispatch | null>(null)

  useEffect(() => {
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

  // Shopping being "done" no longer archives the dispatch or writes history
  // directly — it just marks it complete (even if not everything was found)
  // so it shows up as "available for review" on the orderer's side. The
  // orderer's Review & Put Away step is what reconciles pantry stock and
  // archives it, since that's the point where quantities/found-vs-skipped
  // get finalized.
  const handleCheckout = async () => {
    if (!activeDispatch) return
    await updateDoc(doc(db, 'dispatches', activeDispatch.id), { status: 'complete' })
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
