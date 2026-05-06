ALTER TABLE public.entregadores 
ADD COLUMN IF NOT EXISTS prioridade_busca boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS prioridade_tempo integer DEFAULT 0;