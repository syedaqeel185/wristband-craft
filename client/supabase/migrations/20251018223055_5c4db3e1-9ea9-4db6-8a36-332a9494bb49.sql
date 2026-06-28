-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for designs
INSERT INTO storage.buckets (id, name, public)
VALUES ('wristband-designs', 'wristband-designs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload their own designs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'wristband-designs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own designs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wristband-designs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view designs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wristband-designs');

-- Create designs table
CREATE TABLE public.designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  design_url text NOT NULL,
  wristband_color text DEFAULT '#000000',
  custom_text text,
  text_color text DEFAULT '#FFFFFF',
  text_position jsonb DEFAULT '{"x": 50, "y": 50}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own designs"
  ON public.designs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own designs"
  ON public.designs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own designs"
  ON public.designs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own designs"
  ON public.designs FOR DELETE
  USING (auth.uid() = user_id);

-- Create orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  design_id uuid REFERENCES public.designs(id) ON DELETE SET NULL,
  quantity integer DEFAULT 1 NOT NULL,
  total_price decimal(10,2) DEFAULT 19.99 NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  shipping_address jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trigger to update designs updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_designs_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();