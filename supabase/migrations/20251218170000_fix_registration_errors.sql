ALTER TABLE public.entregadores DROP CONSTRAINT IF EXISTS entregadores_status_check;
ALTER TABLE public.entregadores ADD CONSTRAINT entregadores_status_check 
  CHECK (status IN ('ativo', 'inativo', 'em_analise'));

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.users;

CREATE POLICY "Enable insert for all users" 
  ON public.users 
  FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);