import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// `createClient` throws synchronously on a missing/invalid URL, which would
// crash the whole app at import time before credentials are ever set up —
// so only construct the client when both env vars are actually present.
// Callers (lib/inventory.ts) check `isSupabaseConfigured` and surface a
// clear "not configured" state instead of a hard crash.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = supabase !== null
