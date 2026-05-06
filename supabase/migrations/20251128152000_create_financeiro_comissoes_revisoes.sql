CREATE TABLE IF NOT EXISTS public.comissoes_entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE RESTRICT,
  competencia text,
  total_entregas integer,
  valor_total numeric,
  status text CHECK (status IN ('aberto','pago')) DEFAULT 'aberto',
  pago_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.comissoes_entregadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select comissoes_entregadores" ON public.comissoes_entregadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert comissoes_entregadores" ON public.comissoes_entregadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update comissoes_entregadores" ON public.comissoes_entregadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete comissoes_entregadores" ON public.comissoes_entregadores FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_comissoes_entregador ON public.comissoes_entregadores(entregador_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_competencia ON public.comissoes_entregadores(competencia);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes_entregadores(status);

CREATE TABLE IF NOT EXISTS public.revisoes_agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid REFERENCES public.nova_entrega(id) ON DELETE RESTRICT,
  motivo text,
  valor_original numeric,
  valor_corrigido numeric,
  status text CHECK (status IN ('pendente','corrigido')) DEFAULT 'pendente',
  revisado_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.revisoes_agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select revisoes_agendamentos" ON public.revisoes_agendamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert revisoes_agendamentos" ON public.revisoes_agendamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update revisoes_agendamentos" ON public.revisoes_agendamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete revisoes_agendamentos" ON public.revisoes_agendamentos FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_revisoes_entrega ON public.revisoes_agendamentos(entrega_id);
CREATE INDEX IF NOT EXISTS idx_revisoes_status ON public.revisoes_agendamentos(status);

