-- Confirm admin user email
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email = 'aqeelg136@gmail.com' AND email_confirmed_at IS NULL;