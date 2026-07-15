CREATE TABLE IF NOT EXISTS public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  endereco_id uuid REFERENCES public.cliente_enderecos(id) ON DELETE SET NULL,
  numero text,
  item_descricao text,
  endereco_texto text,
  origem text CHECK (origem IN ('manual','online')) DEFAULT 'manual',
  itens jsonb,
  valor_total numeric,
  status text CHECK (status IN ('criado','confirmado','em_preparo','pronto','cancelado','entregue')) DEFAULT 'criado',
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS item_descricao text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS endereco_texto text;

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON public.pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_created ON public.pedidos(created_at);

DROP TRIGGER IF EXISTS update_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER update_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','operador')
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS pedidos_tenant_select ON public.pedidos;
CREATE POLICY pedidos_tenant_select ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.pedidos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS pedidos_tenant_insert ON public.pedidos;
CREATE POLICY pedidos_tenant_insert ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.pedidos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS pedidos_tenant_update ON public.pedidos;
CREATE POLICY pedidos_tenant_update ON public.pedidos
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.pedidos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.pedidos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );

DROP POLICY IF EXISTS pedidos_tenant_delete ON public.pedidos;
CREATE POLICY pedidos_tenant_delete ON public.pedidos
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.users u JOIN public.clientes c ON c.id = public.pedidos.cliente_id
      WHERE u.id = auth.uid() AND u.role = 'cliente' AND (lower(u.email) = lower(c.email) OR u.cliente_id = c.id)
    )
  );
