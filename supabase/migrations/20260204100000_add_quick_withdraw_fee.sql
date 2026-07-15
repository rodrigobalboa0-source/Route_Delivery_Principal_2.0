ALTER TABLE public.configuracoes_operacao 
ADD COLUMN IF NOT EXISTS taxa_saque_rapido numeric DEFAULT 0;


ALTER TABLE public.acertos_entregadores 
ADD COLUMN IF NOT EXISTS tipo_saque text DEFAULT 'normal' CHECK (tipo_saque IN ('normal', 'rapido')),
ADD COLUMN IF NOT EXISTS taxa_aplicada numeric DEFAULT 0;