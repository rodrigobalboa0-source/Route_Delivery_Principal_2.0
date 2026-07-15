CREATE TABLE IF NOT EXISTS public.acertos_entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE RESTRICT,
  entrega_id uuid REFERENCES public.nova_entrega(id) ON DELETE RESTRICT,
  valor_pago numeric,
  status text CHECK (status IN ('pendente','pago')) DEFAULT 'pendente',
  pago_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.acertos_entregadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select acertos_entregadores" ON public.acertos_entregadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert acertos_entregadores" ON public.acertos_entregadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update acertos_entregadores" ON public.acertos_entregadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete acertos_entregadores" ON public.acertos_entregadores FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_acertos_entregador ON public.acertos_entregadores(entregador_id);
CREATE INDEX IF NOT EXISTS idx_acertos_entrega ON public.acertos_entregadores(entrega_id);
CREATE INDEX IF NOT EXISTS idx_acertos_status ON public.acertos_entregadores(status);

CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor text,
  descricao text,
  valor numeric,
  vencimento date,
  status text CHECK (status IN ('pendente','pago','atrasado')) DEFAULT 'pendente',
  pago_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select contas_pagar" ON public.contas_pagar FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert contas_pagar" ON public.contas_pagar FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update contas_pagar" ON public.contas_pagar FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete contas_pagar" ON public.contas_pagar FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON public.contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON public.contas_pagar(vencimento);

CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  descricao text,
  valor numeric,
  vencimento date,
  status text CHECK (status IN ('pendente','recebido','atrasado')) DEFAULT 'pendente',
  recebido_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select contas_receber" ON public.contas_receber FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert contas_receber" ON public.contas_receber FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update contas_receber" ON public.contas_receber FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete contas_receber" ON public.contas_receber FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON public.contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON public.contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber(vencimento);