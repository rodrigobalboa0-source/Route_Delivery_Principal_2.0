DROP POLICY IF EXISTS "Enable insert for all users" ON public.users;
CREATE POLICY "Enable insert for all users" 
ON public.users FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable insert for signups" ON public.entregadores;
CREATE POLICY "Enable insert for signups" 
ON public.entregadores FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);