ALTER TABLE public.faturamento_clientes
ADD COLUMN IF NOT EXISTS observacoes text,
ADD COLUMN IF NOT EXISTS instrucoes text;