
ALTER TABLE public.entregadores
ADD COLUMN IF NOT EXISTS dados_bancarios JSONB DEFAULT NULL;