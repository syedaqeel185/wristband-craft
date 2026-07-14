-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_method_provider" TEXT,
ADD COLUMN     "payment_receipt_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "payment_receipt_url" TEXT;
