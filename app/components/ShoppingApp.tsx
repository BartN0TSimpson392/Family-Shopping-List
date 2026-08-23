'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, setDoc, updateDoc, onSnapshot, getDoc, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DispatchDetailScreen } from './DispatchDetailScreen'
import { subscribeInventory, updateInventoryStatus, deleteInventoryItem, putAwayItem, createInventoryItem, lookupBarcode } from '@/lib/inventory'
import type { OpenFoodFactsLookup } from '@/lib/inventory'
import type { KrogerLocation, KrogerProduct, CostcoProduct, Product, StoreType, CartItem, CartReplacement, HistoryItem, SharedItem, Dispatch, Shopper, LiveDispatch, FamilyMember, MemberRole, InventoryItem, InventoryStatus, InventoryStore } from '@/lib/types'

const HISTORY_KEY = 'ic-purchase-history'
const FAVORITES_KEY = 'ic-favorites'
const STORE_KEY = 'ic-store'
const STORE_TYPE_KEY = 'ic-store-type'
const DISPATCHES_KEY = 'ic-dispatches'
const FAMILY_ID_KEY = 'ic-family-id'
const MEMBER_ID_KEY = 'ic-member-id'
const MEMBER_NAME_KEY = 'ic-member-name'
const MEMBER_ROLES_KEY = 'ic-member-roles'

const STORE_LABEL: Record<StoreType, string> = { kroger: 'Kroger', costco: 'Costco' }

function loadHistory(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryItem[]
    return raw.map(h => ({ ...h, store: h.store ?? 'kroger' }))
  } catch { return [] }
}
function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}
function loadFavorites(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as HistoryItem[]
    return raw.map(h => ({ ...h, store: h.store ?? 'kroger' }))
  } catch { return [] }
}
function saveFavorites(items: HistoryItem[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}
function loadStore(): KrogerLocation | null {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') } catch { return null }
}
function saveStore(s: KrogerLocation | null) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
function loadStoreType(): StoreType {
  try {
    const raw = localStorage.getItem(STORE_TYPE_KEY)
    return raw === 'costco' ? 'costco' : 'kroger'
  } catch { return 'kroger' }
}
function saveStoreType(t: StoreType) {
  try { localStorage.setItem(STORE_TYPE_KEY, t) } catch { /* ignore */ }
}
function loadDispatches(): Dispatch[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DISPATCHES_KEY) ?? 'null') as Dispatch[] | null
    return raw ? raw.map(d => ({ ...d, store: d.store ?? 'kroger' })) : null
  } catch { return null }
}
function saveDispatches(d: Dispatch[]) {
  try { localStorage.setItem(DISPATCHES_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

// Exactly one active (unsent) cart per store — already-sent dispatches
// (order history) are untouched and can be any number.
function ensureDraftDispatch(list: Dispatch[], storeType: StoreType): { list: Dispatch[]; id: string } {
  const existing = list.find(d => d.store === storeType && !d.firestoreId)
  if (existing) return { list, id: existing.id }
  const fresh: Dispatch = {
    id: `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${STORE_LABEL[storeType]} Cart`,
    store: storeType,
    cart: [],
    note: '',
  }
  return { list: [...list, fresh], id: fresh.id }
}

// One-time migration for anyone with leftover draft carts from before carts
// were simplified to exactly one per store — merges their items (summing
// quantities for the same product) into a single draft instead of silently
// dropping any of them.
function collapseDraftsToOne(list: Dispatch[]): Dispatch[] {
  const sent = list.filter(d => d.firestoreId)
  const drafts = list.filter(d => !d.firestoreId)
  const byStore = new Map<StoreType, Dispatch[]>()
  for (const d of drafts) {
    if (!byStore.has(d.store)) byStore.set(d.store, [])
    byStore.get(d.store)!.push(d)
  }
  const merged: Dispatch[] = []
  for (const group of byStore.values()) {
    const [first, ...rest] = group
    let cart = first.cart
    for (const extra of rest) {
      for (const item of extra.cart) {
        const existing = cart.find(i => i.product.id === item.product.id)
        cart = existing
          ? cart.map(i => i.product.id === item.product.id ? { ...i, quantity: Math.min(i.quantity + item.quantity, 20) } : i)
          : [...cart, item]
      }
    }
    merged.push({ ...first, cart })
  }
  return [...sent, ...merged]
}

// Adds a product to a cart, or — if it's already there — just refreshes its
// restockStatus tag rather than creating a duplicate line item.
function upsertCartItem(cart: CartItem[], product: Product, restockStatus?: 'running_low' | 'out_of_stock'): CartItem[] {
  const existing = cart.find(i => i.product.id === product.id)
  if (existing) {
    return cart.map(i => i.product.id === product.id ? { ...i, ...(restockStatus ? { restockStatus } : {}) } : i)
  }
  return [...cart, { product, quantity: 1, note: '', ...(restockStatus ? { restockStatus } : {}) }]
}

// ── Product normalization ────────────────────────────────────────────────────
// Both stores' raw API shapes get flattened into `Product` right away so the
// rest of the app (cart, search grid, dispatch review) never branches on store.

function getKrogerImage(product: KrogerProduct, size: string): string {
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

function krogerToProduct(p: KrogerProduct): Product {
  return {
    id: p.productId,
    store: 'kroger',
    name: p.description,
    brand: p.brand || '',
    image: getKrogerImage(p, 'thumbnail') || getKrogerImage(p, 'small'),
    price: p.items?.[0]?.price?.regular ?? 0,
    size: p.items?.[0]?.size ?? '',
    aisle: p.aisleLocations?.[0]?.description,
    aisleNum: p.aisleLocations?.[0]?.number,
    seq: parseInt(p.aisleLocations?.[0]?.sequenceNumber || '0', 10),
  }
}

function costcoToProduct(p: CostcoProduct): Product {
  return {
    id: p.id,
    store: 'costco',
    name: p.title,
    brand: p.brand,
    image: p.image,
    price: p.price,
    size: p.size,
    inStock: p.inStock,
  }
}

function historyItemToProduct(h: HistoryItem): Product {
  return {
    id: h.productId,
    store: h.store,
    name: h.description,
    brand: h.brand,
    image: h.img,
    price: h.price,
    size: h.size,
  }
}

function addToHistory(product: Product, current: HistoryItem[]): HistoryItem[] {
  const entry: HistoryItem = {
    productId: product.id,
    description: product.name,
    brand: product.brand || '',
    img: product.image,
    size: product.size,
    price: product.price,
    store: product.store,
  }
  return [entry, ...current.filter(h => !(h.productId === product.id && h.store === product.store))].slice(0, 30)
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
  kroger: '#2A6CB0',
  costco: '#C0272D',
} as const

const STORE_ACCENT: Record<StoreType, string> = { kroger: IC.kroger, costco: IC.costco }

// ── Pantry status tokens ─────────────────────────────────────────────────────
const STATUS_CONFIG: Record<InventoryStatus, { emoji: string; label: string; color: string }> = {
  in_stock: { emoji: '🟢', label: 'In Stock', color: '#22A559' },
  running_low: { emoji: '🟡', label: 'Running Low', color: '#D4A017' },
  out_of_stock: { emoji: '🔴', label: 'Out of Stock', color: '#D9483A' },
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ── StoreTag / StoreTypeTabs ─────────────────────────────────────────────────

function StoreTag({ store, className = '' }: { store: StoreType; className?: string }) {
  const color = STORE_ACCENT[store]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: `${color}18`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {STORE_LABEL[store]}
    </span>
  )
}

function StoreTypeTabs({ active, onChange }: { active: StoreType; onChange: (t: StoreType) => void }) {
  const types: StoreType[] = ['kroger', 'costco']
  return (
    <div className="flex gap-1 p-1 rounded-2xl" style={{ backgroundColor: IC.cream, border: '1px solid #E5DDD0' }}>
      {types.map(t => {
        const isActive = active === t
        const color = STORE_ACCENT[t]
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: isActive ? 'white' : 'transparent',
              color: isActive ? color : IC.textMuted,
              boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {STORE_LABEL[t]}
          </button>
        )
      })}
    </div>
  )
}

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

// ── FamilyGateScreen ──────────────────────────────────────────────────────────

function FamilyGateScreen({ onJoin, onCreate }: { onJoin: () => void; onCreate: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ backgroundColor: IC.green }}>
      <RadarLogoWhite className="w-24 h-24 mb-6" />
      <h1 className="text-3xl font-black uppercase tracking-widest text-white mb-1">Inner Circle</h1>
      <p className="text-sm font-bold tracking-widest uppercase mb-12" style={{ color: IC.gold }}>Private Family Dispatch</p>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onJoin}
          className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] shadow-lg"
          style={{ backgroundColor: IC.gold, color: IC.green }}
        >
          Join Your Family →
        </button>
        <button
          onClick={onCreate}
          className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97]"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          Create a New Family
        </button>
      </div>
    </div>
  )
}

// ── JoinFamilyScreen ──────────────────────────────────────────────────────────

function JoinFamilyScreen({ onBack, onFound }: {
  onBack: () => void
  onFound: (familyId: string, members: FamilyMember[]) => void
}) {
  const [familyIdInput, setFamilyIdInput] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async () => {
    const fid = familyIdInput.trim().toLowerCase()
    if (!fid || !password) return
    setLoading(true)
    setError('')
    try {
      const snap = await getDoc(doc(db, 'families', fid))
      if (!snap.exists()) { setError('Family not found. Check the ID and try again.'); return }
      const data = snap.data() as { password: string }
      if (data.password !== password) { setError('Wrong password. Try again.'); return }
      const membersSnap = await getDocs(collection(db, 'families', fid, 'members'))
      const members = membersSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as FamilyMember))
        .sort((a, b) => a.name.localeCompare(b.name))
      onFound(fid, members)
    } catch {
      setError('Could not connect. Check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: IC.cream }}>
      <div className="px-6 pt-14 pb-10 max-w-sm mx-auto w-full">
        <button onClick={onBack} className="flex items-center gap-1 mb-8 active:opacity-70" style={{ color: IC.gold }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-black uppercase tracking-widest">Back</span>
        </button>
        <h2 className="text-2xl font-black uppercase tracking-widest mb-1" style={{ color: IC.green }}>Join Your Family</h2>
        <p className="text-sm mb-8" style={{ color: IC.textMuted }}>Enter your family ID and password.</p>
        <div className="space-y-3">
          <input
            type="text"
            value={familyIdInput}
            onChange={e => setFamilyIdInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="Family ID (e.g. wardzinskis)"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white font-mono"
            style={{ border: '2px solid #E5DDD0', color: IC.green }}
            onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Family password"
            className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white"
            style={{ border: '2px solid #E5DDD0', color: IC.green }}
            onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          {error && <p className="text-sm font-medium" style={{ color: '#e53935' }}>{error}</p>}
          <button
            onClick={handleJoin}
            disabled={!familyIdInput.trim() || !password || loading}
            className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {loading
              ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Join Family →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CreateFamilyScreen ────────────────────────────────────────────────────────

function CreateFamilyScreen({ onBack, onCreated }: {
  onBack: () => void
  onCreated: (familyId: string, member: FamilyMember) => void
}) {
  const [familyName, setFamilyName] = useState('')
  const [familyId, setFamilyId] = useState('')
  const [password, setPassword] = useState('')
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)

  const handleCreate = async () => {
    const fid = familyId.trim()
    if (!fid || !familyName.trim() || !password || !adminName.trim()) return
    if (fid.length < 3) { setError('Family ID must be at least 3 characters.'); return }
    setLoading(true)
    setError('')
    try {
      const existing = await getDoc(doc(db, 'families', fid))
      if (existing.exists()) { setError('That Family ID is already taken. Try another.'); return }
      await setDoc(doc(db, 'families', fid), { id: fid, name: familyName.trim(), password, createdAt: Date.now() })
      const mid = `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const member: FamilyMember = { id: mid, name: adminName.trim(), roles: ['admin', 'order'], createdAt: Date.now() }
      await setDoc(doc(db, 'families', fid, 'members', mid), member)
      onCreated(fid, member)
    } catch {
      setError('Could not create family. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: IC.cream }}>
      <div className="px-6 pt-14 pb-10 max-w-sm mx-auto w-full">
        <button onClick={onBack} className="flex items-center gap-1 mb-8 active:opacity-70" style={{ color: IC.gold }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-black uppercase tracking-widest">Back</span>
        </button>
        <h2 className="text-2xl font-black uppercase tracking-widest mb-1" style={{ color: IC.green }}>Create Your Family</h2>
        <p className="text-sm mb-8" style={{ color: IC.textMuted }}>
          You'll be the admin. Share the Family ID and password so members can join.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Family Name</label>
            <input
              type="text"
              value={familyName}
              onChange={e => { setFamilyName(e.target.value); setFamilyId(sanitize(e.target.value)) }}
              placeholder="e.g. The Wardzinskis"
              className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white"
              style={{ border: '2px solid #E5DDD0', color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>
              Family ID <span className="normal-case font-normal">(share this so members can join)</span>
            </label>
            <input
              type="text"
              value={familyId}
              onChange={e => setFamilyId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20))}
              placeholder="e.g. wardzinskis"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white font-mono"
              style={{ border: '2px solid #E5DDD0', color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Password</label>
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="e.g. 123"
              className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white"
              style={{ border: '2px solid #E5DDD0', color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Your Name</label>
            <input
              type="text"
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl px-4 py-3.5 text-base focus:outline-none bg-white"
              style={{ border: '2px solid #E5DDD0', color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          {error && <p className="text-sm font-medium" style={{ color: '#e53935' }}>{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!familyName.trim() || familyId.length < 3 || !password || !adminName.trim() || loading}
            className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {loading
              ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Create Family →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SelectMemberScreen ────────────────────────────────────────────────────────

function SelectMemberScreen({ members, onSelect, onBack }: {
  members: FamilyMember[]
  onSelect: (m: FamilyMember) => void
  onBack: () => void
}) {
  const roleLabel: Record<MemberRole, string> = { order: 'Order', shopper: 'Shop', admin: 'Admin' }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ backgroundColor: IC.green }}>
      <RadarLogoWhite className="w-20 h-20 mb-6 opacity-80" />
      <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-1">Inner Circle</h1>
      <p className="text-sm font-bold tracking-widest uppercase mb-10" style={{ color: IC.gold }}>Who are you?</p>

      {members.length === 0 ? (
        <p className="text-white opacity-60 text-sm">No members yet — the admin needs to add members first.</p>
      ) : (
        <div className="w-full max-w-sm space-y-3">
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(m)}
              className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all duration-150 active:scale-[0.98]"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black flex-shrink-0"
                style={{ backgroundColor: IC.gold, color: IC.green }}>
                {m.name[0].toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">{m.name}</p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {m.roles.map(r => (
                    <span key={r} className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${IC.gold}30`, color: IC.gold }}>
                      {roleLabel[r]}
                    </span>
                  ))}
                </div>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}

      <button onClick={onBack} className="mt-10 text-sm font-bold active:opacity-70" style={{ color: IC.gold }}>
        ← Back
      </button>
    </div>
  )
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

