-- Family Pantry Inventory
-- Run this once in the Supabase SQL Editor for your project (or via
-- `supabase db push` if you've set up the Supabase CLI locally).

create extension if not exists pgcrypto;

create table if not exists inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  brand                text,
  image_url            text,
  store                text not null check (store in ('kroger', 'costco', 'other')),
  status               text not null default 'in_stock' check (status in ('in_stock', 'running_low', 'out_of_stock')),
  original_product_id  text,
  unit_price           numeric,
  last_restocked_at    timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Lets "Put Away Groceries" upsert by (store, original_product_id) instead of
-- creating a duplicate row for an item that's already tracked. A plain
-- (non-partial) unique constraint is used deliberately: Postgres treats every
-- NULL as distinct from every other NULL, so manually-added items without an
-- original_product_id never collide with each other.
alter table inventory_items
  drop constraint if exists inventory_items_store_product_key;
alter table inventory_items
  add constraint inventory_items_store_product_key unique (store, original_product_id);

create index if not exists inventory_items_status_idx on inventory_items (status);
create index if not exists inventory_items_name_idx on inventory_items (lower(name));

create or replace function inventory_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_touch_updated_at on inventory_items;
create trigger inventory_items_touch_updated_at
  before update on inventory_items
  for each row
  execute function inventory_items_set_updated_at();

alter table inventory_items enable row level security;

-- Inner Circle authenticates households through a Firestore-backed family
-- ID + password gate, not Supabase Auth, so there's no `auth.uid()` to scope
-- these policies to. Access is opened to the anon key instead — the same
-- trust model the rest of the app already uses (the Firebase client config
-- and Firestore access are equally open, gated only by knowing the family
-- ID + password). If you need real per-household row isolation later, put a
-- server route in front of this table or add Supabase Auth and rewrite
-- these policies around auth.uid()/a household_id column.
drop policy if exists "Household can read inventory" on inventory_items;
create policy "Household can read inventory" on inventory_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Household can insert inventory" on inventory_items;
create policy "Household can insert inventory" on inventory_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Household can update inventory" on inventory_items;
create policy "Household can update inventory" on inventory_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Household can delete inventory" on inventory_items;
create policy "Household can delete inventory" on inventory_items
  for delete
  to anon, authenticated
  using (true);

-- Realtime so every family member's Pantry view stays in sync as items are
-- put away or re-flagged running low / out of stock.
alter publication supabase_realtime add table inventory_items;
