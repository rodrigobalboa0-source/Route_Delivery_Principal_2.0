CREATE TABLE IF NOT EXISTS public.tipo_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.tipo_servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select tipo_servicos" ON public.tipo_servicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert tipo_servicos" ON public.tipo_servicos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update tipo_servicos" ON public.tipo_servicos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete tipo_servicos" ON public.tipo_servicos FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_tipo_servicos_ativo ON public.tipo_servicos(ativo);

CREATE TABLE IF NOT EXISTS public.nova_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  endereco_id uuid REFERENCES public.cliente_enderecos(id) ON DELETE RESTRICT,
  tipo_servico_id uuid REFERENCES public.tipo_servicos(id) ON DELETE SET NULL,
  modal_tipo text CHECK (modal_tipo IN ('moto','carro','bike','outro')),
  atribuicao_modo text CHECK (atribuicao_modo IN ('manual','automatica')) NOT NULL,
  entregador_id uuid REFERENCES public.entregadores(id) ON DELETE SET NULL,
  opcionais jsonb,
  observacoes text,
  status text CHECK (status IN ('criada','atribuida','em_rota','entregue','cancelada')) DEFAULT 'criada',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.nova_entrega ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can select nova_entrega" ON public.nova_entrega FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert nova_entrega" ON public.nova_entrega FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update nova_entrega" ON public.nova_entrega FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete nova_entrega" ON public.nova_entrega FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_nova_entrega_cliente ON public.nova_entrega(cliente_id);
CREATE INDEX IF NOT EXISTS idx_nova_entrega_entregador ON public.nova_entrega(entregador_id);
CREATE INDEX IF NOT EXISTS idx_nova_entrega_status ON public.nova_entrega(status);