function AdminPanel({ familyId, members, currentMemberId, onClose }: {
  familyId: string
  members: FamilyMember[]
  currentMemberId: string
  onClose: () => void
}) {
  const [addName, setAddName] = useState('')
  const [addRoles, setAddRoles] = useState<MemberRole[]>(['shopper'])
  const [addSaving, setAddSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const allRoles: { role: MemberRole; label: string }[] = [
    { role: 'order', label: 'Order' },
    { role: 'shopper', label: 'Shop' },
    { role: 'admin', label: 'Admin' },
  ]

  const toggleAddRole = (role: MemberRole) =>
    setAddRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])

  const handleAddMember = async () => {
    if (!addName.trim() || addRoles.length === 0 || addSaving) return
    setAddSaving(true)
    try {
      const mid = `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const member: FamilyMember = { id: mid, name: addName.trim(), roles: addRoles, createdAt: Date.now() }
      await setDoc(doc(db, 'families', familyId, 'members', mid), member)
      setAddName('')
      setAddRoles(['shopper'])
    } finally {
      setAddSaving(false)
    }
  }

  const toggleMemberRole = async (member: FamilyMember, role: MemberRole) => {
    const newRoles = member.roles.includes(role)
      ? member.roles.filter(r => r !== role)
      : [...member.roles, role]
    if (newRoles.length === 0) return
    await updateDoc(doc(db, 'families', familyId, 'members', member.id), { roles: newRoles })
  }

  const removeMember = async (member: FamilyMember) => {
    if (member.id === currentMemberId) return
    await deleteDoc(doc(db, 'families', familyId, 'members', member.id))
    setExpandedId(null)
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <div>
            <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>Family Members</h3>
            <p className="text-xs font-medium" style={{ color: IC.textMuted }}>Manage roles and access</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
            style={{ backgroundColor: IC.cream }}>
            <svg className="w-4 h-4" fill="none" stroke={IC.green} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-2">
            {members.map(m => (
              <div key={m.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5DDD0' }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{ backgroundColor: m.id === currentMemberId ? IC.gold : IC.green }}>
                    {m.name[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: IC.green }}>
                      {m.name}
                      {m.id === currentMemberId && (
                        <span className="text-[9px] font-black uppercase ml-1.5" style={{ color: IC.gold }}>YOU</span>
                      )}
                    </p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {m.roles.map(r => (
                        <span key={r} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${IC.green}15`, color: IC.green }}>{r}</span>
                      ))}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${expandedId === m.id ? 'rotate-180' : ''}`}
                    fill="none" stroke={IC.textMuted} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedId === m.id && (
                  <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid #F5F0E8' }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-2" style={{ color: IC.textMuted }}>Roles</p>
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {allRoles.map(({ role, label }) => (
                        <button
                          key={role}
                          onClick={() => toggleMemberRole(m, role)}
                          className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-150 active:scale-95"
                          style={{
                            backgroundColor: m.roles.includes(role) ? IC.green : '#E5DDD0',
                            color: m.roles.includes(role) ? 'white' : IC.textMuted,
                          }}
                        >{label}</button>
                      ))}
                    </div>
                    {m.id !== currentMemberId && (
                      <button onClick={() => removeMember(m)}
                        className="text-xs font-bold active:scale-95 transition-all duration-100" style={{ color: '#e53935' }}>
                        Remove member
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-5 pb-6 pt-2" style={{ borderTop: '1px solid #E5DDD0' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: IC.textMuted }}>Add Member</p>
            <div className="space-y-2">
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Member's name…"
                className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none bg-white"
                style={{ border: '2px solid #E5DDD0', color: IC.green }}
                onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
              />
              <div className="flex gap-2 flex-wrap">
                {allRoles.map(({ role, label }) => (
                  <button
                    key={role}
                    onClick={() => toggleAddRole(role)}
                    className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-150 active:scale-95"
                    style={{
                      backgroundColor: addRoles.includes(role) ? IC.green : '#E5DDD0',
                      color: addRoles.includes(role) ? 'white' : IC.textMuted,
                    }}
                  >{label}</button>
                ))}
              </div>
              <button
                onClick={handleAddMember}
                disabled={!addName.trim() || addRoles.length === 0 || addSaving}
                className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
                style={{ backgroundColor: IC.green }}
              >
                {addSaving ? 'Adding…' : '+ Add Member'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── HomeScreen ────────────────────────────────────────────────────────────────

function HomeScreen({
  krogerLocation, activeStoreType, dispatches, activeDispatchId, shoppers, liveProgress,
  memberName, memberRoles, isAdmin,
  onChangeStoreType, onChangeStore, onOpenDispatch, onDeleteDispatch, onManageFamily, onLogout, onOpenPantry, onPutAway,
}: {
  krogerLocation: KrogerLocation | null
  activeStoreType: StoreType
  dispatches: Dispatch[]
  activeDispatchId: string
  shoppers: Shopper[]
  liveProgress: Record<string, { checked: number; total: number; checkedItems: string[]; status: LiveDispatch['status'] }>
  memberName: string
  memberRoles: MemberRole[]
  isAdmin: boolean
  onChangeStoreType: (t: StoreType) => void
  onChangeStore: () => void
  onOpenDispatch: (id: string) => void
  onDeleteDispatch: (id: string) => void
  onManageFamily: () => void
  onLogout: () => void
  onOpenPantry: () => void
  onPutAway: (id: string) => void
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const storeDispatches = dispatches.filter(d => d.store === activeStoreType)
  const activeCart = storeDispatches.find(d => d.id === activeDispatchId) ?? storeDispatches.find(d => !d.firestoreId)
  const orderHistory = storeDispatches.filter(d => d.firestoreId)
  const accent = STORE_ACCENT[activeStoreType]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: IC.cream }}>
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <RadarLogoWhite className="w-7 h-7" />
            <div>
              <span className="font-black text-white tracking-[0.12em] uppercase text-base leading-none block">Inner Circle</span>
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase leading-none block" style={{ color: IC.gold }}>Private Dispatch</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenPantry}
              className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              aria-label="Family Pantry"
              title="Family Pantry"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </button>
            {isAdmin && (
              <button
                onClick={onManageFamily}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                aria-label="Manage family"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 active:scale-95 transition-all duration-100"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                style={{ backgroundColor: IC.gold, color: IC.green }}>
                {memberName[0].toUpperCase()}
              </span>
              <span className="text-xs font-bold text-white">{memberName}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
        {/* Store picker */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: IC.textMuted }}>Shopping For</p>
          <StoreTypeTabs active={activeStoreType} onChange={onChangeStoreType} />
        </div>

        {/* Store card */}
        {activeStoreType === 'kroger' ? (
          krogerLocation && (
            <div className="bg-white rounded-2xl px-5 py-4 shadow-sm" style={{ border: `1px solid #E5DDD0`, borderLeft: `3px solid ${accent}` }}>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: IC.textMuted }}>Your Kroger Store</p>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-base" style={{ color: IC.green }}>{krogerLocation.name}</p>
                  <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>
                    {krogerLocation.address.addressLine1}, {krogerLocation.address.city}, {krogerLocation.address.state}
                  </p>
                </div>
                <button
                  onClick={onChangeStore}
                  className="text-xs font-bold flex-shrink-0 active:scale-95 transition-all duration-100"
                  style={{ color: IC.gold }}
                >Change Store</button>
              </div>
            </div>
          )
        ) : (
          <div className="bg-white rounded-2xl px-5 py-4 shadow-sm" style={{ border: `1px solid #E5DDD0`, borderLeft: `3px solid ${accent}` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: IC.textMuted }}>Costco</p>
            <p className="font-bold text-base" style={{ color: IC.green }}>Searching nationwide</p>
            <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>No warehouse selection needed — results come straight from Costco.com.</p>
          </div>
        )}

        {/* Shoppers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: IC.textMuted }}>Shoppers</p>
            {isAdmin && (
              <button
                onClick={onManageFamily}
                className="text-xs font-bold active:scale-95 transition-all duration-100"
                style={{ color: IC.gold }}
              >Manage</button>
            )}
          </div>
          {shoppers.length === 0 ? (
            <div
              className="w-full rounded-2xl px-5 py-4 text-center"
              style={{ border: `1.5px dashed ${IC.gold}40` }}
            >
              <p className="text-sm font-medium" style={{ color: IC.textMuted }}>
                {isAdmin ? 'Add shoppers via Manage →' : 'No shoppers set up yet.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shoppers.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
                  style={{ backgroundColor: `${IC.green}15`, color: IC.green }}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ backgroundColor: IC.green }}>
                    {s.name[0].toUpperCase()}
                  </span>
                  {s.name}
                </div>
              ))}
              {isAdmin && (
                <button
                  onClick={onManageFamily}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-95"
                  style={{ border: `1.5px dashed ${IC.gold}`, color: IC.gold }}
                >+ Add</button>
              )}
            </div>
          )}
        </div>

        {/* Active cart — exactly one per store, always */}
        {activeCart && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: IC.textMuted }}>Your {STORE_LABEL[activeStoreType]} Cart</p>
            {(() => {
              const itemCount = activeCart.cart.reduce((n, i) => n + i.quantity, 0)
              const total = activeCart.cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
              return (
                <button
                  onClick={() => onOpenDispatch(activeCart.id)}
                  className="w-full bg-white rounded-2xl px-5 py-4 flex items-center justify-between text-left transition-all duration-150 shadow-sm active:scale-[0.98]"
                  style={{ border: `2px solid ${IC.gold}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-base" style={{ color: IC.green }}>{activeCart.name}</p>
                      <StoreTag store={activeCart.store} />
                    </div>
                    <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>
                      {itemCount === 0
                        ? 'Empty — tap to start adding items'
                        : `${itemCount} item${itemCount !== 1 ? 's' : ''}${total > 0 ? ` · $${total.toFixed(2)} est.` : ''}`}
                    </p>
                  </div>
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )
            })()}
          </div>
        )}

        {/* Order history — past/in-flight dispatches already sent to a shopper */}
        {orderHistory.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: IC.textMuted }}>{STORE_LABEL[activeStoreType]} Order History</p>
            <div className="space-y-2">
              {orderHistory.map(d => {
                const progress = liveProgress[d.id]
                const isDelivered = progress?.status === 'complete' || progress?.status === 'archived'
                const needsReview = isDelivered && !d.putAwayAt
                return (
                  <div
                    key={d.id}
                    className="w-full rounded-2xl px-5 py-4 shadow-sm"
                    style={needsReview
                      ? { backgroundColor: `${IC.gold}10`, border: `2px solid ${IC.gold}` }
                      : { backgroundColor: 'white', border: '1px solid #E5DDD0' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-base" style={{ color: IC.green }}>{d.name}</p>
                          {d.shopperName && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${IC.gold}20`, color: IC.gold }}>
                              → {d.shopperName}
                            </span>
                          )}
                        </div>
                        {needsReview ? (
                          <>
                            <p className="text-xs font-bold mt-1.5" style={{ color: IC.gold }}>
                              ✓ Completed Dispatch available for review — {STORE_LABEL[d.store]}
                            </p>
                            <button
                              onClick={() => onPutAway(d.id)}
                              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-white transition-all duration-150 active:scale-95"
                              style={{ backgroundColor: IC.green }}
                            >
                              📦 Review & Put Away →
                            </button>
                          </>
                        ) : isDelivered && d.putAwayAt ? (
                          <p className="text-xs font-bold mt-1.5" style={{ color: IC.textMuted }}>✓ Put away {timeAgo(new Date(d.putAwayAt).toISOString())}</p>
                        ) : progress ? (
                          <div className="mt-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E5DDD0' }}>
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%`, backgroundColor: IC.gold }}
                                />
                              </div>
                              <span className="text-xs font-bold flex-shrink-0" style={{ color: IC.textMuted }}>
                                {progress.checked}/{progress.total}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>Sent — waiting on your shopper</p>
                        )}
                      </div>
                      {pendingDeleteId === d.id ? (
                        <button
                          onClick={() => { onDeleteDispatch(d.id); setPendingDeleteId(null) }}
                          className="text-xs font-black px-2.5 py-1 rounded-xl active:scale-95 transition-all duration-100 flex-shrink-0"
                          style={{ backgroundColor: '#FEE2E2', color: '#EF4444' }}
                        >Delete?</button>
                      ) : (
                        <button
                          onClick={() => setPendingDeleteId(d.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100 flex-shrink-0"
                          style={{ backgroundColor: IC.cream }}
                          aria-label="Remove from history"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="#9B8470" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => onOpenDispatch(activeDispatchId)}
          className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] shadow-md"
          style={{ backgroundColor: IC.green }}
        >
          Start Shopping →
        </button>
      </div>
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
  product: Product
  cartItem: CartItem | undefined
  isFavorite: boolean
  onAdd: (p: Product) => void
  onUpdateQty: (id: string, qty: number) => void
  onToggleFavorite: (p: Product) => void
}) {
  const [justAdded, setJustAdded] = useState(false)
  const outOfStock = product.inStock === false

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
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" className={`h-28 w-28 object-contain mix-blend-multiply${outOfStock ? ' opacity-40 grayscale' : ''}`} />
        ) : (
          <div className="w-20 h-20 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E5DDD0' }}>
            <svg className="w-8 h-8" fill="none" stroke={IC.textMuted} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {outOfStock && (
          <span className="absolute bottom-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white" style={{ color: '#9B8470', border: '1px solid #E5DDD0' }}>
            Out of Stock
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 px-3 pt-2 pb-3 gap-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest truncate flex-1" style={{ color: IC.textMuted }}>{product.brand || ''}</p>
          <StoreTag store={product.store} />
        </div>
        <p className="text-sm font-semibold leading-tight line-clamp-2 flex-1" style={{ color: IC.green }}>{product.name}</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            {product.size && <p className="text-xs" style={{ color: IC.textMuted }}>{product.size}</p>}
            {product.price > 0 && <p className="text-sm font-black" style={{ color: IC.gold }}>${product.price.toFixed(2)}</p>}
          </div>

          {cartItem ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onUpdateQty(product.id, cartItem.quantity - 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-lg leading-none"
                style={{ backgroundColor: '#E5DDD0', color: IC.green }}
              >−</button>
              <span className="w-6 text-center text-sm font-black" style={{ color: IC.green }}>{cartItem.quantity}</span>
              <button
                onClick={() => onUpdateQty(product.id, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= 20}
                className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-lg leading-none disabled:opacity-40"
                style={{ backgroundColor: IC.green }}
              >+</button>
            </div>
          ) : (
            <button
              onClick={handleAdd}
              disabled={outOfStock}
              className="w-9 h-9 rounded-full text-white flex items-center justify-center transition-all duration-150 shadow-md active:scale-[0.82] disabled:opacity-40 disabled:active:scale-100"
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
  forItem, krogerLocation, history, onSelect, onClose,
}: {
  forItem: CartItem
  krogerLocation: KrogerLocation | null
  history: HistoryItem[]
  onSelect: (r: CartReplacement) => void
  onClose: () => void
}) {
  const storeType = forItem.product.store
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); return }
    setSearching(true)
    try {
      if (storeType === 'kroger') {
        if (!krogerLocation) { setResults([]); return }
        const res = await fetch(`/api/kroger/products?term=${encodeURIComponent(term)}&locationId=${krogerLocation.locationId}&start=0`)
        const data = await res.json()
        setResults(((data.products ?? []) as KrogerProduct[]).map(krogerToProduct))
      } else {
        const params = new URLSearchParams({ query: term, country: 'US' })
        const res = await fetch(`/api/costco/search?${params}`)
        const data = await res.json()
        setResults(((data.products ?? []) as CostcoProduct[]).map(costcoToProduct))
      }
    } catch { /* ignore */ } finally { setSearching(false) }
  }, [storeType, krogerLocation])

  useEffect(() => {
    const t = setTimeout(() => search(query), 500)
    return () => clearTimeout(t)
  }, [query, search])

  const pick = (product: Product) => {
    onSelect({
      productId: product.id,
      description: product.name,
      brand: product.brand || '',
      img: product.image,
      size: product.size,
      price: product.price,
      quantity: forItem.quantity,
      note: '',
    })
  }

  const filteredHistory = history.filter(h => h.store === storeType && h.productId !== forItem.product.id)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black uppercase tracking-wider text-sm" style={{ color: IC.green }}>Choose Substitute</h3>
              <StoreTag store={storeType} />
            </div>
            <p className="text-xs truncate max-w-[240px]" style={{ color: IC.textMuted }}>for {forItem.product.name}</p>
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
                  key={p.id}
                  onClick={() => pick(p)}
                  className="rounded-2xl p-2 text-left active:scale-95 transition-all duration-100"
                  style={{ backgroundColor: IC.cream, border: `1px solid #E5DDD0` }}
                >
                  {p.image && (
                    <img src={p.image} alt={p.name} className="w-14 h-14 object-contain mx-auto mb-1" />
                  )}
                  <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: IC.green }}>{p.name}</p>
                  <p className="text-xs" style={{ color: IC.textMuted }}>{p.size}</p>
                  {p.price > 0 && <p className="text-xs font-bold" style={{ color: IC.gold }}>${p.price.toFixed(2)}</p>}
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
  dispatch, onClearCart, canShopNow, onShopNow,
  onClose, onUpdateQty, onUpdateNote, onRemove, onSendDispatch,
  onAddReplacement, onRemoveReplacement, onSetNote, onSetTip, liveCheckedItems,
}: {
  dispatch: Dispatch
  onClearCart: () => void
  canShopNow: boolean
  onShopNow: () => void
  onClose: () => void
  onUpdateQty: (id: string, qty: number) => void
  onUpdateNote: (id: string, note: string) => void
  onRemove: (id: string) => void
  onSendDispatch: () => void
  onAddReplacement: (productId: string) => void
  onRemoveReplacement: (productId: string) => void
  onSetNote: (note: string) => void
  onSetTip: (tip: number) => void
  liveCheckedItems?: string[]
}) {
  const cartTotal = dispatch.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const autoTip = Math.min(20, dispatch.cart.reduce((n, i) => n + i.quantity, 0))
  const tip = dispatch.tip ?? autoTip

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed z-50 bottom-0 left-0 right-0 md:right-0 md:top-0 md:left-auto md:bottom-0 md:w-96 bg-white shadow-2xl flex flex-col rounded-t-3xl md:rounded-none max-h-[90vh] md:max-h-none" style={{ borderTop: `3px solid ${STORE_ACCENT[dispatch.store]}` }}>
        <div className="md:hidden flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid #E5DDD0` }}>
          <div className="flex-1 min-w-0 mr-2">
            <div className="flex items-center gap-2 mb-0.5">
              <StoreTag store={dispatch.store} />
            </div>
            <p className="text-xl font-black uppercase tracking-wider" style={{ color: IC.green }}>{dispatch.name}</p>
            {dispatch.cart.length > 0 && (
              <p className="text-sm font-medium mt-0.5" style={{ color: IC.textMuted }}>{dispatch.cart.reduce((n, i) => n + i.quantity, 0)} items</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {dispatch.cart.length > 0 && (
              <button
                onClick={onClearCart}
                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
                style={{ backgroundColor: '#FEE2E2' }}
                aria-label="Clear cart"
                title="Clear cart"
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
            const isCollected = liveCheckedItems?.includes(item.product.id)
            return (
              <div key={item.product.id} className="rounded-2xl p-3" style={{ backgroundColor: isCollected ? `${IC.green}08` : IC.cream, border: isCollected ? `1px solid ${IC.green}30` : '1px solid #E5DDD0' }}>
                <div className="flex gap-3">
                  {item.product.image && (
                    <img src={item.product.image} alt={item.product.name} loading="lazy" className={`w-14 h-14 object-contain flex-shrink-0${isCollected ? ' opacity-50' : ''}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <p className={`text-sm font-bold leading-tight${isCollected ? ' line-through opacity-60' : ''}`} style={{ color: IC.green }}>{item.product.name}</p>
                      {isCollected && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${IC.green}20`, color: IC.green }}>✓ Collected</span>
                      )}
                    </div>
                    {item.product.price > 0 && (
                      <p className="text-xs font-black mt-0.5" style={{ color: IC.gold }}>${(item.product.price * item.quantity).toFixed(2)}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none"
                        style={{ border: `1px solid #E5DDD0`, color: IC.green }}
                      >−</button>
                      <span className="w-6 text-center text-sm font-black" style={{ color: IC.green }}>{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                        disabled={item.quantity >= 20}
                        className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none disabled:opacity-40"
                        style={{ backgroundColor: IC.green }}
                      >+</button>
                      <button
                        onClick={() => onRemove(item.product.id)}
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
                  onChange={(e) => onUpdateNote(item.product.id, e.target.value)}
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
                      onClick={() => onRemoveReplacement(item.product.id)}
                      className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 active:scale-90 transition-all duration-100 font-medium"
                    >Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => onAddReplacement(item.product.id)}
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
          {dispatch.cart.length > 0 && (
            <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: IC.cream, border: `1px solid #E5DDD0` }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: IC.green }}>Shopper Tip</p>
                  <p className="text-[10px]" style={{ color: IC.textMuted }}>Auto: ${autoTip.toFixed(2)} · edit if needed</p>
                </div>
                <span className="text-xl font-black" style={{ color: IC.gold }}>${tip.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onSetTip(Math.max(0, tip - 1))}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center font-bold text-lg active:scale-90 transition-all duration-100"
                  style={{ border: '1px solid #E5DDD0', color: IC.green }}>−</button>
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: IC.textMuted }}>$</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={tip}
                    onChange={e => onSetTip(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                    className="w-full text-center font-black text-base rounded-xl py-2 focus:outline-none bg-white"
                    style={{ border: `1px solid #E5DDD0`, color: IC.green }}
                  />
                </div>
                <button onClick={() => onSetTip(Math.min(99, tip + 1))}
                  className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold text-lg active:scale-90 transition-all duration-100"
                  style={{ backgroundColor: IC.green }}>+</button>
              </div>
            </div>
          )}
          {canShopNow && (
            <button
              onClick={onShopNow}
              disabled={dispatch.cart.length === 0}
              className="w-full font-black py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] text-sm tracking-widest uppercase disabled:opacity-40"
              style={{ backgroundColor: IC.gold, color: IC.green }}
            >
              🛒 Shop Now — Go to Store Mode
            </button>
          )}
          <button
            onClick={onSendDispatch}
            disabled={dispatch.cart.length === 0}
            className="w-full text-white font-black py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] text-sm tracking-widest uppercase disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {dispatch.cart.length === 0 ? 'Add items to dispatch' : `Send ${STORE_LABEL[dispatch.store]} Dispatch →`}
          </button>
        </div>
      </aside>
    </>
  )
}

// ── ShopperPickerModal ────────────────────────────────────────────────────────

function ShopperPickerModal({ shoppers, sending, onSend, onAddShopper, onClose }: {
  shoppers: Shopper[]
  sending: boolean
  onSend: (shopper: Shopper) => void
  onAddShopper: () => void
  onClose: () => void
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
          <h3 className="text-xl font-black uppercase tracking-widest" style={{ color: IC.green }}>Send Dispatch</h3>
          <p className="text-sm mt-1" style={{ color: IC.textMuted }}>Who is shopping this order?</p>
        </div>

        {sending ? (
          <div className="flex flex-col items-center py-6">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mb-3" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            <p className="text-sm font-medium" style={{ color: IC.textMuted }}>Sending dispatch…</p>
          </div>
        ) : shoppers.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm mb-4" style={{ color: IC.textMuted }}>No shoppers yet. Add one first.</p>
            <button
              onClick={onAddShopper}
              className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97]"
              style={{ backgroundColor: IC.green }}
            >+ Add Shopper</button>
          </div>
        ) : (
          <div className="space-y-2">
            {shoppers.map(s => (
              <button
                key={s.id}
                onClick={() => onSend(s)}
                className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-4 text-left transition-all duration-150 active:scale-[0.98] shadow-sm"
                style={{ border: `1px solid #E5DDD0` }}
              >
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0" style={{ backgroundColor: IC.green }}>
                  {s.name[0].toUpperCase()}
                </span>
                <span className="font-bold text-base flex-1" style={{ color: IC.green }}>{s.name}</span>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
            <button
              onClick={onAddShopper}
              className="w-full rounded-2xl px-5 py-4 flex items-center gap-2 transition-all duration-150 active:scale-[0.98]"
              style={{ border: `1.5px dashed ${IC.gold}`, color: IC.gold }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-bold text-sm">Add New Shopper</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AddShopperModal ───────────────────────────────────────────────────────────

function AddShopperModal({ onAdd, onClose }: {
  onAdd: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onAdd(name.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
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

        <h3 className="text-xl font-black uppercase tracking-widest mb-1" style={{ color: IC.green }}>Add Shopper</h3>
        <p className="text-sm mb-6" style={{ color: IC.textMuted }}>They'll appear on their device automatically.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Shopper's name…"
            autoFocus
            className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
            style={{ border: `2px solid #E5DDD0`, color: IC.green }}
            onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
          />
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {saving ? 'Saving…' : 'Add Shopper'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
// Lightweight bottom snackbar — used for the Pantry's "already in cart" /
// "add to cart?" confirmations instead of a silent auto-add.

function Toast({ message, actionLabel, onAction, onDismiss }: {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, actionLabel ? 6000 : 3000)
    return () => clearTimeout(t)
  }, [onDismiss, actionLabel])

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[95] flex justify-center pointer-events-none">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 pointer-events-auto" style={{ border: '1px solid #E5DDD0' }}>
        <p className="flex-1 text-sm font-medium" style={{ color: IC.green }}>{message}</p>
        {actionLabel && onAction && (
          <button
            onClick={() => { onAction(); onDismiss() }}
            className="flex-shrink-0 px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-wider text-white active:scale-95 transition-all duration-150"
            style={{ backgroundColor: IC.green }}
          >{actionLabel}</button>
        )}
        <button onClick={onDismiss} className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100" style={{ backgroundColor: IC.cream }} aria-label="Dismiss">
          <svg className="w-3 h-3" fill="none" stroke={IC.green} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── CustomItemModal ───────────────────────────────────────────────────────────
// Fallback for when Costco search doesn't have what the user's looking for —
// lets them add a freeform line item straight into the Costco dispatch cart.

function CustomItemModal({ initialName, onAdd, onClose }: {
  initialName: string
  onAdd: (name: string, note: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [note, setNote] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), note.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
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

        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xl font-black uppercase tracking-widest" style={{ color: IC.green }}>Custom Item</h3>
          <StoreTag store="costco" />
        </div>
        <p className="text-sm mb-6" style={{ color: IC.textMuted }}>
          Not in search results? Add it anyway — your shopper will look for it in the warehouse.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Item name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Kirkland paper towels"
              autoFocus
              className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
              style={{ border: `2px solid #E5DDD0`, color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.costco)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>
              Note <span className="normal-case font-normal">(quantity, size, brand — optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. 2 packs, any brand is fine"
              className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
              style={{ border: `2px solid #E5DDD0`, color: IC.green }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.costco)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: IC.costco }}
          >
            + Add to Costco Dispatch
          </button>
        </form>
      </div>
    </div>
  )
}

// ── PantryItemRow ─────────────────────────────────────────────────────────────

function PantryItemRow({ item, onSetStatus, onRequestDelete }: {
  item: InventoryItem
  onSetStatus: (item: InventoryItem, status: InventoryStatus) => void
  onRequestDelete: (item: InventoryItem) => void
}) {
  return (
    <li className="bg-white rounded-2xl p-3 flex items-center gap-3" style={{ border: '1px solid #E5DDD0' }}>
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} loading="lazy" className="w-14 h-14 object-contain flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: IC.cream }}>
          <svg className="w-6 h-6" fill="none" stroke={IC.textMuted} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        {item.brand && <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: IC.textMuted }}>{item.brand}</p>}
        <p className="text-sm font-semibold leading-tight truncate" style={{ color: IC.green }}>{item.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {item.store !== 'other' && <StoreTag store={item.store} />}
          {item.size && <span className="text-[10px] font-semibold" style={{ color: IC.textMuted }}>{item.size}</span>}
          {item.unit_price != null && <span className="text-[10px] font-black" style={{ color: IC.gold }}>${item.unit_price.toFixed(2)}</span>}
          <span className="text-[10px]" style={{ color: IC.textMuted }}>Restocked {timeAgo(item.last_restocked_at)}</span>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        {(Object.keys(STATUS_CONFIG) as InventoryStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s]
          const active = item.status === s
          return (
            <button
              key={s}
              onClick={() => onSetStatus(item, s)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all duration-150 active:scale-90"
              style={{
                backgroundColor: active ? `${cfg.color}20` : IC.cream,
                border: active ? `2px solid ${cfg.color}` : '1px solid transparent',
              }}
              aria-label={cfg.label}
              title={cfg.label}
            >{cfg.emoji}</button>
          )
        })}
        <button
          onClick={() => onRequestDelete(item)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-150"
          style={{ backgroundColor: IC.cream }}
          aria-label="Delete item"
          title="Delete item"
        >
          <svg className="w-4 h-4" fill="none" stroke="#9B8470" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </li>
  )
}

// ── PantryView ────────────────────────────────────────────────────────────────

function PantryView({ items, loading, error, onClose, onSetStatus, onAddItem, onDeleteItem }: {
  items: InventoryItem[]
  loading: boolean
  error: string
  onClose: () => void
  onSetStatus: (item: InventoryItem, status: InventoryStatus) => void
  onAddItem: () => void
  onDeleteItem: (item: InventoryItem) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InventoryStatus>('all')
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<InventoryItem | null>(null)

  const filtered = items.filter(i =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    i.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const counts = {
    all: items.length,
    in_stock: items.filter(i => i.status === 'in_stock').length,
    running_low: items.filter(i => i.status === 'running_low').length,
    out_of_stock: items.filter(i => i.status === 'out_of_stock').length,
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: IC.cream }}>
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2.5">
          <button onClick={onClose} className="flex items-center gap-1 active:opacity-70 transition-opacity" aria-label="Back to home">
            <svg className="w-4 h-4" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-black text-white tracking-[0.12em] uppercase text-base leading-none block">Family Pantry</span>
            <span className="text-[9px] font-bold tracking-[0.3em] uppercase leading-none block" style={{ color: IC.gold }}>Shared Inventory</span>
          </div>
          <button
            onClick={onAddItem}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 active:scale-95 transition-all duration-100 flex-shrink-0"
            style={{ backgroundColor: IC.gold, color: IC.green }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs font-black uppercase tracking-wider">Add Item</span>
          </button>
        </div>
      </header>

      <div className="px-4 py-4 max-w-3xl mx-auto w-full space-y-3">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pantry..."
            className="w-full rounded-2xl pl-11 pr-4 py-3 text-base focus:outline-none bg-white"
            style={{ border: '2px solid #E5DDD0', color: IC.green }}
            onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'in_stock' as const, label: `${STATUS_CONFIG.in_stock.emoji} In Stock` },
            { key: 'running_low' as const, label: `${STATUS_CONFIG.running_low.emoji} Running Low` },
            { key: 'out_of_stock' as const, label: `${STATUS_CONFIG.out_of_stock.emoji} Out of Stock` },
          ]).map(({ key, label }) => {
            const active = statusFilter === key
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-150 active:scale-95"
                style={{
                  backgroundColor: active ? IC.green : 'white',
                  color: active ? 'white' : IC.green,
                  border: active ? 'none' : '1px solid #E5DDD0',
                }}
              >
                {label}
                <span className="text-xs font-black rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: active ? IC.gold : IC.cream, color: active ? IC.green : IC.textMuted }}>
                  {counts[key]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 pb-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm font-medium">{error}</div>
        )}

        {loading && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            <p className="text-sm font-medium" style={{ color: IC.textMuted }}>Loading pantry…</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <RadarLogo className="w-20 h-20 opacity-30 mb-5" />
            <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>
              {items.length === 0 ? 'Pantry Is Empty' : 'No Matches'}
            </p>
            <p className="text-sm mt-2" style={{ color: IC.textMuted }}>
              {items.length === 0 ? 'Put away a delivered dispatch, or tap Add Item to start tracking it here' : 'Try a different search or filter'}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map(item => (
              <PantryItemRow key={item.id} item={item} onSetStatus={onSetStatus} onRequestDelete={setConfirmDeleteItem} />
            ))}
          </ul>
        )}
      </main>

      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteItem(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FEE2E2' }}>
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="font-black text-lg uppercase tracking-wider mb-2" style={{ color: IC.green }}>Delete {confirmDeleteItem.name} from Pantry?</p>
            <p className="text-sm mb-6" style={{ color: IC.textMuted }}>This cannot be undone.</p>
            <div className="space-y-2">
              <button
                onClick={() => { onDeleteItem(confirmDeleteItem); setConfirmDeleteItem(null) }}
                className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] text-white"
                style={{ backgroundColor: '#EF4444' }}
              >Delete</button>
              <button
                onClick={() => setConfirmDeleteItem(null)}
                className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97]"
                style={{ backgroundColor: IC.cream, color: IC.green }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── RestockReviewModal ───────────────────────────────────────────────────────

export interface RestockReviewSubmission {
  firestoreId: string
  foundItems: SharedItem[]
  restockItems: { item: SharedItem; qty: number }[]
  requeueItems: SharedItem[]
}

// Item-by-item reconciliation for a completed dispatch: found items default
// to checked (restock into the pantry, quantity editable), skipped items are
// clearly separated and left unchecked, with an optional "add back to next
// cart" toggle instead of silently touching their pantry status.
function RestockReviewModal({ dispatchLocal, onSubmit, onClose }: {
  dispatchLocal: Dispatch
  onSubmit: (payload: RestockReviewSubmission) => Promise<void>
  onClose: () => void
}) {
  const [liveDispatch, setLiveDispatch] = useState<LiveDispatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [restockChecked, setRestockChecked] = useState<Record<string, boolean>>({})
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({})
  const [requeueChecked, setRequeueChecked] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!dispatchLocal.firestoreId) {
        setLoadError('This dispatch was never sent.')
        setLoading(false)
        return
      }
      try {
        const snap = await getDoc(doc(db, 'dispatches', dispatchLocal.firestoreId))
        if (cancelled) return
        const data = snap.data() as LiveDispatch | undefined
        if (!data) { setLoadError('Could not find this dispatch.'); setLoading(false); return }
        setLiveDispatch(data)
        const initial: Record<string, boolean> = {}
        for (const item of data.items) initial[item.id] = data.checkedItems.includes(item.id)
        setRestockChecked(initial)
        setLoading(false)
      } catch (e) {
        if (!cancelled) { setLoadError(e instanceof Error ? e.message : 'Failed to load dispatch'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [dispatchLocal.firestoreId])

  const getQty = (item: SharedItem) => qtyOverrides[item.id] ?? liveDispatch?.confirmedQtys[item.id] ?? item.qty
  const setQty = (item: SharedItem, qty: number) => setQtyOverrides(prev => ({ ...prev, [item.id]: Math.max(1, qty) }))

  const handleSubmit = async () => {
    if (!liveDispatch || !dispatchLocal.firestoreId) return
    setSaving(true)
    try {
      const foundItems = liveDispatch.items.filter(i => liveDispatch.checkedItems.includes(i.id))
      const notFoundItems = liveDispatch.items.filter(i => !liveDispatch.checkedItems.includes(i.id))
      await onSubmit({
        firestoreId: dispatchLocal.firestoreId,
        foundItems,
        restockItems: foundItems.filter(i => restockChecked[i.id]).map(i => ({ item: i, qty: getQty(i) })),
        requeueItems: notFoundItems.filter(i => requeueChecked[i.id]),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const restockCount = liveDispatch ? liveDispatch.items.filter(i => liveDispatch.checkedItems.includes(i.id) && restockChecked[i.id]).length : 0

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E5DDD0' }} />
        </div>
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <div className="flex items-center gap-2">
            <h3 className="font-black uppercase tracking-wider text-sm" style={{ color: IC.green }}>Review & Put Away</h3>
            <StoreTag store={dispatchLocal.store} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: IC.textMuted }}>Confirm what to restock in your pantry, then archive this dispatch</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
              <p className="text-sm font-medium" style={{ color: IC.textMuted }}>Loading dispatch…</p>
            </div>
          )}
          {loadError && !loading && (
            <p className="text-sm font-medium text-center py-8" style={{ color: '#e53935' }}>{loadError}</p>
          )}

          {liveDispatch && !loading && (() => {
            const foundItems = liveDispatch.items.filter(i => liveDispatch.checkedItems.includes(i.id))
            const notFoundItems = liveDispatch.items.filter(i => !liveDispatch.checkedItems.includes(i.id))
            return (
              <>
                {foundItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: IC.textMuted }}>
                      Found — Ready to Restock ({foundItems.length})
                    </p>
                    <div className="space-y-2">
                      {foundItems.map(item => {
                        const checked = restockChecked[item.id] ?? true
                        const qty = getQty(item)
                        return (
                          <div key={item.id} className="rounded-2xl p-3" style={{ backgroundColor: checked ? `${IC.green}08` : IC.cream, border: checked ? `1px solid ${IC.green}30` : '1px solid #E5DDD0' }}>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setRestockChecked(prev => ({ ...prev, [item.id]: !checked }))}
                                className="flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200 active:scale-90"
                                style={{ backgroundColor: checked ? IC.green : 'white', borderColor: checked ? IC.green : '#C8BFB0' }}
                                aria-label={checked ? 'Uncheck' : 'Check'}
                              >
                                {checked && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              {item.img && <img src={item.img} alt={item.name} loading="lazy" className="w-12 h-12 object-contain flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold leading-tight" style={{ color: IC.green }}>{item.name}</p>
                                <p className="text-xs mt-0.5" style={{ color: IC.textMuted }}>{item.brand}{item.size ? ` · ${item.size}` : ''}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => setQty(item, qty - 1)}
                                  disabled={!checked}
                                  className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none disabled:opacity-40"
                                  style={{ border: '1px solid #E5DDD0', color: IC.green }}
                                >−</button>
                                <span className="w-6 text-center text-sm font-black" style={{ color: IC.green }}>{qty}</span>
                                <button
                                  onClick={() => setQty(item, qty + 1)}
                                  disabled={!checked}
                                  className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold active:scale-[0.85] transition-all duration-100 text-base leading-none disabled:opacity-40"
                                  style={{ backgroundColor: IC.green }}
                                >+</button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {notFoundItems.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: IC.textMuted }}>
                      Not Found / Skipped ({notFoundItems.length})
                    </p>
                    <div className="space-y-2">
                      {notFoundItems.map(item => {
                        const requeue = requeueChecked[item.id] ?? false
                        return (
                          <div key={item.id} className="rounded-2xl p-3" style={{ backgroundColor: IC.cream, border: '1px solid #E5DDD0' }}>
                            <div className="flex items-center gap-3">
                              {item.img && <img src={item.img} alt={item.name} loading="lazy" className="w-12 h-12 object-contain flex-shrink-0 opacity-50 grayscale" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold leading-tight" style={{ color: '#9B8470' }}>{item.name}</p>
                                <p className="text-xs mt-0.5 font-semibold uppercase tracking-wide" style={{ color: '#B8A88E' }}>Not purchased</p>
                              </div>
                              <button
                                onClick={() => setRequeueChecked(prev => ({ ...prev, [item.id]: !requeue }))}
                                className="flex-shrink-0 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all duration-150 active:scale-95"
                                style={{
                                  backgroundColor: requeue ? `${IC.gold}20` : 'white',
                                  color: requeue ? IC.gold : IC.textMuted,
                                  border: requeue ? `1.5px solid ${IC.gold}` : '1px solid #E5DDD0',
                                }}
                              >{requeue ? '✓ Adding back' : '↻ Add to next cart'}</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>

        <div className="px-5 py-5 bg-white" style={{ borderTop: '1px solid #E5DDD0' }}>
          <button
            onClick={handleSubmit}
            disabled={loading || !!loadError || saving}
            className="w-full text-white font-black py-4 rounded-2xl transition-all duration-150 active:scale-[0.97] text-sm tracking-widest uppercase disabled:opacity-40"
            style={{ backgroundColor: IC.green }}
          >
            {saving ? 'Saving…' : `Restock ${restockCount} Item${restockCount !== 1 ? 's' : ''} & Archive →`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BarcodeScannerModal ──────────────────────────────────────────────────────
// Lazy-loads html5-qrcode entirely inside the effect (never at module scope)
// so a browser-only camera/DOM library can never run during SSR.

const BARCODE_VIEWPORT_ID = 'ic-barcode-scanner-viewport'

// Immediate "got it" cue on raw detection — distinct (higher-pitched, shorter)
// from playBarcodeNotFoundTone's later "no match in Open Food Facts" cue.
function playBarcodeDetectedTone() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 1046 // ~C6, a bright "beep"
    gain.gain.value = 0.18
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
    osc.onended = () => ctx.close()
  } catch { /* non-critical UX affordance — ignore if Web Audio isn't available */ }
}

function BarcodeScannerModal({ onDetected, onClose }: {
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  // Point 4: prefer the native BarcodeDetector API when the browser has one
  // (faster, hardware-accelerated on most mobile browsers) — html5-qrcode
  // does the actual native-vs-JS-fallback selection internally when
  // useBarCodeDetectorIfSupported is set; this just surfaces which path
  // we're on. Safe to read directly (no effect needed): this modal only
  // ever mounts client-side, after a user clicks "Scan Barcode".
  const usingNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  useEffect(() => { onDetectedRef.current = onDetected })

  // Fires for both camera detections and manual-entry fallback: logs (for
  // debugging exactly what the request asked for), buzzes, beeps, flashes
  // green, then a brief moment later hands the code up to the parent.
  const handleSuccess = useCallback((code: string, format?: string) => {
    if (detectedRef.current) return
    detectedRef.current = true
    console.log('[BarcodeScanner] Detected:', code, format ? `(${format})` : '')
    if (navigator.vibrate) navigator.vibrate(100)
    playBarcodeDetectedTone()
    setFlash(true)
    setTimeout(() => onDetectedRef.current(code), 280)
  }, [])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Html5Qrcode instance, typed loosely since it's dynamically imported
    let scannerInstance: any = null
    detectedRef.current = false

    ;(async () => {
      setStarting(true)
      setError('')
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (cancelled) return
        scannerInstance = new Html5Qrcode(BARCODE_VIEWPORT_ID, {
          // Point 1: standard retail 1D formats explicitly enabled, plus QR.
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          // Point 4: use the native BarcodeDetector API when available,
          // falling back to the bundled JS (ZXing) decoder otherwise.
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        })
        // Point 2: request an ideal 1280x720 feed with continuous autofocus.
        // videoConstraints (when present) fully replaces the constraints
        // html5-qrcode would otherwise derive from the first `start()` arg,
        // so facingMode has to live in here too, not split across both.
        const videoConstraints: MediaTrackConstraints = {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // focusMode isn't part of the standard constraint set TS knows
          // about, but Chrome/Android honor it via `advanced`; ignored
          // harmlessly where unsupported.
          advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
        }
        await scannerInstance.start(
          { facingMode },
          {
            fps: 15,
            qrbox: { width: 300, height: 160 },
            videoConstraints,
          },
          // Point 3: success callback — fires on every continuously-scanned
          // frame that decodes; logging/haptics/audio happen in handleSuccess.
          (decodedText: string, result: { result?: { format?: { formatName?: string } } }) => {
            handleSuccess(decodedText, result?.result?.format?.formatName)
          },
          () => { /* per-frame "no barcode in view" — fires continuously, not an error */ }
        )
        if (cancelled) {
          scannerInstance.stop().then(() => scannerInstance.clear()).catch(() => {})
          return
        }
        setStarting(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not access the camera. Check permissions and try again.')
          setStarting(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (scannerInstance) {
        scannerInstance.stop().then(() => scannerInstance.clear()).catch(() => {})
      }
    }
  }, [facingMode, handleSuccess])

  const submitManualCode = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    handleSuccess(code, 'manual entry')
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ backgroundColor: '#0A0A0A' }}>
      {/* Point 5: green flash on successful detection */}
      {flash && (
        <div className="fixed inset-0 z-[90] pointer-events-none" style={{ backgroundColor: 'rgba(34,165,89,0.35)', animation: 'ic-scan-flash 280ms ease-out' }} />
      )}
      <style>{`@keyframes ic-scan-flash { 0% { opacity: 0; } 25% { opacity: 1; } 100% { opacity: 0; } }`}</style>

      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-white font-black uppercase tracking-widest text-sm">Scan Barcode</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>UPC-A, UPC-E, EAN-13, EAN-8, Code 128, or QR</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100 flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          aria-label="Close scanner"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center px-4">
        <div id={BARCODE_VIEWPORT_ID} className="w-full max-w-md rounded-2xl overflow-hidden" />
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            <p className="text-sm font-medium text-white">Starting camera…</p>
          </div>
        )}
        {!starting && !error && (
          <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {usingNativeDetector ? 'Using device barcode scanner' : 'Using built-in scanner'}
          </p>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-sm font-medium text-white">{error}</p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150" style={{ backgroundColor: IC.gold, color: IC.green }}>Close</button>
          </div>
        )}
      </div>

      {/* Point 5: manual-entry fallback for a damaged/unreadable barcode */}
      {manualOpen ? (
        <form onSubmit={submitManualCode} className="flex items-center gap-2 px-5 py-4">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={manualCode}
            onChange={e => setManualCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Enter barcode digits…"
            className="flex-1 min-w-0 rounded-2xl px-4 py-3 text-base focus:outline-none bg-white"
            style={{ color: IC.green }}
          />
          <button type="submit" disabled={!manualCode.trim()} className="px-4 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150 disabled:opacity-40" style={{ backgroundColor: IC.gold, color: IC.green }}>Use</button>
          <button type="button" onClick={() => setManualOpen(false)} className="px-3 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}>✕</button>
        </form>
      ) : (
        <div className="flex items-center justify-center gap-3 px-5 py-6 flex-wrap">
          <button
            onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}
          >🔄 Flip Camera</button>
          <button
            onClick={() => setManualOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}
          >⌨️ Enter Manually</button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all duration-150"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}
          >Cancel</button>
        </div>
      )}
    </div>
  )
}

// ── AddPantryItemModal ───────────────────────────────────────────────────────

function playBarcodeNotFoundTone() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 420
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close()
  } catch { /* non-critical UX affordance — ignore if Web Audio isn't available */ }
}

const PANTRY_STORE_OPTIONS: { key: InventoryStore; label: string; color: string }[] = [
  { key: 'kroger', label: 'Kroger', color: IC.kroger },
  { key: 'costco', label: 'Costco', color: IC.costco },
  { key: 'other', label: 'Other', color: IC.textMuted },
]

// Kroger's public API has no UPC/barcode filter (`filter.upc` returns a 400
// — verified against the live API), and neither the raw scanned code nor a
// zero-padded variant reliably matches Kroger's own catalog id via
// `filter.productId` either. `filter.term` is the only thing that works, so
// callers try the raw code as a term first, then fall back to a name-based
// search (see AddPantryItemModal.handleDetected).
async function searchKrogerTerm(term: string, locationId: string): Promise<Product[]> {
  const params = new URLSearchParams({ term, locationId, start: '0' })
  const res = await fetch(`/api/kroger/products?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return ((data.products ?? []) as KrogerProduct[]).map(krogerToProduct)
}

export interface AddPantryItemInput {
  name: string
  brand: string
  imageUrl: string
  store: InventoryStore
  barcode: string
  size: string
  unitPrice: number | null
  originalProductId: string | null
}

function AddPantryItemModal({ krogerLocation, onSave, onClose }: {
  krogerLocation: KrogerLocation | null
  onSave: (input: AddPantryItemInput) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [size, setSize] = useState('')
  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const [store, setStore] = useState<InventoryStore>('other')
  const [barcode, setBarcode] = useState('')
  const [matchedProductId, setMatchedProductId] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupNotice, setLookupNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Hand-editing any of these after a barcode match invalidates the SKU
  // link — we can no longer promise `original_product_id` describes what's
  // actually in the form.
  const editField = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    setMatchedProductId(null)
  }

  const handleDetected = useCallback((code: string) => {
    setScannerOpen(false)
    setBarcode(code)
    setMatchedProductId(null)
    setLookupLoading(true)
    setLookupNotice('')

    const applyKrogerMatch = (kp: Product, via: string) => {
      setName(kp.name)
      setBrand(kp.brand)
      setImageUrl(kp.image)
      setSize(kp.size)
      setUnitPrice(kp.price > 0 ? kp.price : null)
      setMatchedProductId(kp.id)
      setLookupNotice(`✓ Matched official Kroger product (${via}) — review before saving`)
    }
    const applyOffResult = (result: OpenFoodFactsLookup, prefix = '') => {
      if (result.found) {
        if (result.name) setName(result.name)
        if (result.brand) setBrand(result.brand)
        if (result.imageUrl) setImageUrl(result.imageUrl)
        setLookupNotice(`${prefix}✓ Found "${result.name ?? 'product'}" via Open Food Facts — review before saving`)
      } else {
        playBarcodeNotFoundTone()
        setLookupNotice(`${prefix}No match for barcode ${code} — enter the details manually`)
      }
    }

    ;(async () => {
      try {
        if (store === 'kroger') {
          if (!krogerLocation) {
            applyOffResult(await lookupBarcode(code), 'Pick a Kroger store in the app to match official Kroger products. ')
            return
          }
          // 1. Kroger has no UPC filter (verified against the live API — see
          //    searchKrogerTerm) — try the raw scanned code as a search term.
          let matches = await searchKrogerTerm(code, krogerLocation.locationId)
          if (matches.length > 0) { applyKrogerMatch(matches[0], 'by barcode'); return }

          // 2. Fall back to Open Food Facts purely to recover a product
          //    name, then retry Kroger's catalog search by that name.
          const off = await lookupBarcode(code).catch((): OpenFoodFactsLookup => ({ found: false }))
          if (off.found && off.name) {
            matches = await searchKrogerTerm(off.name, krogerLocation.locationId)
            if (matches.length > 0) { applyKrogerMatch(matches[0], `best match for "${off.name}"`); return }
          }
          applyOffResult(off, off.found ? 'No exact Kroger match — ' : '')
          return
        }

        // Costco / Other: Costco's catalog has no reliable barcode lookup in
        // this app, so go straight to Open Food Facts.
        applyOffResult(await lookupBarcode(code))
      } catch (e) {
        playBarcodeNotFoundTone()
        setLookupNotice(e instanceof Error ? e.message : 'Lookup failed — enter the details manually')
      } finally {
        setLookupLoading(false)
      }
    })()
  }, [store, krogerLocation])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave({
        name: name.trim(),
        brand: brand.trim(),
        imageUrl: imageUrl.trim(),
        store,
        barcode: barcode.trim(),
        size: size.trim(),
        unitPrice,
        originalProductId: matchedProductId,
      })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-7 max-h-[92vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
            style={{ backgroundColor: IC.cream }}
          >
            <svg className="w-4 h-4" fill="none" stroke={IC.green} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h3 className="text-xl font-black uppercase tracking-widest mb-1" style={{ color: IC.green }}>Add Pantry Item</h3>
          <p className="text-sm mb-5" style={{ color: IC.textMuted }}>Pick a store, then scan a barcode to auto-fill — or enter the details yourself.</p>

          <div className="mb-4">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Store</label>
            <div className="flex gap-2">
              {PANTRY_STORE_OPTIONS.map(opt => {
                const active = store === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setStore(opt.key); setMatchedProductId(null) }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-150 active:scale-[0.97]"
                    style={{
                      backgroundColor: active ? `${opt.color}18` : IC.cream,
                      color: active ? opt.color : IC.textMuted,
                      border: active ? `2px solid ${opt.color}` : '1px solid transparent',
                    }}
                  >{opt.label}</button>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="w-full mb-4 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
            style={{ backgroundColor: IC.green, color: 'white' }}
          >📷 Scan Barcode</button>

          {lookupLoading && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-2xl" style={{ backgroundColor: IC.cream }}>
              <span className="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
              <p className="text-sm font-medium" style={{ color: IC.textMuted }}>{store === 'kroger' ? 'Looking up barcode at Kroger…' : 'Looking up barcode…'}</p>
            </div>
          )}
          {lookupNotice && !lookupLoading && (
            <div className="mb-4 px-4 py-3 rounded-2xl text-sm font-medium" style={{ backgroundColor: `${IC.gold}15`, color: IC.greenMid }}>
              {lookupNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {barcode && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: IC.textMuted }}>
                  Barcode <span className="font-mono normal-case">{barcode}</span>
                </p>
                {matchedProductId && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${IC.kroger}18`, color: IC.kroger }}>
                    ✓ Official Kroger SKU
                  </span>
                )}
              </div>
            )}
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={editField(setName)}
                placeholder="e.g. Kirkland Signature Coffee"
                className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
                style={{ border: '2px solid #E5DDD0', color: IC.green }}
                onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Brand <span className="normal-case font-normal">(optional)</span></label>
              <input
                type="text"
                value={brand}
                onChange={editField(setBrand)}
                placeholder="e.g. Kirkland Signature"
                className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
                style={{ border: '2px solid #E5DDD0', color: IC.green }}
                onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Size <span className="normal-case font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={size}
                  onChange={editField(setSize)}
                  placeholder="e.g. 12 oz"
                  className="w-full rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
                  style={{ border: '2px solid #E5DDD0', color: IC.green }}
                  onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Price <span className="normal-case font-normal">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: IC.textMuted }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitPrice ?? ''}
                    onChange={e => { setUnitPrice(e.target.value === '' ? null : Number(e.target.value)); setMatchedProductId(null) }}
                    placeholder="0.00"
                    className="w-full rounded-2xl pl-7 pr-3 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
                    style={{ border: '2px solid #E5DDD0', color: IC.green }}
                    onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                    onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 block" style={{ color: IC.textMuted }}>Image URL <span className="normal-case font-normal">(optional)</span></label>
              <div className="flex items-center gap-2">
                {imageUrl && <img src={imageUrl} alt="" className="w-11 h-11 object-contain rounded-lg flex-shrink-0" style={{ backgroundColor: IC.cream }} />}
                <input
                  type="text"
                  value={imageUrl}
                  onChange={editField(setImageUrl)}
                  placeholder="https://..."
                  className="flex-1 min-w-0 rounded-2xl px-4 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
                  style={{ border: '2px solid #E5DDD0', color: IC.green }}
                  onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
                />
              </div>
            </div>
            {saveError && <p className="text-sm font-medium" style={{ color: '#e53935' }}>{saveError}</p>}
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-40"
              style={{ backgroundColor: IC.green }}
            >
              {saving ? 'Saving…' : '+ Add to Pantry'}
            </button>
          </form>
        </div>
      </div>

      {scannerOpen && (
        <BarcodeScannerModal onDetected={handleDetected} onClose={() => setScannerOpen(false)} />
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShoppingApp() {
  const router = useRouter()

  // ── Family auth state ────────────────────────────────────────────────────────
  type AuthState = 'loading' | 'gate' | 'join' | 'create' | 'select'
  const [authState, setAuthState] = useState<AuthState | null>('loading')
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberName, setMemberName] = useState<string | null>(null)
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [joinData, setJoinData] = useState<{ familyId: string; members: FamilyMember[] } | null>(null)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

  const [store, setStore] = useState<KrogerLocation | null>(null)
  const [activeStoreType, setActiveStoreType] = useState<StoreType>('kroger')
  const [shoppingActive, setShoppingActive] = useState(false)
  const [locationResults, setLocationResults] = useState<KrogerLocation[]>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchStart, setSearchStart] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [dispatches, setDispatches] = useState<Dispatch[]>([{ id: 'dispatch-1', name: 'Kroger Cart', store: 'kroger', cart: [], note: '' }])
  const [activeDispatchId, setActiveDispatchId] = useState<string>('dispatch-1')
  const [cartOpen, setCartOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null)

  const [shoppers, setShoppers] = useState<Shopper[]>([])
  const [shopperPickerOpen, setShopperPickerOpen] = useState(false)
  const [sendingShopper, setSendingShopper] = useState(false)
  const [liveProgress, setLiveProgress] = useState<Record<string, { checked: number; total: number; checkedItems: string[]; status: LiveDispatch['status'] }>>({})

  const [replacingForId, setReplacingForId] = useState<string | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([])
  const [favorites, setFavorites] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'favorites' | 'recent'>('favorites')
  const [customItemOpen, setCustomItemOpen] = useState(false)

  const [pantryOpen, setPantryOpen] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [putAwayDispatchId, setPutAwayDispatchId] = useState<string | null>(null)
  const [selfShopFirestoreId, setSelfShopFirestoreId] = useState<string | null>(null)
  const [selfShopDispatch, setSelfShopDispatch] = useState<LiveDispatch | null>(null)
  const [addPantryItemOpen, setAddPantryItemOpen] = useState(false)

  // Load persisted data on mount + check family session
  useEffect(() => {
    setPurchaseHistory(loadHistory())
    setFavorites(loadFavorites())
    const savedStore = loadStore()
    const savedStoreType = loadStoreType()
    const savedDispatches = loadDispatches()
    if (savedStore) setStore(savedStore)
    setActiveStoreType(savedStoreType)
    if (savedDispatches && savedDispatches.length > 0) {
      const collapsed = collapseDraftsToOne(savedDispatches)
      const { list, id } = ensureDraftDispatch(collapsed, savedStoreType)
      setDispatches(list)
      setActiveDispatchId(id)
    }
    // Check family session
    const fid = localStorage.getItem(FAMILY_ID_KEY)
    const mid = localStorage.getItem(MEMBER_ID_KEY)
    const mname = localStorage.getItem(MEMBER_NAME_KEY)
    const mroles = localStorage.getItem(MEMBER_ROLES_KEY)
    if (fid && mid && mname && mroles) {
      try {
        const roles = JSON.parse(mroles) as MemberRole[]
        setFamilyId(fid)
        setMemberId(mid)
        setMemberName(mname)
        setMemberRoles(roles)
        setAuthState(null)
      } catch {
        setAuthState('gate')
      }
    } else {
      setAuthState('gate')
    }
  }, [])

  // Persist store and dispatches whenever they change
  useEffect(() => { saveStore(store) }, [store])
  useEffect(() => { saveDispatches(dispatches) }, [dispatches])

  useEffect(() => {
    const allItems = dispatches.flatMap(d => d.cart)
    if (allItems.length === 0) return
    let h = loadHistory()
    for (const item of allItems) h = addToHistory(item.product, h)
    saveHistory(h)
    setPurchaseHistory(h)
  }, [dispatches])

  // ── Auth callbacks ────────────────────────────────────────────────────────────

  const completeAuth = useCallback((fid: string, mid: string, mname: string, mroles: MemberRole[]) => {
    localStorage.setItem(FAMILY_ID_KEY, fid)
    localStorage.setItem(MEMBER_ID_KEY, mid)
    localStorage.setItem(MEMBER_NAME_KEY, mname)
    localStorage.setItem(MEMBER_ROLES_KEY, JSON.stringify(mroles))
    setFamilyId(fid)
    setMemberId(mid)
    setMemberName(mname)
    setMemberRoles(mroles)
    setJoinData(null)
    setAuthState(null)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(FAMILY_ID_KEY)
    localStorage.removeItem(MEMBER_ID_KEY)
    localStorage.removeItem(MEMBER_NAME_KEY)
    localStorage.removeItem(MEMBER_ROLES_KEY)
    setFamilyId(null)
    setMemberId(null)
    setMemberName(null)
    setMemberRoles([])
    setFamilyMembers([])
    setShoppers([])
    setJoinData(null)
    setAuthState('gate')
  }, [])

  const handleJoinFound = useCallback((fid: string, members: FamilyMember[]) => {
    setJoinData({ familyId: fid, members })
    setAuthState('select')
  }, [])

  const handleMemberSelect = useCallback((m: FamilyMember) => {
    if (!joinData) return
    completeAuth(joinData.familyId, m.id, m.name, m.roles)
  }, [completeAuth, joinData])

  const handleFamilyCreated = useCallback((fid: string, member: FamilyMember) => {
    completeAuth(fid, member.id, member.name, member.roles)
  }, [completeAuth])

  // Redirect shopper-only members to /shop
  const isShopperOnly = authState === null && memberRoles.length > 0 &&
    !memberRoles.includes('order') && !memberRoles.includes('admin')

  useEffect(() => {
    if (isShopperOnly) router.push('/shop')
  }, [isShopperOnly, router])

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
    setStore(loc); setLocationResults([])
    setProducts([]); setSearchQuery(''); setSearchStart(0); setSearchTotal(0)
    setShoppingActive(false)
  }, [])

  const changeStoreType = useCallback((type: StoreType) => {
    setActiveStoreType(type)
    saveStoreType(type)
    setDispatches(prev => {
      const { list, id } = ensureDraftDispatch(prev, type)
      setActiveDispatchId(id)
      return list
    })
    setShoppingActive(false)
    setSearchQuery(''); setProducts([]); setSearchStart(0); setSearchTotal(0)
  }, [])

  const runSearch = useCallback(async (term: string, start: number) => {
    if (!term.trim()) return
    if (activeStoreType === 'kroger' && !store) return
    setIsSearching(true); setSearchError('')
    if (start === 0) setProducts([])
    try {
      let normalized: Product[]
      let total: number
      if (activeStoreType === 'kroger') {
        const params = new URLSearchParams({ term: term.trim(), locationId: store!.locationId, start: String(start) })
        const res = await fetch(`/api/kroger/products?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Search failed')
        normalized = (data.products as KrogerProduct[]).map(krogerToProduct)
        total = data.total
      } else {
        const params = new URLSearchParams({ query: term.trim(), country: 'US', start: String(start) })
        const res = await fetch(`/api/costco/search?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Search failed')
        normalized = (data.products as CostcoProduct[]).map(costcoToProduct)
        total = data.total
      }
      setProducts((prev) => (start === 0 ? normalized : [...prev, ...normalized]))
      setSearchTotal(total); setSearchStart(start)
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Search failed')
    } finally { setIsSearching(false) }
  }, [store, activeStoreType])

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

  const addToCart = useCallback((product: Product) => {
    updateActiveDispatch(d => {
      const existing = d.cart.find(i => i.product.id === product.id)
      return {
        ...d,
        cart: existing
          ? d.cart.map(i => i.product.id === product.id ? { ...i, quantity: Math.min(i.quantity + 1, 20) } : i)
          : [...d.cart, { product, quantity: 1, note: '' }],
      }
    })
  }, [updateActiveDispatch])

  const addCustomItem = useCallback((name: string, note: string) => {
    const product: Product = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      store: 'costco',
      name,
      brand: '',
      image: '',
      price: 0,
      size: '',
    }
    updateActiveDispatch(d => ({ ...d, cart: [...d.cart, { product, quantity: 1, note }] }))
  }, [updateActiveDispatch])

  // Auto-Dispatch Restock Trigger: finds (or creates) the active draft
  // dispatch for the item's store and upserts a tagged line item into it —
  // independent of whichever dispatch/tab the user currently has open.
  const upsertRestockItem = useCallback((storeType: StoreType, product: Product, restockStatus: 'running_low' | 'out_of_stock') => {
    setDispatches(prev => {
      const { list, id } = ensureDraftDispatch(prev, storeType)
      return list.map(d => d.id === id ? { ...d, cart: upsertCartItem(d.cart, product, restockStatus) } : d)
    })
  }, [])

  // Merges freshly-written row(s) into local pantry state immediately, so
  // the person who just acted sees it right away instead of waiting on the
  // Realtime round-trip (subscribeInventory still runs alongside this, so
  // other family members' devices stay in sync too).
  const mergeInventoryItems = useCallback((rows: InventoryItem[]) => {
    setInventoryItems(prev => {
      const byId = new Map(prev.map(i => [i.id, i]))
      for (const row of rows) byId.set(row.id, row)
      return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [])

  // Running Low / Out of Stock -> Add to Cart flow: never adds silently —
  // tells the user what's already in their cart, or offers a one-tap add.
  const handleSetInventoryStatus = useCallback(async (item: InventoryItem, status: InventoryStatus) => {
    try {
      const updated = await updateInventoryStatus(item.id, status)
      mergeInventoryItems([updated])
      if ((status === 'running_low' || status === 'out_of_stock') && (item.store === 'kroger' || item.store === 'costco')) {
        const storeType = item.store
        const productId = item.original_product_id || item.id
        const storeLabel = STORE_LABEL[storeType]
        const activeCart = dispatches.find(d => d.store === storeType && !d.firestoreId)
        const alreadyInCart = activeCart?.cart.some(i => i.product.id === productId) ?? false
        if (alreadyInCart) {
          setToast({ message: `${item.name} is already in your ${storeLabel} cart.` })
        } else {
          setToast({
            message: `${item.name} marked ${STATUS_CONFIG[status].label}. Add to ${storeLabel} cart?`,
            actionLabel: 'Add to Cart',
            onAction: () => {
              const product: Product = {
                id: productId,
                store: storeType,
                name: item.name,
                brand: item.brand || '',
                image: item.image_url || '',
                price: item.unit_price || 0,
                size: item.size || '',
              }
              upsertRestockItem(storeType, product, status)
            },
          })
        }
      }
    } catch (e) {
      setInventoryError(e instanceof Error ? e.message : 'Failed to update pantry status')
    }
  }, [upsertRestockItem, mergeInventoryItems, dispatches])

  // Completed Dispatch review: restocks checked found-items into the pantry
  // (incrementing quantity), re-queues any skipped items the admin chooses
  // to carry over into the store's active draft cart, records what was
  // actually bought to purchase history, then archives the dispatch.
  const handleRestockReview = useCallback(async (payload: RestockReviewSubmission) => {
    try {
      const saved = await Promise.all(payload.restockItems.map(({ item, qty }) => putAwayItem({
        name: item.name,
        brand: item.brand || null,
        image_url: item.img || null,
        store: item.store ?? 'kroger',
        original_product_id: item.id,
        size: item.size || null,
        unit_price: item.price || null,
        quantity: qty,
      })))
      mergeInventoryItems(saved)

      if (payload.requeueItems.length > 0) {
        const storeType: StoreType = payload.requeueItems[0].store ?? 'kroger'
        setDispatches(prev => {
          const { list, id } = ensureDraftDispatch(prev, storeType)
          return list.map(d => {
            if (d.id !== id) return d
            let cart = d.cart
            for (const item of payload.requeueItems) {
              const product: Product = {
                id: item.id, store: storeType, name: item.name, brand: item.brand || '',
                image: item.img || '', price: item.price || 0, size: item.size || '',
              }
              cart = upsertCartItem(cart, product)
            }
            return { ...d, cart }
          })
        })
      }

      if (familyId) {
        await Promise.all(payload.foundItems.map(item => {
          const storeType: StoreType = item.store ?? 'kroger'
          const hist: HistoryItem = { productId: item.id, description: item.name, brand: item.brand, img: item.img, size: item.size, price: item.price, store: storeType }
          return setDoc(doc(db, 'families', familyId, 'purchaseHistory', `${storeType}-${item.id}`), hist)
        }))
      } else if (payload.foundItems.length > 0) {
        let h = loadHistory()
        for (const item of payload.foundItems) {
          const storeType: StoreType = item.store ?? 'kroger'
          h = addToHistory({ id: item.id, store: storeType, name: item.name, brand: item.brand, image: item.img, price: item.price, size: item.size }, h)
        }
        saveHistory(h)
        setPurchaseHistory(h)
      }

      await updateDoc(doc(db, 'dispatches', payload.firestoreId), { status: 'archived' })
      setDispatches(prev => prev.map(d => d.firestoreId === payload.firestoreId ? { ...d, putAwayAt: Date.now() } : d))
    } catch (e) {
      setInventoryError(e instanceof Error ? e.message : 'Failed to complete the review')
    }
  }, [mergeInventoryItems, familyId])

  const handleAddPantryItem = useCallback(async (input: AddPantryItemInput) => {
    const created = await createInventoryItem({
      name: input.name,
      brand: input.brand || null,
      image_url: input.imageUrl || null,
      store: input.store,
      barcode: input.barcode || null,
      size: input.size || null,
      unit_price: input.unitPrice,
      original_product_id: input.originalProductId,
    })
    mergeInventoryItems([created])
  }, [mergeInventoryItems])

  const handleDeleteInventoryItem = useCallback(async (item: InventoryItem) => {
    try {
      await deleteInventoryItem(item.id)
      setInventoryItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) {
      setInventoryError(e instanceof Error ? e.message : 'Failed to delete pantry item')
    }
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.filter(i => i.product.id !== productId) }))
  }, [updateActiveDispatch])

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) removeFromCart(productId)
    else updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.id === productId ? { ...i, quantity: Math.min(qty, 20) } : i) }))
  }, [removeFromCart, updateActiveDispatch])

  const updateNote = useCallback((productId: string, note: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.id === productId ? { ...i, note } : i) }))
  }, [updateActiveDispatch])

  const setReplacement = useCallback((productId: string, replacement: CartReplacement) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.id === productId ? { ...i, replacement } : i) }))
    setReplacingForId(null)
  }, [updateActiveDispatch])

  const removeReplacement = useCallback((productId: string) => {
    updateActiveDispatch(d => ({ ...d, cart: d.cart.map(i => i.product.id === productId ? { ...i, replacement: undefined } : i) }))
  }, [updateActiveDispatch])

  // Empties the current store's single active cart in place — there's
  // always exactly one draft per store, so "clear" resets it rather than
  // deleting/recreating a dispatch.
  const clearActiveCart = useCallback(() => {
    updateActiveDispatch(d => ({ ...d, cart: [], note: '', tip: undefined }))
  }, [updateActiveDispatch])

  // Removes a sent dispatch from order history (and Firestore, if it was
  // actually sent). Never touches the active draft cart.
  const deleteHistoryDispatch = useCallback((id: string) => {
    const target = dispatches.find(d => d.id === id)
    if (!target) return
    setDispatches(prev => prev.filter(d => d.id !== id))
    if (target.firestoreId) deleteDoc(doc(db, 'dispatches', target.firestoreId)).catch(() => {})
  }, [dispatches])

  const setOrderNote = useCallback((note: string) => {
    updateActiveDispatch(d => ({ ...d, note }))
  }, [updateActiveDispatch])

  const setDispatchTip = useCallback((tip: number) => {
    updateActiveDispatch(d => ({ ...d, tip }))
  }, [updateActiveDispatch])

  const toggleFavorite = useCallback((product: Product) => {
    const fav: HistoryItem = {
      productId: product.id,
      description: product.name,
      brand: product.brand || '',
      img: product.image,
      size: product.size,
      price: product.price,
      store: product.store,
    }
    const favKey = `${product.store}-${product.id}`
    if (familyId) {
      const isFav = favorites.some(f => f.productId === product.id && f.store === product.store)
      if (isFav) {
        deleteDoc(doc(db, 'families', familyId, 'favorites', favKey))
      } else {
        setDoc(doc(db, 'families', familyId, 'favorites', favKey), fav)
      }
    } else {
      setFavorites(prev => {
        const isFav = prev.some(f => f.productId === product.id && f.store === product.store)
        const next = isFav ? prev.filter(f => !(f.productId === product.id && f.store === product.store)) : [...prev, fav]
        saveFavorites(next)
        return next
      })
    }
  }, [familyId, favorites])

  const activeDispatch = dispatches.find(d => d.id === activeDispatchId) ?? dispatches[0]
  const cartCount = activeDispatch.cart.reduce((n, i) => n + i.quantity, 0)

  // Sync favorites with Firestore when family is set
  useEffect(() => {
    if (!familyId) return
    const unsub = onSnapshot(collection(db, 'families', familyId, 'favorites'), snap => {
      const favs = snap.docs.map(d => d.data() as HistoryItem)
      setFavorites(favs)
    })
    return unsub
  }, [familyId])

  // Sync purchase history with Firestore when family is set
  useEffect(() => {
    if (!familyId) return
    const unsub = onSnapshot(collection(db, 'families', familyId, 'purchaseHistory'), snap => {
      const items = snap.docs.map(d => d.data() as HistoryItem)
        .sort((a, b) => a.description.localeCompare(b.description))
      setPurchaseHistory(items)
    })
    return unsub
  }, [familyId])

  // Live-sync the Family Pantry from Supabase while the Pantry tab is open
  useEffect(() => {
    if (!pantryOpen) return
    const unsub = subscribeInventory(
      (items) => { setInventoryItems(items); setInventoryLoading(false); setInventoryError('') },
      (msg) => { setInventoryError(msg); setInventoryLoading(false) }
    )
    return unsub
  }, [pantryOpen])

  const removeFromHistory = useCallback((productId: string, storeType: StoreType) => {
    if (familyId) {
      deleteDoc(doc(db, 'families', familyId, 'purchaseHistory', `${storeType}-${productId}`)).catch(() => {})
    } else {
      setPurchaseHistory(prev => {
        const next = prev.filter(h => !(h.productId === productId && h.store === storeType))
        saveHistory(next)
        return next
      })
    }
  }, [familyId])

  // Load family members from Firestore in real time
  useEffect(() => {
    if (!familyId) return
    const unsub = onSnapshot(collection(db, 'families', familyId, 'members'), snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as FamilyMember))
        .sort((a, b) => a.name.localeCompare(b.name))
      setFamilyMembers(all)
      setShoppers(all.filter(m => m.roles.includes('shopper'))
        .map(m => ({ id: m.id, name: m.name, createdAt: m.createdAt })))
    })
    return unsub
  }, [familyId])

  // Subscribe to live progress for sent dispatches
  useEffect(() => {
    const sent = dispatches.filter(d => d.firestoreId)
    if (sent.length === 0) return
    const unsubs = sent.map(d =>
      onSnapshot(doc(db, 'dispatches', d.firestoreId!), snap => {
        const data = snap.data() as LiveDispatch | undefined
        if (data) {
          setLiveProgress(prev => ({
            ...prev,
            [d.id]: {
              checked: data.checkedItems.length,
              total: data.items.reduce((n, i) => n + i.qty, 0),
              checkedItems: data.checkedItems,
              status: data.status,
            },
          }))
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [dispatches])

  // Live-syncs the full LiveDispatch doc while self-shopping (Shop Now) —
  // same checklist controls as the dedicated shopper view, just driven from
  // inside the main app instead of /shop.
  useEffect(() => {
    if (!selfShopFirestoreId) return
    const unsub = onSnapshot(doc(db, 'dispatches', selfShopFirestoreId), snap => {
      setSelfShopDispatch((snap.data() as LiveDispatch | undefined) ?? null)
    })
    return unsub
  }, [selfShopFirestoreId])

  const selfShopToggleItem = useCallback(async (itemId: string, checked: boolean) => {
    if (!selfShopDispatch) return
    const newChecked = checked
      ? [...selfShopDispatch.checkedItems, itemId]
      : selfShopDispatch.checkedItems.filter(id => id !== itemId)
    const allTotal = selfShopDispatch.items.length
    await updateDoc(doc(db, 'dispatches', selfShopDispatch.id), {
      checkedItems: newChecked,
      status: newChecked.length >= allTotal ? 'complete' : newChecked.length > 0 ? 'shopping' : 'pending',
    })
  }, [selfShopDispatch])

  const selfShopConfirmQty = useCallback(async (itemId: string, qty: number) => {
    if (!selfShopDispatch) return
    await updateDoc(doc(db, 'dispatches', selfShopDispatch.id), { [`confirmedQtys.${itemId}`]: qty })
  }, [selfShopDispatch])

  // Same semantics as the shopper-side checkout: just marks it complete and
  // ready for review — the orderer's Review & Put Away step is what
  // reconciles pantry stock and archives it.
  const selfShopCheckout = useCallback(async () => {
    if (!selfShopDispatch) return
    await updateDoc(doc(db, 'dispatches', selfShopDispatch.id), { status: 'complete' })
    setSelfShopFirestoreId(null)
  }, [selfShopDispatch])

  // Writes/updates the LiveDispatch Firestore doc for the active cart,
  // assigns it to `shopper` (a real family member, or — for self-shopping —
  // the current user), and rotates in a fresh draft cart for this store.
  // Shared by "send to a shopper" and "Shop Now" (self-shop), which only
  // differ in who gets assigned and what status it starts at.
  const dispatchActiveCart = useCallback(async (shopper: Shopper, initialStatus: LiveDispatch['status']): Promise<string | null> => {
    if (activeDispatch.cart.length === 0) return null
    if (activeDispatch.store === 'kroger' && !store) return null
    const items: SharedItem[] = activeDispatch.cart.map((ci) => ({
      id: ci.product.id, qty: ci.quantity, note: ci.note,
      name: ci.product.name, brand: ci.product.brand || '',
      img: ci.product.image, size: ci.product.size, price: ci.product.price,
      aisle: ci.product.aisle || 'Other',
      aisleNum: ci.product.aisleNum || '0',
      seq: ci.product.seq ?? 0,
      store: ci.product.store,
      ...(ci.replacement ? { sub: { id: ci.replacement.productId, name: ci.replacement.description, brand: ci.replacement.brand, img: ci.replacement.img, size: ci.replacement.size, price: ci.replacement.price, qty: ci.replacement.quantity, note: ci.replacement.note } } : {}),
    }))

    const firestoreId = activeDispatch.firestoreId || `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const liveDispatchData: LiveDispatch = {
      id: firestoreId,
      name: activeDispatch.name,
      storeType: activeDispatch.store,
      store: activeDispatch.store === 'kroger' ? store!.name : 'Costco',
      addr: activeDispatch.store === 'kroger' ? `${store!.address.addressLine1}, ${store!.address.city}, ${store!.address.state}` : '',
      locationId: activeDispatch.store === 'kroger' ? store!.locationId : '',
      items,
      note: activeDispatch.note,
      shopperId: shopper.id,
      shopperName: shopper.name,
      createdAt: activeDispatch.firestoreId ? (dispatches.find(d => d.id === activeDispatchId)?.sentAt ?? Date.now()) : Date.now(),
      status: initialStatus,
      checkedItems: [],
      confirmedQtys: {},
      ...(familyId ? { familyId } : {}),
      ...(activeDispatch.tip !== undefined ? { tip: activeDispatch.tip } : { tip: Math.min(20, activeDispatch.cart.reduce((n, i) => n + i.quantity, 0)) }),
    }

    if (activeDispatch.firestoreId) {
      // Update existing — preserve shopper's check-off progress
      await updateDoc(doc(db, 'dispatches', firestoreId), {
        name: activeDispatch.name,
        items,
        note: activeDispatch.note,
        shopperId: shopper.id,
        shopperName: shopper.name,
        status: initialStatus,
        ...(familyId ? { familyId } : {}),
        tip: activeDispatch.tip ?? Math.min(20, activeDispatch.cart.reduce((n, i) => n + i.quantity, 0)),
      })
    } else {
      await setDoc(doc(db, 'dispatches', firestoreId), liveDispatchData)
    }

    setDispatches(prev => {
      const sent = prev.map(d =>
        d.id === activeDispatchId
          ? { ...d, firestoreId, shopperId: shopper.id, shopperName: shopper.name, sentAt: Date.now() }
          : d
      )
      // Sending moves this cart into order history — the store's single
      // active cart concept still needs to resolve to something, so spin
      // up a fresh empty draft right away.
      const { list, id } = ensureDraftDispatch(sent, activeDispatch.store)
      setActiveDispatchId(id)
      return list
    })

    return firestoreId
  }, [store, activeDispatch, activeDispatchId, dispatches, familyId])

  const sendToShopper = useCallback(async (shopper: Shopper) => {
    setSendingShopper(true)
    try {
      const firestoreId = await dispatchActiveCart(shopper, 'pending')
      if (firestoreId) {
        setShopperPickerOpen(false)
        setCartOpen(false)
        setShoppingActive(false)
        setSearchQuery('')
        setProducts([])
      }
    } finally {
      setSendingShopper(false)
    }
  }, [dispatchActiveCart])

  // Self-shopping: assigns the cart to the current user and jumps straight
  // into the same shopping checklist a dedicated shopper would use.
  const shopNow = useCallback(async () => {
    if (!memberId || !memberName) return
    setSendingShopper(true)
    try {
      const self: Shopper = { id: memberId, name: memberName, createdAt: Date.now() }
      const firestoreId = await dispatchActiveCart(self, 'shopping')
      if (firestoreId) {
        setCartOpen(false)
        setShoppingActive(false)
        setSearchQuery('')
        setProducts([])
        setSelfShopFirestoreId(firestoreId)
      }
    } finally {
      setSendingShopper(false)
    }
  }, [dispatchActiveCart, memberId, memberName])


  // ── Auth screens ──────────────────────────────────────────────────────────────
  if (authState === 'loading' || isShopperOnly) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: IC.green }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (authState === 'gate') {
    return <FamilyGateScreen onJoin={() => setAuthState('join')} onCreate={() => setAuthState('create')} />
  }
  if (authState === 'join') {
    return <JoinFamilyScreen onBack={() => setAuthState('gate')} onFound={handleJoinFound} />
  }
  if (authState === 'create') {
    return <CreateFamilyScreen onBack={() => setAuthState('gate')} onCreated={handleFamilyCreated} />
  }
  if (authState === 'select' && joinData) {
    return <SelectMemberScreen members={joinData.members} onSelect={handleMemberSelect} onBack={() => setAuthState('join')} />
  }

  const isAdmin = memberRoles.includes('admin')
  const canShopNow = isAdmin || memberRoles.includes('order')

  if (selfShopFirestoreId && selfShopDispatch) {
    return (
      <DispatchDetailScreen
        dispatch={selfShopDispatch}
        onToggle={selfShopToggleItem}
        onConfirmQty={selfShopConfirmQty}
        onBack={() => setSelfShopFirestoreId(null)}
        onCheckout={selfShopCheckout}
        backLabel="Home"
      />
    )
  }

  if (pantryOpen) {
    return (
      <>
        <PantryView
          items={inventoryItems}
          loading={inventoryLoading}
          error={inventoryError}
          onClose={() => setPantryOpen(false)}
          onSetStatus={handleSetInventoryStatus}
          onAddItem={() => setAddPantryItemOpen(true)}
          onDeleteItem={handleDeleteInventoryItem}
        />
        {addPantryItemOpen && (
          <AddPantryItemModal
            krogerLocation={store}
            onSave={handleAddPantryItem}
            onClose={() => setAddPantryItemOpen(false)}
          />
        )}
        {toast && (
          <Toast
            message={toast.message}
            actionLabel={toast.actionLabel}
            onAction={toast.onAction}
            onDismiss={() => setToast(null)}
          />
        )}
      </>
    )
  }

  if (activeStoreType === 'kroger' && !store) {
    return <StorePicker locationResults={locationResults} isLoading={locationLoading} error={locationError} onSearch={searchLocations} onSelect={selectStore} />
  }

  if (!shoppingActive) {
    return (
      <>
        <HomeScreen
          krogerLocation={store}
          activeStoreType={activeStoreType}
          dispatches={dispatches}
          activeDispatchId={activeDispatchId}
          shoppers={shoppers}
          liveProgress={liveProgress}
          memberName={memberName!}
          memberRoles={memberRoles}
          isAdmin={isAdmin}
          onChangeStoreType={changeStoreType}
          onChangeStore={() => { setStore(null); setLocationResults([]); setProducts([]) }}
          onOpenDispatch={(id) => { setActiveDispatchId(id); setShoppingActive(true) }}
          onDeleteDispatch={deleteHistoryDispatch}
          onManageFamily={() => setAdminPanelOpen(true)}
          onLogout={logout}
          onOpenPantry={() => setPantryOpen(true)}
          onPutAway={(id) => setPutAwayDispatchId(id)}
        />
        {adminPanelOpen && (
          <AdminPanel
            familyId={familyId!}
            members={familyMembers}
            currentMemberId={memberId!}
            onClose={() => setAdminPanelOpen(false)}
          />
        )}
        {putAwayDispatchId && (() => {
          const target = dispatches.find(d => d.id === putAwayDispatchId)
          if (!target) return null
          return (
            <RestockReviewModal
              dispatchLocal={target}
              onSubmit={handleRestockReview}
              onClose={() => setPutAwayDispatchId(null)}
            />
          )
        })()}
      </>
    )
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: IC.cream }}>
      {/* Header */}
      <header className="sticky top-0 z-30 shadow-lg" style={{ backgroundColor: IC.green }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => { setShoppingActive(false); setSearchQuery(''); setProducts([]) }}
            className="flex items-center gap-2.5 active:opacity-75 transition-opacity duration-100"
            aria-label="Back to home"
          >
            <RadarLogoWhite className="w-7 h-7" />
            <div>
              <span className="font-black text-white tracking-[0.12em] uppercase text-base leading-none block">Inner Circle</span>
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase leading-none block" style={{ color: IC.gold }}>Private Dispatch</span>
            </div>
          </button>
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
      {activeStoreType === 'kroger' && store ? (
        <div className="bg-white px-4 py-2.5 flex items-center justify-between shadow-sm" style={{ borderBottom: `1px solid #E5DDD0`, borderLeft: `3px solid ${IC.kroger}` }}>
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
            onClick={() => { setStore(null); setLocationResults([]); setProducts([]); setShoppingActive(false) }}
            className="ml-3 text-xs font-bold active:scale-95 transition-all duration-100 whitespace-nowrap"
            style={{ color: IC.gold }}
          >Change</button>
        </div>
      ) : activeStoreType === 'costco' ? (
        <div className="bg-white px-4 py-2.5 flex items-center gap-2 shadow-sm" style={{ borderBottom: `1px solid #E5DDD0`, borderLeft: `3px solid ${IC.costco}` }}>
          <StoreTag store="costco" />
          <p className="text-xs" style={{ color: IC.textMuted }}>Searching Costco.com nationwide</p>
        </div>
      ) : null}

      {/* Sticky area: search bar */}
      <div className="sticky top-14 z-20 bg-white shadow-sm" style={{ borderBottom: `1px solid #E5DDD0` }}>
        <div className="px-4 py-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="max-w-3xl mx-auto">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${STORE_LABEL[activeStoreType]} products...`}
              className="w-full rounded-2xl pl-11 py-3 text-base focus:outline-none transition-colors duration-150 bg-white"
              style={{ border: `2px solid #E5DDD0`, color: IC.green, paddingRight: searchQuery ? '2.5rem' : '1rem' }}
              onFocus={e => (e.currentTarget.style.borderColor = IC.gold)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5DDD0')}
            />
            {isSearching && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: IC.gold, borderTopColor: 'transparent' }} />
            )}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-70"
                style={{ backgroundColor: '#E5DDD0' }}
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" fill="none" stroke={IC.green} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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

            {activeTab === 'favorites' && (() => {
              const storeFavorites = favorites.filter(f => f.store === activeStoreType)
              return storeFavorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <RadarLogo className="w-20 h-20 opacity-30 mb-5" />
                  <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>No {STORE_LABEL[activeStoreType]} Favorites Yet</p>
                  <p className="text-sm mt-2" style={{ color: IC.textMuted }}>Tap ♡ on any product to save it here</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {storeFavorites.map(fav => (
                    <ProductCard
                      key={fav.productId}
                      product={historyItemToProduct(fav)}
                      cartItem={activeDispatch.cart.find(i => i.product.id === fav.productId)}
                      isFavorite={true}
                      onAdd={addToCart}
                      onUpdateQty={updateQty}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )
            })()}

            {activeTab === 'recent' && (() => {
              const storeHistory = purchaseHistory.filter(h => h.store === activeStoreType)
              return storeHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <RadarLogo className="w-20 h-20 opacity-30 mb-5" />
                  <p className="text-lg font-black uppercase tracking-widest" style={{ color: IC.green }}>No Recent {STORE_LABEL[activeStoreType]} Purchases</p>
                  <p className="text-sm mt-2" style={{ color: IC.textMuted }}>Items will appear here after a shopper checks out</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {storeHistory.map(item => (
                    <div key={item.productId} className="relative">
                      <ProductCard
                        product={historyItemToProduct(item)}
                        cartItem={activeDispatch.cart.find(i => i.product.id === item.productId)}
                        isFavorite={favorites.some(f => f.productId === item.productId && f.store === item.store)}
                        onAdd={addToCart}
                        onUpdateQty={updateQty}
                        onToggleFavorite={toggleFavorite}
                      />
                      <button
                        onClick={() => removeFromHistory(item.productId, item.store)}
                        className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10 active:scale-90 transition-all duration-100"
                        style={{ backgroundColor: '#FEE2E2' }}
                        aria-label="Remove from history"
                      >
                        <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
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
                  key={product.id}
                  product={product}
                  cartItem={activeDispatch.cart.find((i) => i.product.id === product.id)}
                  isFavorite={favorites.some(f => f.productId === product.id && f.store === product.store)}
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

        {/* Fallback for items Costco search can't find */}
        {activeStoreType === 'costco' && searchQuery.trim() && !isSearching && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setCustomItemOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-95"
              style={{ border: `1.5px dashed ${IC.costco}80`, color: IC.costco }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Can&apos;t find it? Add &quot;{searchQuery.trim()}&quot; as custom item
            </button>
          </div>
        )}
      </main>

      {customItemOpen && (
        <CustomItemModal
          initialName={searchQuery.trim()}
          onAdd={addCustomItem}
          onClose={() => setCustomItemOpen(false)}
        />
      )}

      {cartOpen && (
        <CartPanel
          dispatch={activeDispatch}
          onClearCart={clearActiveCart}
          canShopNow={canShopNow}
          onShopNow={shopNow}
          onClose={() => setCartOpen(false)}
          onUpdateQty={updateQty}
          onUpdateNote={updateNote}
          onRemove={removeFromCart}
          onSetNote={setOrderNote}
          onSendDispatch={() => { setCartOpen(false); setShopperPickerOpen(true) }}
          onAddReplacement={(id) => setReplacingForId(id)}
          onRemoveReplacement={removeReplacement}
          onSetTip={setDispatchTip}
          liveCheckedItems={liveProgress[activeDispatchId]?.checkedItems}
        />
      )}

      {replacingForId && (() => {
        const forItem = activeDispatch.cart.find(i => i.product.id === replacingForId)
        if (!forItem) return null
        return (
          <ReplacementPanel
            forItem={forItem} krogerLocation={store} history={purchaseHistory}
            onSelect={(r) => setReplacement(replacingForId, r)}
            onClose={() => setReplacingForId(null)}
          />
        )
      })()}

      {shopperPickerOpen && (
        <ShopperPickerModal
          shoppers={shoppers}
          sending={sendingShopper}
          onSend={sendToShopper}
          onAddShopper={() => { setShopperPickerOpen(false); setAdminPanelOpen(true) }}
          onClose={() => setShopperPickerOpen(false)}
        />
      )}

      {adminPanelOpen && (
        <AdminPanel
          familyId={familyId!}
          members={familyMembers}
          currentMemberId={memberId!}
          onClose={() => setAdminPanelOpen(false)}
        />
      )}
    </div>
  )
}
