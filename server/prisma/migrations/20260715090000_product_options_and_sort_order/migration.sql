-- Supplier-controlled product ordering
ALTER TABLE "products" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Dynamic, supplier-configured customization add-ons (replaces fixed add-on columns)
CREATE TABLE "product_options" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "group_name" TEXT,
    "pricing_mode" TEXT NOT NULL DEFAULT 'per_unit',
    "price_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_eur" DOUBLE PRECISION,
    "price_gbp" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "studio_module" TEXT NOT NULL DEFAULT 'toggle',
    "choices_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_options_product_id_idx" ON "product_options"("product_id");

CREATE UNIQUE INDEX "product_options_product_id_key_key" ON "product_options"("product_id", "key");

ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Give existing products a stable initial ordering per supplier (oldest first)
UPDATE "products" p SET "sort_order" = ranked.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY supplier_id ORDER BY created_at ASC)) - 1 AS rn
  FROM "products"
) ranked
WHERE p.id = ranked.id;
