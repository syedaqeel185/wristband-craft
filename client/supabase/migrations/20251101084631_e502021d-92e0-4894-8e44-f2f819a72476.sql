-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Suppliers can view their own profile
CREATE POLICY "Suppliers can view own profile"
ON public.suppliers FOR SELECT
USING (auth.uid() = user_id);

-- Suppliers can update their own profile
CREATE POLICY "Suppliers can update own profile"
ON public.suppliers FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all suppliers
CREATE POLICY "Admins can view all suppliers"
ON public.suppliers FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage suppliers
CREATE POLICY "Admins can manage suppliers"
ON public.suppliers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add supplier_id to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

-- Add payment_status to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_supplier_id ON public.orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);

-- Update RLS policies for orders to allow suppliers to see their orders
CREATE POLICY "Suppliers can view their orders"
ON public.orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE suppliers.id = orders.supplier_id
    AND suppliers.user_id = auth.uid()
  )
);

-- Add supplier role to app_role enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
  
  -- Add supplier to enum if it doesn't exist
  BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supplier';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Trigger to update updated_at on suppliers
CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_suppliers_updated_at();