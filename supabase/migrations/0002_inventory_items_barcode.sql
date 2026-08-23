-- Adds barcode storage for items added via the "Add Pantry Item" barcode
-- scanner. Run in the Supabase SQL Editor after 0001_inventory_items.sql.

alter table inventory_items
  add column if not exists barcode text;

create index if not exists inventory_items_barcode_idx on inventory_items (barcode);
