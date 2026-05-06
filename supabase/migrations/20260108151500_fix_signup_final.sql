DROP POLICY IF EXISTS anon_can_insert_entregadores ON public.entregadores;
DROP POLICY IF EXISTS anon_can_update_entregadores ON public.entregadores;

DROP POLICY IF EXISTS "Enable insert for signups" ON public.entregadores;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.users;

CREATE POLICY "Enable insert for signups" 
ON public.entregadores FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);