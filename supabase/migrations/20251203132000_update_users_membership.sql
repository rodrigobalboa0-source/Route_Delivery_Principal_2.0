ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','operador','cliente','entregador'));

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS entregador_id uuid REFERENCES public.entregadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_cliente ON public.users(cliente_id);
CREATE INDEX IF NOT EXISTS idx_users_entregador ON public.users(entregador_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','operador')
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS clientes_tenant_select ON public.clientes;
DROP POLICY IF EXISTS clientes_tenant_insert ON public.clientes;
DROP POLICY IF EXISTS clientes_tenant_update ON public.clientes;
DROP POLICY IF EXISTS clientes_tenant_delete ON public.clientes;

CREATE POLICY clientes_tenant_select ON public.clientes
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(public.clientes.email) OR u.cliente_id = public.clientes.id)
    )
  );

CREATE POLICY clientes_tenant_insert ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(public.clientes.email) OR u.cliente_id = public.clientes.id)
    )
  );

CREATE POLICY clientes_tenant_update ON public.clientes
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(public.clientes.email) OR u.cliente_id = public.clientes.id)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(public.clientes.email) OR u.cliente_id = public.clientes.id)
    )
  );

DROP POLICY IF EXISTS cliente_enderecos_tenant_select ON public.cliente_enderecos;
DROP POLICY IF EXISTS cliente_enderecos_tenant_insert ON public.cliente_enderecos;
DROP POLICY IF EXISTS cliente_enderecos_tenant_update ON public.cliente_enderecos;
DROP POLICY IF EXISTS cliente_enderecos_tenant_delete ON public.cliente_enderecos;

CREATE POLICY cliente_enderecos_tenant_select ON public.cliente_enderecos
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

CREATE POLICY cliente_enderecos_tenant_insert ON public.cliente_enderecos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

CREATE POLICY cliente_enderecos_tenant_update ON public.cliente_enderecos
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS contas_receber_tenant_select ON public.contas_receber;
DROP POLICY IF EXISTS contas_receber_tenant_insert ON public.contas_receber;
DROP POLICY IF EXISTS contas_receber_tenant_update ON public.contas_receber;
DROP POLICY IF EXISTS contas_receber_tenant_delete ON public.contas_receber;

CREATE POLICY contas_receber_tenant_select ON public.contas_receber
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.contas_receber.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

CREATE POLICY contas_receber_tenant_insert ON public.contas_receber
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.contas_receber.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

CREATE POLICY contas_receber_tenant_update ON public.contas_receber
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.contas_receber.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.contas_receber.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );