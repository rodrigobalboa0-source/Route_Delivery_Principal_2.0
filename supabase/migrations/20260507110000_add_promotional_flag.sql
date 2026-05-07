ALTER TABLE public.tabelas_comissoes
ADD COLUMN IF NOT EXISTS aplicar_adicional_primeira_entrega boolean DEFAULT false;

COMMENT ON COLUMN public.tabelas_comissoes.aplicar_adicional_primeira_entrega IS 'Se true, aplica o valor adicional da múltipla já na primeira entrega (promoção). Se false, aplica apenas a partir da segunda entrega (comportamento padrão).';