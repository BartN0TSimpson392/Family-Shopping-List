-- Tracks how many units of an item are on hand, so the "Review & Put Away"
-- reconciliation can increment stock instead of just flipping a status flag.
-- Run after 0003_inventory_items_size.sql.

alter table inventory_items
  add column if not exists quantity integer not null default 1;

-- Atomic "restock" upsert: PostgREST's client-side .upsert() can't express
-- "add to the existing quantity" on conflict (it just replaces the row), so
-- the increment has to happen inside a function instead of a read-then-write
-- from the client, which would race under concurrent put-aways.
create or replace function restock_inventory_item(
  p_name text,
  p_brand text,
  p_image_url text,
  p_store text,
  p_original_product_id text,
  p_size text,
  p_unit_price numeric,
  p_quantity integer
)
returns inventory_items
language plpgsql
as $$
declare
  result inventory_items;
begin
  insert into inventory_items (name, brand, image_url, store, original_product_id, size, unit_price, quantity, status, last_restocked_at)
  values (p_name, p_brand, p_image_url, p_store, p_original_product_id, p_size, p_unit_price, greatest(p_quantity, 1), 'in_stock', now())
  on conflict (store, original_product_id)
  do update set
    name = excluded.name,
    brand = excluded.brand,
    image_url = excluded.image_url,
    size = excluded.size,
    unit_price = excluded.unit_price,
    quantity = inventory_items.quantity + greatest(p_quantity, 1),
    status = 'in_stock',
    last_restocked_at = now()
  returning * into result;
  return result;
end;
$$;

grant execute on function restock_inventory_item(text, text, text, text, text, text, numeric, integer) to anon, authenticated;
