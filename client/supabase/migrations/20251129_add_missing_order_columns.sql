-- Add missing columns to orders table for design customization tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS has_qr_code boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_print boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_trademark boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS trademark_text text,
ADD COLUMN IF NOT EXISTS trademark_text_color text DEFAULT 'black';

-- Add canvas_json to store the design canvas state
ALTER TABLE public.designs
ADD COLUMN IF NOT EXISTS canvas_json jsonb;

-- Create index for faster order lookups by payment status
CREATE INDEX IF NOT EXISTS idx_orders_user_payment ON public.orders(user_id, payment_status);

-- Add comment to clarify the extra_charges structure
COMMENT ON COLUMN public.orders.extra_charges IS 'JSON object containing optional charges: {print: number, trademark: number, qrCode: number, express: number}';
