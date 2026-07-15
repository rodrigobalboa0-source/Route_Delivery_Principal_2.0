CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'operador'
  );
$$ LANGUAGE sql STABLE;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select clientes" ON public.clientes;
DROP POLICY IF EXISTS "auth can insert clientes" ON public.clientes;
DROP POLICY IF EXISTS "auth can update clientes" ON public.clientes;
DROP POLICY IF EXISTS "auth can delete clientes" ON public.clientes;

CREATE POLICY clientes_tenant_select ON public.clientes
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(public.clientes.email)
    )
  );

CREATE POLICY clientes_tenant_insert ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(public.clientes.email)
    )
  );

CREATE POLICY clientes_tenant_update ON public.clientes
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(public.clientes.email)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(public.clientes.email)
    )
  );

CREATE POLICY clientes_tenant_delete ON public.clientes
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(public.clientes.email)
    )
  );

ALTER TABLE public.cliente_enderecos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select cliente_enderecos" ON public.cliente_enderecos;
DROP POLICY IF EXISTS "auth can insert cliente_enderecos" ON public.cliente_enderecos;
DROP POLICY IF EXISTS "auth can update cliente_enderecos" ON public.cliente_enderecos;
DROP POLICY IF EXISTS "auth can delete cliente_enderecos" ON public.cliente_enderecos;

CREATE POLICY cliente_enderecos_tenant_select ON public.cliente_enderecos
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(c.email)
    )
  );

CREATE POLICY cliente_enderecos_tenant_insert ON public.cliente_enderecos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(c.email)
    )
  );

CREATE POLICY cliente_enderecos_tenant_update ON public.cliente_enderecos
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(c.email)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(c.email)
    )
  );

CREATE POLICY cliente_enderecos_tenant_delete ON public.cliente_enderecos
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.cliente_enderecos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND lower(u.email) = lower(c.email)
    )
  );

ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "auth can insert entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "auth can update entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "auth can delete entregadores" ON public.entregadores;

CREATE POLICY entregadores_tenant_select ON public.entregadores
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  );

CREATE POLICY entregadores_tenant_insert ON public.entregadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  );

CREATE POLICY entregadores_tenant_update ON public.entregadores
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  );

CREATE POLICY entregadores_tenant_delete ON public.entregadores
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND lower(u.email) = lower(public.entregadores.email)
    )
  );

ALTER TABLE public.nova_entrega ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select nova_entrega" ON public.nova_entrega;
DROP POLICY IF EXISTS "auth can insert nova_entrega" ON public.nova_entrega;
DROP POLICY IF EXISTS "auth can update nova_entrega" ON public.nova_entrega;
DROP POLICY IF EXISTS "auth can delete nova_entrega" ON public.nova_entrega;

CREATE POLICY nova_entrega_tenant_select ON public.nova_entrega
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.nova_entrega.entregador_id
    )
  );

CREATE POLICY nova_entrega_tenant_insert ON public.nova_entrega
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
  );

CREATE POLICY nova_entrega_tenant_update ON public.nova_entrega
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.nova_entrega.entregador_id
    )
  ) WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.nova_entrega.entregador_id
    )
  );

CREATE POLICY nova_entrega_tenant_delete ON public.nova_entrega
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.nova_entrega.cliente_id
    )
  );

ALTER TABLE public.mensagens_entregadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select mensagens_entregadores" ON public.mensagens_entregadores;
DROP POLICY IF EXISTS "auth can insert mensagens_entregadores" ON public.mensagens_entregadores;
DROP POLICY IF EXISTS "auth can update mensagens_entregadores" ON public.mensagens_entregadores;
DROP POLICY IF EXISTS "auth can delete mensagens_entregadores" ON public.mensagens_entregadores;

CREATE POLICY mensagens_entregadores_tenant_select ON public.mensagens_entregadores
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.mensagens_entregadores.entregador_id
    )
  );

CREATE POLICY mensagens_entregadores_tenant_insert ON public.mensagens_entregadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.mensagens_entregadores.entregador_id
    )
  );

