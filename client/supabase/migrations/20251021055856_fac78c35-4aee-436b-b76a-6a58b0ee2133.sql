-- Add shipping_address column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS shipping_address jsonb DEFAULT NULL;

-- Give admin role to specific user email
-- First, we need to create a function that will be triggered when a user signs up
-- to automatically assign admin role to specific email

-- Insert admin role for existing user (if exists)
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Get user id for the admin email
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'aqeelg136@gmail.com' 
  LIMIT 1;
  
  -- If user exists, insert admin role (if not already exists)
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- Create trigger function to auto-assign admin role to specific email on signup
CREATE OR REPLACE FUNCTION public.handle_admin_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the email matches the admin email
  IF NEW.email = 'aqeelg136@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to assign admin role on user creation
DROP TRIGGER IF EXISTS on_admin_user_created ON auth.users;
CREATE TRIGGER on_admin_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_admin_user_signup();