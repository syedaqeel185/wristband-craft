-- Make supplier_id nullable on orders
ALTER TABLE orders ALTER COLUMN supplier_id DROP NOT NULL;

-- Allow inserting suppliers without user_id constraint for now
ALTER TABLE suppliers ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_user_id_key;