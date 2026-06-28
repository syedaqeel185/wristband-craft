-- Add policy to allow authenticated users to create their own supplier profile
CREATE POLICY "Users can create supplier profile"
ON public.suppliers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Add policy to allow authenticated users to insert supplier role
CREATE POLICY "Users can create own roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);