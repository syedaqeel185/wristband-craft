-- Wholesale order payments: buyer supplier pays the wholesaler (mirrors customer→supplier).
-- Additive columns only.
ALTER TABLE "wholesale_orders"
  ADD COLUMN "payment_method_provider" TEXT,
  ADD COLUMN "payment_receipt_url" TEXT,
  ADD COLUMN "payment_receipt_uploaded_at" TIMESTAMP(3),
  ADD COLUMN "stripe_session_id" TEXT,
  ADD COLUMN "stripe_payment_intent_id" TEXT;