CREATE POLICY mensagens_entregadores_tenant_update ON public.mensagens_entregadores
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.mensagens_entregadores.entregador_id
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.mensagens_entregadores.entregador_id
    )
  );

CREATE POLICY mensagens_entregadores_tenant_delete ON public.mensagens_entregadores
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.mensagens_entregadores.entregador_id
    )
  );

ALTER TABLE public.mensagens_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select mensagens_clientes" ON public.mensagens_clientes;
DROP POLICY IF EXISTS "auth can insert mensagens_clientes" ON public.mensagens_clientes;
DROP POLICY IF EXISTS "auth can update mensagens_clientes" ON public.mensagens_clientes;
DROP POLICY IF EXISTS "auth can delete mensagens_clientes" ON public.mensagens_clientes;

CREATE POLICY mensagens_clientes_tenant_select ON public.mensagens_clientes
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.mensagens_clientes.cliente_id
    )
  );

CREATE POLICY mensagens_clientes_tenant_insert ON public.mensagens_clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.mensagens_clientes.cliente_id
    )
  );

CREATE POLICY mensagens_clientes_tenant_update ON public.mensagens_clientes
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.mensagens_clientes.cliente_id
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.mensagens_clientes.cliente_id
    )
  );

CREATE POLICY mensagens_clientes_tenant_delete ON public.mensagens_clientes
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.mensagens_clientes.cliente_id
    )
  );

ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "auth can insert contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "auth can update contas_receber" ON public.contas_receber;
DROP POLICY IF EXISTS "auth can delete contas_receber" ON public.contas_receber;

CREATE POLICY contas_receber_tenant_select ON public.contas_receber
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.contas_receber.cliente_id
    )
  );

CREATE POLICY contas_receber_tenant_insert ON public.contas_receber
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.contas_receber.cliente_id
    )
  );

CREATE POLICY contas_receber_tenant_update ON public.contas_receber
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.contas_receber.cliente_id
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.contas_receber.cliente_id
    )
  );

CREATE POLICY contas_receber_tenant_delete ON public.contas_receber
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON lower(c.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND c.id = public.contas_receber.cliente_id
    )
  );

ALTER TABLE public.acertos_entregadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select acertos_entregadores" ON public.acertos_entregadores;
DROP POLICY IF EXISTS "auth can insert acertos_entregadores" ON public.acertos_entregadores;
DROP POLICY IF EXISTS "auth can update acertos_entregadores" ON public.acertos_entregadores;
DROP POLICY IF EXISTS "auth can delete acertos_entregadores" ON public.acertos_entregadores;

CREATE POLICY acertos_entregadores_tenant_select ON public.acertos_entregadores
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.acertos_entregadores.entregador_id
    )
  );

CREATE POLICY acertos_entregadores_tenant_insert ON public.acertos_entregadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
  );

CREATE POLICY acertos_entregadores_tenant_update ON public.acertos_entregadores
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.acertos_entregadores.entregador_id
    )
  ) WITH CHECK (
    public.is_admin()
  );

CREATE POLICY acertos_entregadores_tenant_delete ON public.acertos_entregadores
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

ALTER TABLE public.comissoes_entregadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select comissoes_entregadores" ON public.comissoes_entregadores;
DROP POLICY IF EXISTS "auth can insert comissoes_entregadores" ON public.comissoes_entregadores;
DROP POLICY IF EXISTS "auth can update comissoes_entregadores" ON public.comissoes_entregadores;
DROP POLICY IF EXISTS "auth can delete comissoes_entregadores" ON public.comissoes_entregadores;

CREATE POLICY comissoes_entregadores_tenant_select ON public.comissoes_entregadores
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.entregadores e ON lower(e.email) = lower(u.email)
      WHERE u.id = auth.uid() AND u.role = 'entregador' AND e.id = public.comissoes_entregadores.entregador_id
    )
  );

CREATE POLICY comissoes_entregadores_tenant_insert ON public.comissoes_entregadores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
  );

CREATE POLICY comissoes_entregadores_tenant_update ON public.comissoes_entregadores
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
  ) WITH CHECK (
    public.is_admin()
  );

CREATE POLICY comissoes_entregadores_tenant_delete ON public.comissoes_entregadores
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );