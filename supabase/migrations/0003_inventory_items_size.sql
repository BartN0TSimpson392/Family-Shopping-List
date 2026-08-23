-- Adds package-size storage so barcode-matched official store products
-- (e.g. Kroger's `size` field) can be preserved end-to-end, not just
-- name/brand/image/price. Run after 0002_inventory_items_barcode.sql.

alter table inventory_items
  add column if not exists size text;
