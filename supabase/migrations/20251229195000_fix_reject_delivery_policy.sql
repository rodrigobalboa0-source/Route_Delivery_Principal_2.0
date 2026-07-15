DROP POLICY IF EXISTS nova_entrega_tenant_update ON public.nova_entrega;

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
      WHERE u.id = auth.uid() AND u.role = 'entregador' 
      AND (

        e.id = public.nova_entrega.entregador_id 
        OR 

        (public.nova_entrega.entregador_id IS NULL AND public.nova_entrega.status = 'criada')
      )
    )
  );