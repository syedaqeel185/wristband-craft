-- Add new pricing and configuration fields to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS base_price numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS print_type text CHECK (print_type IN ('none', 'black', 'full_color')) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS has_secure_guests boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS extra_charges jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS admin_notes text;

-- Update orders status to include more states
ALTER TABLE public.orders 
DROP CONSTRAINT IF EXISTS orders_status_check,
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'approved', 'declined', 'processing', 'completed', 'cancelled'));

-- Add name field to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name text;

-- Create pricing configuration table for dynamic pricing
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_quantity integer NOT NULL DEFAULT 1000,
  base_price_usd numeric NOT NULL,
  base_price_eur numeric NOT NULL,
  base_price_gbp numeric NOT NULL,
  black_print_extra_usd numeric NOT NULL DEFAULT 0,
  black_print_extra_eur numeric NOT NULL DEFAULT 0,
  black_print_extra_gbp numeric NOT NULL DEFAULT 0,
  full_color_print_extra_usd numeric NOT NULL DEFAULT 10,
  full_color_print_extra_eur numeric NOT NULL DEFAULT 9,
  full_color_print_extra_gbp numeric NOT NULL DEFAULT 8,
  secure_guests_extra_usd numeric NOT NULL DEFAULT 5,
  secure_guests_extra_eur numeric NOT NULL DEFAULT 4.5,
  secure_guests_extra_gbp numeric NOT NULL DEFAULT 4,
  wristband_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on pricing_config
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read pricing
CREATE POLICY "Anyone can view pricing"
ON public.pricing_config FOR SELECT
USING (true);

-- Only admins can modify pricing
CREATE POLICY "Admins can manage pricing"
ON public.pricing_config FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default pricing for different wristband types
INSERT INTO public.pricing_config (wristband_type, base_price_usd, base_price_eur, base_price_gbp, black_print_extra_usd, black_print_extra_eur, black_print_extra_gbp)
VALUES 
  ('silicone', 1.50, 1.40, 1.20, 0.30, 0.28, 0.25),
  ('fabric', 1.80, 1.65, 1.45, 0.35, 0.32, 0.28),
  ('vinyl', 1.65, 1.50, 1.30, 0.32, 0.30, 0.26),
  ('tyvek', 0.90, 0.85, 0.75, 0.25, 0.23, 0.20)
ON CONFLICT DO NOTHING;

-- Trigger for pricing_config updated_at
CREATE TRIGGER update_pricing_config_updated_at
BEFORE UPDATE ON public.pricing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();