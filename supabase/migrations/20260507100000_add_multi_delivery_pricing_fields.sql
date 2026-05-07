ALTER TABLE public.tabelas_comissoes
ADD COLUMN IF NOT EXISTS valor_adicional_entregador numeric DEFAULT 0;

COMMENT ON COLUMN public.tabelas_comissoes.valor_adicional_entregador IS 'Valor adicional pago ao entregador para 2ª entrega em diante em pedidos múltiplos (soma ao valor base)';