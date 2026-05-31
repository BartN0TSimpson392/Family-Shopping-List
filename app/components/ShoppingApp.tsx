'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, setDoc, updateDoc, onSnapshot, getDoc, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { KrogerLocation, KrogerProduct, CartItem, CartReplacement, HistoryItem, SharedItem, Dispatch, Shopper, LiveDispatch, FamilyMember, MemberRole } from '@/lib/types'

const HISTORY_KEY = 'ic-purchase-history'
const FAVORITES_KEY = 'ic-favorites'
const STORE_KEY = 'ic-store'
const DISPATCHES_KEY = 'ic-dispatches'
const COUNTER_KEY = 'ic-dispatch-counter'
const FAMILY_ID_KEY = 'ic-family-id'
const MEMBER_ID_KEY = 'ic-member-id'
const MEMBER_NAME_KEY = 'ic-member-name'
const MEMBER_ROLES_KEY = 'ic-member-roles'

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
function loadStore(): KrogerLocation | null {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') } catch { return null }
}
function saveStore(s: KrogerLocation | null) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
function loadDispatches(): Dispatch[] | null {
  try { return JSON.parse(localStorage.getItem(DISPATCHES_KEY) ?? 'null') } catch { return null }
}
function saveDispatches(d: Dispatch[]) {
  try { localStorage.setItem(DISPATCHES_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}
function loadCounter(): number {
  try { return parseInt(localStorage.getItem(COUNTER_KEY) ?? '2', 10) } catch { return 2 }
}
function saveCounter(n: number) {
  try { localStorage.setItem(COUNTER_KEY, String(n)) } catch { /* ignore */ }
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
  store, dispatches, activeDispatchId, shoppers, liveProgress,
  memberName, memberRoles, isAdmin,
  onChangeStore, onOpenDispatch, onAddDispatch, onDeleteDispatch, onClearAllDispatches, onManageFamily, onLogout,
}: {
  store: KrogerLocation
  dispatches: Dispatch[]
  activeDispatchId: string
  shoppers: Shopper[]
  liveProgress: Record<string, { checked: number; total: number; checkedItems: string[] }>
  memberName: string
  memberRoles: MemberRole[]
  isAdmin: boolean
  onChangeStore: () => void
  onOpenDispatch: (id: string) => void
  onAddDispatch: () => void
  onDeleteDispatch: (id: string) => void
  onClearAllDispatches: () => void
  onManageFamily: () => void
  onLogout: () => void
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

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
        {/* Store card */}
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm" style={{ border: '1px solid #E5DDD0' }}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: IC.textMuted }}>Your Store</p>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base" style={{ color: IC.green }}>{store.name}</p>
              <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>
                {store.address.addressLine1}, {store.address.city}, {store.address.state}
              </p>
            </div>
            <button
              onClick={onChangeStore}
              className="text-xs font-bold flex-shrink-0 active:scale-95 transition-all duration-100"
              style={{ color: IC.gold }}
            >Change Store</button>
          </div>
        </div>

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

        {/* Dispatches */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: IC.textMuted }}>Your Dispatches</p>
            {dispatches.length > 1 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="text-xs font-bold active:scale-95 transition-all duration-100"
                style={{ color: '#EF4444' }}
              >Clear All</button>
            )}
          </div>
          <div className="space-y-2">
            {dispatches.map(d => {
              const itemCount = d.cart.reduce((n, i) => n + i.quantity, 0)
              const total = d.cart.reduce((sum, i) => sum + getPrice(i.product) * i.quantity, 0)
              const isActive = d.id === activeDispatchId
              const progress = d.firestoreId ? liveProgress[d.id] : null
              return (
                <div
                  key={d.id}
                  className="w-full bg-white rounded-2xl px-5 py-4 flex items-center justify-between text-left transition-all duration-150 shadow-sm cursor-pointer active:scale-[0.98]"
                  style={{ border: isActive ? `2px solid ${IC.gold}` : '1px solid #E5DDD0' }}
                  onClick={() => { setPendingDeleteId(null); onOpenDispatch(d.id) }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-base" style={{ color: IC.green }}>{d.name}</p>
                      {d.shopperName && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${IC.gold}20`, color: IC.gold }}>
                          → {d.shopperName}
                        </span>
                      )}
                    </div>
                    {progress ? (
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
                      <p className="text-sm mt-0.5" style={{ color: IC.textMuted }}>
                        {itemCount === 0
                          ? 'Empty — tap to start adding items'
                          : `${itemCount} item${itemCount !== 1 ? 's' : ''}${total > 0 ? ` · $${total.toFixed(2)} est.` : ''}`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                    {dispatches.length > 1 && (
                      pendingDeleteId === d.id ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteDispatch(d.id); setPendingDeleteId(null) }}
                          className="text-xs font-black px-2.5 py-1 rounded-xl active:scale-95 transition-all duration-100"
                          style={{ backgroundColor: '#FEE2E2', color: '#EF4444' }}
                        >Delete?</button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingDeleteId(d.id) }}
                          className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all duration-100"
                          style={{ backgroundColor: IC.cream }}
                          aria-label="Delete dispatch"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="#9B8470" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )
                    )}
                    <svg className="w-5 h-5" fill="none" stroke={IC.gold} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )
            })}

            <button
              onClick={onAddDispatch}
              className="w-full rounded-2xl px-5 py-4 flex items-center gap-2 transition-all duration-150 active:scale-[0.98]"
              style={{ border: `1.5px dashed ${IC.gold}`, color: IC.gold }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-bold text-sm">New Dispatch</span>
            </button>
          </div>
        </div>

        <button
          onClick={() => onOpenDispatch(activeDispatchId)}
          className="w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase text-white transition-all duration-150 active:scale-[0.97] shadow-md"
          style={{ backgroundColor: IC.green }}
        >
          Start Shopping →
        </button>
      </div>

      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmClearAll(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FEE2E2' }}>
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="font-black text-lg uppercase tracking-wider mb-2" style={{ color: IC.green }}>Delete All Dispatches?</p>
            <p className="text-sm mb-6" style={{ color: IC.textMuted }}>
              All {dispatches.length} dispatches will be permanently deleted. This cannot be undone.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { onClearAllDispatches(); setConfirmClearAll(false) }}
                className="w-full py-3.5 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-150 active:scale-[0.97] text-white"
                style={{ backgroundColor: '#EF4444' }}
              >Delete All</button>
              <button
                onClick={() => setConfirmClearAll(false)}
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
  onClose, onUpdateQty, onUpdateNote, onRemove, onSendDispatch,
  onAddReplacement, onRemoveReplacement, onSetNote, liveCheckedItems,
}: {
  dispatch: Dispatch
  canDelete: boolean
  onRename: (name: string) => void
  onDeleteDispatch: () => void
  onClose: () => void
  onUpdateQty: (id: string, qty: number) => void
  onUpdateNote: (id: string, note: string) => void
  onRemove: (id: string) => void
  onSendDispatch: () => void
  onAddReplacement: (productId: string) => void
  onRemoveReplacement: (productId: string) => void
  onSetNote: (note: string) => void
  liveCheckedItems?: string[]
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
            const isCollected = liveCheckedItems?.includes(item.product.productId)
            return (
              <div key={item.product.productId} className="rounded-2xl p-3" style={{ backgroundColor: isCollected ? `${IC.green}08` : IC.cream, border: isCollected ? `1px solid ${IC.green}30` : '1px solid #E5DDD0' }}>
                <div className="flex gap-3">
                  {imgUrl && (
                    <img src={imgUrl} alt={item.product.description} loading="lazy" className={`w-14 h-14 object-contain flex-shrink-0${isCollected ? ' opacity-50' : ''}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <p className={`text-sm font-bold leading-tight${isCollected ? ' line-through opacity-60' : ''}`} style={{ color: IC.green }}>{item.product.description}</p>
                      {isCollected && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${IC.green}20`, color: IC.green }}>✓ Collected</span>
                      )}
                    </div>
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
            onClick={onSendDispatch}
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
  const [shoppingActive, setShoppingActive] = useState(false)
  const [locationResults, setLocationResults] = useState<KrogerLocation[]>([])
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

  const [shoppers, setShoppers] = useState<Shopper[]>([])
  const [shopperPickerOpen, setShopperPickerOpen] = useState(false)
  const [sendingShopper, setSendingShopper] = useState(false)
  const [liveProgress, setLiveProgress] = useState<Record<string, { checked: number; total: number; checkedItems: string[] }>>({})

  const [replacingForId, setReplacingForId] = useState<string | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<HistoryItem[]>([])
  const [favorites, setFavorites] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'favorites' | 'recent'>('favorites')

  // Load persisted data on mount + check family session
  useEffect(() => {
    setPurchaseHistory(loadHistory())
    setFavorites(loadFavorites())
    const savedStore = loadStore()
    const savedDispatches = loadDispatches()
    const savedCounter = loadCounter()
    if (savedStore) setStore(savedStore)
    if (savedDispatches && savedDispatches.length > 0) {
      setDispatches(savedDispatches)
      setActiveDispatchId(savedDispatches[0].id)
      dispatchCounter.current = savedCounter
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
    saveCounter(dispatchCounter.current)
    const d: Dispatch = { id: `dispatch-${Date.now()}`, name: `Dispatch ${num}`, cart: [], note: '' }
    setDispatches(prev => [...prev, d])
    setActiveDispatchId(d.id)
    setShoppingActive(true)
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

  const clearAllDispatches = useCallback(() => {
    dispatches.forEach(d => {
      if (d.firestoreId) deleteDoc(doc(db, 'dispatches', d.firestoreId)).catch(() => {})
    })
    const fresh: Dispatch = { id: `dispatch-${Date.now()}`, name: 'Dispatch 1', cart: [], note: '' }
    dispatchCounter.current = 2
    saveCounter(2)
    setDispatches([fresh])
    setActiveDispatchId(fresh.id)
    setShoppingActive(false)
  }, [dispatches])

  const setOrderNote = useCallback((note: string) => {
    updateActiveDispatch(d => ({ ...d, note }))
  }, [updateActiveDispatch])

  const toggleFavorite = useCallback((product: KrogerProduct) => {
    const fav: HistoryItem = {
      productId: product.productId,
      description: product.description,
      brand: product.brand || '',
      img: getProductImage(product, 'thumbnail') || getProductImage(product, 'small'),
      size: product.items?.[0]?.size ?? '',
      price: product.items?.[0]?.price?.regular ?? 0,
    }
    if (familyId) {
      const isFav = favorites.some(f => f.productId === product.productId)
      if (isFav) {
        deleteDoc(doc(db, 'families', familyId, 'favorites', product.productId))
      } else {
        setDoc(doc(db, 'families', familyId, 'favorites', product.productId), fav)
      }
    } else {
      setFavorites(prev => {
        const isFav = prev.some(f => f.productId === product.productId)
        const next = isFav ? prev.filter(f => f.productId !== product.productId) : [...prev, fav]
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
            },
          }))
        }
      })
    )
    return () => unsubs.forEach(u => u())
  }, [dispatches])

  const sendToShopper = useCallback(async (shopper: Shopper) => {
    if (!store || activeDispatch.cart.length === 0) return
    setSendingShopper(true)
    try {
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

      const firestoreId = activeDispatch.firestoreId || `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      const liveDispatchData: LiveDispatch = {
        id: firestoreId,
        name: activeDispatch.name,
        store: store.name,
        addr: `${store.address.addressLine1}, ${store.address.city}, ${store.address.state}`,
        locationId: store.locationId,
        items,
        note: activeDispatch.note,
        shopperId: shopper.id,
        shopperName: shopper.name,
        createdAt: activeDispatch.firestoreId ? (dispatches.find(d => d.id === activeDispatchId)?.sentAt ?? Date.now()) : Date.now(),
        status: 'pending',
        checkedItems: [],
        confirmedQtys: {},
        ...(familyId ? { familyId } : {}),
      }

      if (activeDispatch.firestoreId) {
        // Update existing — preserve shopper's check-off progress
        await updateDoc(doc(db, 'dispatches', firestoreId), {
          name: activeDispatch.name,
          items,
          note: activeDispatch.note,
          shopperId: shopper.id,
          shopperName: shopper.name,
          status: 'pending',
          ...(familyId ? { familyId } : {}),
        })
      } else {
        await setDoc(doc(db, 'dispatches', firestoreId), liveDispatchData)
      }

      setDispatches(prev => prev.map(d =>
        d.id === activeDispatchId
          ? { ...d, firestoreId, shopperId: shopper.id, shopperName: shopper.name, sentAt: Date.now() }
          : d
      ))
      setShopperPickerOpen(false)
      setCartOpen(false)
      setShoppingActive(false)
      setSearchQuery('')
      setProducts([])
    } finally {
      setSendingShopper(false)
    }
  }, [store, activeDispatch, activeDispatchId, dispatches])


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

  if (!store) {
    return <StorePicker locationResults={locationResults} isLoading={locationLoading} error={locationError} onSearch={searchLocations} onSelect={selectStore} />
  }

  if (!shoppingActive) {
    return (
      <>
        <HomeScreen
          store={store}
          dispatches={dispatches}
          activeDispatchId={activeDispatchId}
          shoppers={shoppers}
          liveProgress={liveProgress}
          memberName={memberName!}
          memberRoles={memberRoles}
          isAdmin={isAdmin}
          onChangeStore={() => { setStore(null); setLocationResults([]); setProducts([]) }}
          onOpenDispatch={(id) => { setActiveDispatchId(id); setShoppingActive(true) }}
          onAddDispatch={addDispatch}
          onDeleteDispatch={deleteDispatch}
          onClearAllDispatches={clearAllDispatches}
          onManageFamily={() => setAdminPanelOpen(true)}
          onLogout={logout}
        />
        {adminPanelOpen && (
          <AdminPanel
            familyId={familyId!}
            members={familyMembers}
            currentMemberId={memberId!}
            onClose={() => setAdminPanelOpen(false)}
          />
        )}
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
            onClick={() => { setStore(null); setLocationResults([]); setProducts([]); setShoppingActive(false) }}
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
                const progress = d.firestoreId ? liveProgress[d.id] : null
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
                    {progress ? (
                      <span
                        className="text-xs font-black rounded-full px-1.5 h-5 flex items-center justify-center flex-shrink-0 gap-0.5"
                        style={{ backgroundColor: isActive ? IC.gold : '#C8BFB0', color: 'white' }}
                      >
                        {progress.checked}/{progress.total}
                      </span>
                    ) : count > 0 && (
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
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
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
          onSendDispatch={() => { setCartOpen(false); setShopperPickerOpen(true) }}
          onAddReplacement={(id) => setReplacingForId(id)}
          onRemoveReplacement={removeReplacement}
          liveCheckedItems={liveProgress[activeDispatchId]?.checkedItems}
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
