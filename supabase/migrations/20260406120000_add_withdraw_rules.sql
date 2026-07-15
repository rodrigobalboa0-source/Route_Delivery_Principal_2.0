ALTER TABLE public.configuracoes_operacao
ADD COLUMN IF NOT EXISTS regras_saque jsonb NOT NULL DEFAULT '{}'::jsonb;