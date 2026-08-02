-- EUP pricing layer: fixed prices per 1000 pcs, freight billed on top, and the
-- production SLA clock that starts when the supplier pays.

-- ---------------------------------------------------------------------------
-- EUP price lists. A row with supplier_id = NULL is EUP's default price for a
-- product; a row with a supplier_id overrides it for that supplier. No price
-- resolving => the product is not orderable by that supplier.
-- ---------------------------------------------------------------------------
CREATE TABLE "eup_prices" (
    "id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "price_per_1000_eur" DOUBLE PRECISION NOT NULL,
    "price_per_1000_usd" DOUBLE PRECISION,
    "price_per_1000_gbp" DOUBLE PRECISION,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eup_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eup_prices_wholesaler_id_product_id_supplier_id_key"
    ON "eup_prices"("wholesaler_id", "product_id", "supplier_id");
CREATE INDEX "eup_prices_wholesaler_id_idx" ON "eup_prices"("wholesaler_id");
CREATE INDEX "eup_prices_product_id_idx" ON "eup_prices"("product_id");

ALTER TABLE "eup_prices" ADD CONSTRAINT "eup_prices_wholesaler_id_fkey"
    FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eup_prices" ADD CONSTRAINT "eup_prices_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eup_prices" ADD CONSTRAINT "eup_prices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- EUP freight. Billed on top of goods, never baked into the price above.
-- fulfilment_mode: SHIP_TO_SUPPLIER | DROP_SHIP | ANY
-- ---------------------------------------------------------------------------
CREATE TABLE "eup_freight_rates" (
    "id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "country_code" TEXT,
    "fulfilment_mode" TEXT NOT NULL DEFAULT 'ANY',
    "label" TEXT,
    "price_per_1000_eur" DOUBLE PRECISION NOT NULL,
    "price_per_1000_usd" DOUBLE PRECISION,
    "price_per_1000_gbp" DOUBLE PRECISION,
    "min_charge_eur" DOUBLE PRECISION,
    "min_charge_usd" DOUBLE PRECISION,
    "min_charge_gbp" DOUBLE PRECISION,
    "free_over_qty" INTEGER,
    "est_min_days" INTEGER,
    "est_max_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eup_freight_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eup_freight_rates_wholesaler_id_idx" ON "eup_freight_rates"("wholesaler_id");
CREATE INDEX "eup_freight_rates_supplier_id_idx" ON "eup_freight_rates"("supplier_id");

ALTER TABLE "eup_freight_rates" ADD CONSTRAINT "eup_freight_rates_wholesaler_id_fkey"
    FOREIGN KEY ("wholesaler_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eup_freight_rates" ADD CONSTRAINT "eup_freight_rates_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Wholesale orders: goods/freight split + the production SLA clock.
-- ---------------------------------------------------------------------------
ALTER TABLE "wholesale_orders" ADD COLUMN "eup_price_per_1000" DOUBLE PRECISION;
ALTER TABLE "wholesale_orders" ADD COLUMN "goods_total" DOUBLE PRECISION;
ALTER TABLE "wholesale_orders" ADD COLUMN "freight_total" DOUBLE PRECISION;
ALTER TABLE "wholesale_orders" ADD COLUMN "freight_rate_id" TEXT;
ALTER TABLE "wholesale_orders" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "wholesale_orders" ADD COLUMN "production_started_at" TIMESTAMP(3);
ALTER TABLE "wholesale_orders" ADD COLUMN "promised_delivery_at" TIMESTAMP(3);

-- Backfill the SLA clock for orders already paid: we do not know the real
-- payment timestamp, so anchor on updated_at rather than inventing one.
UPDATE "wholesale_orders"
   SET "paid_at" = "updated_at",
       "promised_delivery_at" = "updated_at" + INTERVAL '7 days'
 WHERE "payment_status" = 'paid' AND "paid_at" IS NULL;
