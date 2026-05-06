ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_can_insert_clientes ON public.clientes;
CREATE POLICY anon_can_insert_clientes ON public.clientes
  FOR INSERT TO anon
  WITH CHECK (
    nome_completo IS NOT NULL AND length(trim(nome_completo)) > 2 AND
    email IS NOT NULL AND position('@' in email) > 1
  );

DROP POLICY IF EXISTS anon_can_update_clientes ON public.clientes;
CREATE POLICY anon_can_update_clientes ON public.clientes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.cliente_enderecos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_can_insert_cliente_enderecos ON public.cliente_enderecos;
CREATE POLICY anon_can_insert_cliente_enderecos ON public.cliente_enderecos
  FOR INSERT TO anon
  WITH CHECK (
    cliente_id IS NOT NULL
  );

ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_can_insert_entregadores ON public.entregadores;
CREATE POLICY anon_can_insert_entregadores ON public.entregadores
  FOR INSERT TO anon
  WITH CHECK (
    nome_completo IS NOT NULL AND length(trim(nome_completo)) > 2 AND
    (email IS NULL OR position('@' in email) > 1)
  );

DROP POLICY IF EXISTS anon_can_update_entregadores ON public.entregadores;
CREATE POLICY anon_can_update_entregadores ON public.entregadores
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
