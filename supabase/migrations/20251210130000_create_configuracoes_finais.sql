-- Alter config_fiscal
ALTER TABLE public.config_fiscal ADD COLUMN IF NOT EXISTS cfop_padrao text;
ALTER TABLE public.config_fiscal ADD COLUMN IF NOT EXISTS ncm_padrao text;
ALTER TABLE public.config_fiscal ADD COLUMN IF NOT EXISTS impostos_padrao jsonb default '{}'::jsonb;
ALTER TABLE public.config_fiscal ADD COLUMN IF NOT EXISTS ambiente text default 'homologacao';

-- Create integracoes_externas
CREATE TABLE IF NOT EXISTS public.integracoes_externas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL, -- 'pagamento', 'erp', 'api'
  nome text NOT NULL,
  api_key text,
  api_secret text,
  webhook_url text,
  ativo boolean DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create integracoes_open_delivery
CREATE TABLE IF NOT EXISTS public.integracoes_open_delivery (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id text,
  client_id text,
  client_secret text,
  polling_interval integer DEFAULT 30,
  ativo boolean DEFAULT false,
  status_mapping jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create configuracoes_operacao
CREATE TABLE IF NOT EXISTS public.configuracoes_operacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  horario_funcionamento jsonb DEFAULT '[]'::jsonb,
  taxa_servico numeric DEFAULT 0,
  pedido_minimo numeric DEFAULT 0,
  tempo_preparo_padrao integer DEFAULT 30,
  modo_automatico boolean DEFAULT false,
  regras_auto_cancelamento jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integracoes_externas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracoes_open_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_operacao ENABLE ROW LEVEL SECURITY;

-- Policies
-- Integracoes Externas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública integracoes_externas') THEN
        CREATE POLICY "Leitura pública integracoes_externas" ON public.integracoes_externas FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Escrita admin integracoes_externas') THEN
        CREATE POLICY "Escrita admin integracoes_externas" ON public.integracoes_externas FOR ALL USING (auth.role() = 'authenticated' and public.is_admin());
    END IF;
END
$$;

-- Integracoes Open Delivery
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública integracoes_open_delivery') THEN
        CREATE POLICY "Leitura pública integracoes_open_delivery" ON public.integracoes_open_delivery FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Escrita admin integracoes_open_delivery') THEN
        CREATE POLICY "Escrita admin integracoes_open_delivery" ON public.integracoes_open_delivery FOR ALL USING (auth.role() = 'authenticated' and public.is_admin());
    END IF;
END
$$;

-- Configuracoes Operacao
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública configuracoes_operacao') THEN
        CREATE POLICY "Leitura pública configuracoes_operacao" ON public.configuracoes_operacao FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Escrita admin configuracoes_operacao') THEN
        CREATE POLICY "Escrita admin configuracoes_operacao" ON public.configuracoes_operacao FOR ALL USING (auth.role() = 'authenticated' and public.is_admin());
    END IF;
END
$$;
