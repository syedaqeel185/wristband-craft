-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "courier" TEXT NOT NULL,
    "label" TEXT,
    "free_over_qty" INTEGER,
    "est_min_days" INTEGER,
    "est_max_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rate_tiers" (
    "id" TEXT NOT NULL,
    "shipping_rate_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "price_eur" DOUBLE PRECISION NOT NULL,
    "price_usd" DOUBLE PRECISION,
    "price_gbp" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_rate_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_rates_supplier_id_idx" ON "shipping_rates"("supplier_id");

-- CreateIndex
CREATE INDEX "shipping_rate_tiers_shipping_rate_id_idx" ON "shipping_rate_tiers"("shipping_rate_id");

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rate_tiers" ADD CONSTRAINT "shipping_rate_tiers_shipping_rate_id_fkey" FOREIGN KEY ("shipping_rate_id") REFERENCES "shipping_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
