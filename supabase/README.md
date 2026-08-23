# Family Pantry Inventory — Supabase setup

The Pantry feature needs a Supabase project. To wire it up:

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open the **SQL Editor** in your project and run `migrations/0001_inventory_items.sql` (paste the whole file and hit Run). This creates the `inventory_items` table, RLS policies, and enables Realtime on it.
3. In your project's **Settings → API**, copy the **Project URL** and the **anon public** key.
4. Add them to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Restart the dev server. The Pantry tab (from the home screen header) will start working once both vars are set — until then it shows a "Supabase isn't configured yet" message instead of crashing.

**Note on access control:** this app doesn't use Supabase Auth — household members authenticate through the existing Firestore-backed family ID + password gate, the same as everything else in the app. The RLS policies here are open to the `anon` key, matching that trust model (not a stricter per-household lock). If you want real row-level isolation between different families later, that needs either a server route in front of this table or Supabase Auth wired up with a `household_id` column.
