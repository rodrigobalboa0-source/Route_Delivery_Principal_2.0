ALTER TABLE public.tabelas_comissoes ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE public.tabelas_comissoes ADD COLUMN IF NOT EXISTS cliente_ids jsonb;
-- Migration para criar tabela de comissão para o cliente específico
-- Cliente: 4eca734d-5bf3-417a-b65b-339968be38bb

-- Inserir tabela de comissão para o cliente
INSERT INTO public.tabelas_comissoes (
  id,
  nome,
  cliente_ids,
  ativo,
  valor_por_ponto,
  tipo_retorno,
  valor_retorno,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Tabela Cliente 4eca734d',
  '["4eca734d-5bf3-417a-b65b-339968be38bb"]'::jsonb,
  true,
  2.50,  -- R$ 2,50 por ponto adicional
  'fixo', -- retorno fixo
  5.00,   -- R$ 5,00 de retorno
  NOW(),
  NOW()
);

-- Criar faixas de comissão usando CTE para obter o ID automaticamente
WITH tabela_inserida AS (
  SELECT id FROM public.tabelas_comissoes 
  WHERE cliente_ids @> '["4eca734d-5bf3-417a-b65b-339968be38bb"]'::jsonb 
  ORDER BY created_at DESC 
  LIMIT 1
)
INSERT INTO public.tabelas_comissoes_faixas (
  tabela_id,
  km_ate,
  valor,
  created_at
) 
SELECT 
  ti.id,
  faixa.km_ate,
  faixa.valor,
  NOW()
FROM tabela_inserida ti
CROSS JOIN (VALUES 
  (5, 8.00),   -- Até 5km: R$ 8,00
  (10, 12.00), -- Até 10km: R$ 12,00  
  (15, 18.00), -- Até 15km: R$ 18,00
  (20, 25.00)  -- Até 20km: R$ 25,00
) AS faixa(km_ate, valor);

-- Log para verificação
INSERT INTO public.delivery_logs (
  delivery_id,
  action,
  description,
  new_data,
  created_by
) VALUES (
  '5bd1cb3b-bc4f-4c71-a847-c54a7e542280',
  'fix_tabela_comissao',
  'tabela_comissao_criada',
  jsonb_build_object(
    'cliente_id', '4eca734d-5bf3-417a-b65b-339968be38bb',
    'message', 'Tabela de comissão criada para resolver problema de valor zerado',
    'timestamp', NOW()
  ),
  auth.uid()
);
