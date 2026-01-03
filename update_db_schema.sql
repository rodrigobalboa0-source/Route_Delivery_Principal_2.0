-- Executar no SQL Editor do Supabase

-- 1. Adicionar coluna valor_entregador na tabela nova_entrega (Correção do erro 400)
ALTER TABLE public.nova_entrega 
ADD COLUMN IF NOT EXISTS valor_entregador numeric(10,2);

-- 2. Adicionar coluna criterio na tabela preco_dinamico_entregador (Novas opções de Valor/Porcentagem)
ALTER TABLE public.preco_dinamico_entregador 
ADD COLUMN IF NOT EXISTS criterio text DEFAULT 'MULTIPLICADOR';
