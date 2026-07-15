ALTER TABLE public.tabelas_precos
ADD COLUMN IF NOT EXISTS valor_multiplo_comercio numeric DEFAULT 0;

COMMENT ON COLUMN public.tabelas_precos.valor_multiplo_comercio IS 'Valor fixo cobrado do comércio para 2ª entrega em diante em pedidos múltiplos (não usa valor base normal)';
