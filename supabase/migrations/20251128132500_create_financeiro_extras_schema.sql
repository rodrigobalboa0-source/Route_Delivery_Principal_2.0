CREATE TABLE IF NOT EXISTS public.creditos_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  valor numeric,
  motivo text,
  status text CHECK (status IN ('disponivel','utilizado','expirado')) DEFAULT 'disponivel',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.creditos_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select creditos_clientes" ON public.creditos_clientes;
CREATE POLICY "auth can select creditos_clientes" ON public.creditos_clientes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth can insert creditos_clientes" ON public.creditos_clientes;
CREATE POLICY "auth can insert creditos_clientes" ON public.creditos_clientes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth can update creditos_clientes" ON public.creditos_clientes;
CREATE POLICY "auth can update creditos_clientes" ON public.creditos_clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth can delete creditos_clientes" ON public.creditos_clientes;
CREATE POLICY "auth can delete creditos_clientes" ON public.creditos_clientes FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_creditos_clientes_cliente ON public.creditos_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_creditos_clientes_status ON public.creditos_clientes(status);

CREATE TABLE IF NOT EXISTS public.faturamento_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text,
  total_faturado numeric,
  total_recebido numeric,
  status text CHECK (status IN ('aberto','fechado')) DEFAULT 'aberto',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.faturamento_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select faturamento_mensal" ON public.faturamento_mensal;
CREATE POLICY "auth can select faturamento_mensal" ON public.faturamento_mensal FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth can insert faturamento_mensal" ON public.faturamento_mensal;
CREATE POLICY "auth can insert faturamento_mensal" ON public.faturamento_mensal FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth can update faturamento_mensal" ON public.faturamento_mensal;
CREATE POLICY "auth can update faturamento_mensal" ON public.faturamento_mensal FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth can delete faturamento_mensal" ON public.faturamento_mensal;
CREATE POLICY "auth can delete faturamento_mensal" ON public.faturamento_mensal FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_faturamento_competencia ON public.faturamento_mensal(competencia);

CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  descricao text,
  valor numeric,
  numero text,
  serie text,
  protocolo text,
  chave_nfe text,
  ambiente text CHECK (ambiente IN ('homologacao','producao')),
  xml_assinado text,
  status text CHECK (status IN ('emitida','erro')) DEFAULT 'emitida',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "auth can select notas_fiscais" ON public.notas_fiscais FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth can insert notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "auth can insert notas_fiscais" ON public.notas_fiscais FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth can update notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "auth can update notas_fiscais" ON public.notas_fiscais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth can delete notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "auth can delete notas_fiscais" ON public.notas_fiscais FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_notas_cliente ON public.notas_fiscais(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notas_status ON public.notas_fiscais(status);

CREATE TABLE IF NOT EXISTS public.recibos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  descricao text,
  valor numeric,
  status text CHECK (status IN ('emitido')) DEFAULT 'emitido',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth can select recibos" ON public.recibos;
CREATE POLICY "auth can select recibos" ON public.recibos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth can insert recibos" ON public.recibos;
CREATE POLICY "auth can insert recibos" ON public.recibos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth can update recibos" ON public.recibos;
CREATE POLICY "auth can update recibos" ON public.recibos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth can delete recibos" ON public.recibos;
CREATE POLICY "auth can delete recibos" ON public.recibos FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_recibos_cliente ON public.recibos(cliente_id);
