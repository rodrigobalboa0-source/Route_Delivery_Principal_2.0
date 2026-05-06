CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','operador')
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS clientes_tenant_delete ON public.clientes;
CREATE POLICY clientes_tenant_delete ON public.clientes
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(public.clientes.email) OR u.cliente_id = public.clientes.id)
    )
  );

DROP POLICY IF EXISTS cliente_enderecos_tenant_delete ON public.cliente_enderecos;
CREATE POLICY cliente_enderecos_tenant_delete ON public.cliente_enderecos
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS contas_receber_tenant_delete ON public.contas_receber;
CREATE POLICY contas_receber_tenant_delete ON public.contas_receber
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.contas_receber.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
  );

DROP POLICY IF EXISTS acertos_entregadores_tenant_insert ON public.acertos_entregadores;
CREATE POLICY acertos_entregadores_tenant_insert ON public.acertos_entregadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.acertos_entregadores.entregador_id
    )
  );