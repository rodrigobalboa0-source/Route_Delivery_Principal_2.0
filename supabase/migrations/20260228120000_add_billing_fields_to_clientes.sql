ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS modo_faturamento text DEFAULT 'credito',
ADD COLUMN IF NOT EXISTS faturamento_periodo text,
ADD COLUMN IF NOT EXISTS faturamento_vencimento_dias integer,
ADD COLUMN IF NOT EXISTS faturamento_tipo_cobranca text,
ADD COLUMN IF NOT EXISTS faturamento_adicional_1 numeric,
ADD COLUMN IF NOT EXISTS faturamento_adicional_2 numeric,
ADD COLUMN IF NOT EXISTS faturamento_cobrar_taxas_sem_entregas boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS faturamento_instrucoes text,
ADD COLUMN IF NOT EXISTS faturamento_observacoes text,
ADD COLUMN IF NOT EXISTS faturamento_emails text[];

COMMENT ON COLUMN public.clientes.modo_faturamento IS 'credito or faturamento';