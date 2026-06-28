-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "design_id" TEXT,
    "supplier_id" TEXT,
    "product_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION,
    "base_price" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "payment_status" TEXT,
    "currency" TEXT NOT NULL,
    "print_type" TEXT,
    "has_secure_guests" BOOLEAN,
    "shipping_address" TEXT,
    "extra_charges" TEXT,
    "admin_notes" TEXT,
    "customization_notes" TEXT,
    "wristband_size" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_session_id" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "courier" TEXT,
    "estimated_delivery" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "pricing_snapshot_json" TEXT,
    "design_snapshot_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "note" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT,
    "design_name" TEXT,
    "design_url" TEXT NOT NULL,
    "custom_text" TEXT,
    "text_color" TEXT,
    "text_position" TEXT,
    "font_family" TEXT DEFAULT 'Arial',
    "font_size" INTEGER DEFAULT 14,
    "logo_url" TEXT,
    "logo_position" TEXT,
    "logo_scale" DOUBLE PRECISION DEFAULT 1.0,
    "wristband_color" TEXT,
    "wristband_type" TEXT,
    "wristband_size" TEXT DEFAULT 'M',
    "custom_width_mm" DOUBLE PRECISION,
    "inner_text" TEXT,
    "inner_text_color" TEXT DEFAULT '#FFFFFF',
    "pattern" TEXT DEFAULT 'solid',
    "secondary_color" TEXT,
    "clip_art_id" TEXT,
    "clip_art_position" TEXT,
    "canvas_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_images" (
    "id" TEXT NOT NULL,
    "design_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_type" TEXT NOT NULL DEFAULT 'logo',
    "position" TEXT NOT NULL DEFAULT '{"x": 50, "y": 50}',
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "layer_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "address" TEXT,
    "logo_url" TEXT,
    "description" TEXT,
    "website" TEXT,
    "city" TEXT,
    "country" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wristband_type" TEXT NOT NULL,
    "price_usd" DOUBLE PRECISION NOT NULL,
    "price_eur" DOUBLE PRECISION,
    "price_gbp" DOUBLE PRECISION,
    "print_extra_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color_print_extra_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logo_extra_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "design_setup_fee_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "design_setup_fee_eur" DOUBLE PRECISION,
    "design_setup_fee_gbp" DOUBLE PRECISION,
    "qr_code_price_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qr_code_price_eur" DOUBLE PRECISION,
    "qr_code_price_gbp" DOUBLE PRECISION,
    "trademark_fee_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trademark_fee_eur" DOUBLE PRECISION,
    "trademark_fee_gbp" DOUBLE PRECISION,
    "min_order_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_order_quantity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "image_urls" TEXT NOT NULL DEFAULT '[]',
    "allows_custom_text" BOOLEAN NOT NULL DEFAULT true,
    "allows_custom_color" BOOLEAN NOT NULL DEFAULT true,
    "allows_logo_upload" BOOLEAN NOT NULL DEFAULT true,
    "allows_inner_text" BOOLEAN NOT NULL DEFAULT false,
    "available_sizes" TEXT NOT NULL DEFAULT '["S","M","L","XL"]',
    "available_colors" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_pricing_tiers" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "price_per_unit_usd" DOUBLE PRECISION NOT NULL,
    "price_per_unit_eur" DOUBLE PRECISION,
    "price_per_unit_gbp" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "wristband_type" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "base_price_usd" DOUBLE PRECISION NOT NULL,
    "base_price_eur" DOUBLE PRECISION NOT NULL,
    "base_price_gbp" DOUBLE PRECISION NOT NULL,
    "black_print_extra_usd" DOUBLE PRECISION NOT NULL,
    "black_print_extra_eur" DOUBLE PRECISION NOT NULL,
    "black_print_extra_gbp" DOUBLE PRECISION NOT NULL,
    "full_color_print_extra_usd" DOUBLE PRECISION NOT NULL,
    "full_color_print_extra_eur" DOUBLE PRECISION NOT NULL,
    "full_color_print_extra_gbp" DOUBLE PRECISION NOT NULL,
    "secure_guests_extra_usd" DOUBLE PRECISION NOT NULL,
    "secure_guests_extra_eur" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_user_id_key" ON "suppliers"("user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_images" ADD CONSTRAINT "design_images_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_pricing_tiers" ADD CONSTRAINT "supplier_pricing_tiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
