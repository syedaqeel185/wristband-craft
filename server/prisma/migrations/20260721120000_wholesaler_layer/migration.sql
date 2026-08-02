-- Wholesaler layer: supplier flags + assignment, discounts, offers, wholesale orders.
-- Fully additive and backward-compatible (new columns default, new tables).

-- AlterTable: Supplier wholesaler / production model
ALTER TABLE "suppliers"
  ADD COLUMN "is_wholesaler" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_house_wholesaler" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "has_own_production" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "wholesaler_id" TEXT;

CREATE INDEX "suppliers_is_wholesaler_idx" ON "suppliers"("is_wholesaler");
CREATE INDEX "suppliers_wholesaler_id_idx" ON "suppliers"("wholesaler_id");

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_wholesaler_id_fkey"
  FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: supplier_discounts
CREATE TABLE "supplier_discounts" (
  "id" TEXT NOT NULL,
  "wholesaler_id" TEXT NOT NULL,
  "supplier_id" TEXT,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_discounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_discounts_wholesaler_id_supplier_id_key"
  ON "supplier_discounts"("wholesaler_id", "supplier_id");
CREATE INDEX "supplier_discounts_wholesaler_id_idx" ON "supplier_discounts"("wholesaler_id");

ALTER TABLE "supplier_discounts"
  ADD CONSTRAINT "supplier_discounts_wholesaler_id_fkey"
  FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_discounts"
  ADD CONSTRAINT "supplier_discounts_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: wholesaler_offers
CREATE TABLE "wholesaler_offers" (
  "id" TEXT NOT NULL,
  "wholesaler_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "discount_percent" DOUBLE PRECISION,
  "code" TEXT,
  "min_quantity" INTEGER,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wholesaler_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wholesaler_offers_wholesaler_id_idx" ON "wholesaler_offers"("wholesaler_id");

ALTER TABLE "wholesaler_offers"
  ADD CONSTRAINT "wholesaler_offers_wholesaler_id_fkey"
  FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: wholesale_orders
CREATE TABLE "wholesale_orders" (
  "id" TEXT NOT NULL,
  "buyer_supplier_id" TEXT NOT NULL,
  "wholesaler_id" TEXT NOT NULL,
  "product_id" TEXT,
  "source_order_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "list_unit_price" DOUBLE PRECISION,
  "unit_price" DOUBLE PRECISION,
  "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_price" DOUBLE PRECISION NOT NULL,
  "options_json" TEXT,
  "pricing_snapshot_json" TEXT,
  "fulfilment_mode" TEXT NOT NULL DEFAULT 'SHIP_TO_SUPPLIER',
  "customer_info_json" TEXT,
  "shipping_address" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLACED',
  "payment_status" TEXT,
  "tracking_number" TEXT,
  "tracking_url" TEXT,
  "courier" TEXT,
  "notes" TEXT,
  "admin_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wholesale_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wholesale_orders_buyer_supplier_id_idx" ON "wholesale_orders"("buyer_supplier_id");
CREATE INDEX "wholesale_orders_wholesaler_id_idx" ON "wholesale_orders"("wholesaler_id");
CREATE INDEX "wholesale_orders_source_order_id_idx" ON "wholesale_orders"("source_order_id");

ALTER TABLE "wholesale_orders"
  ADD CONSTRAINT "wholesale_orders_buyer_supplier_id_fkey"
  FOREIGN KEY ("buyer_supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wholesale_orders"
  ADD CONSTRAINT "wholesale_orders_wholesaler_id_fkey"
  FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
