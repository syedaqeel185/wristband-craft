-- Allow admins to view all profiles (needed for order confirmation emails)
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));