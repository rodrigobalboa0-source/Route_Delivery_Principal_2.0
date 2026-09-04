-- ============================================================================
-- DIAGNÓSTICO: "Taxa de chuva" (preco_dinamico_entregador / TAXA_FIXA)
-- não aparece no valor do motoboy.
-- Rodar no SQL Editor do Supabase (produção), na ordem.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Regras ativas de preço dinâmico do entregador (confirmar a Taxa de chuva)
-- ---------------------------------------------------------------------------
SELECT id, criterio, multiplicador, observacao, ativa, entregador_id, created_at
FROM public.preco_dinamico_entregador
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- 1) PEDIDO DE TESTE DO BRUNO
--    Entregas das últimas 24h com valor perto de R$10 (entrega ou comissão).
--    Mostra: caminho de criação provável, se é multi-destino, loja,
--    se a loja tem tabela de comissão, e o que a comissão DEVERIA ser.
-- ---------------------------------------------------------------------------
SELECT
  ne.created_at,
  ne.id                                   AS entrega_id,
  ne.status,
  c.nome_completo                         AS loja,
  ne.valor_entrega                        AS valor_cobrado_cliente,
  ne.valor_entregador                     AS comissao_salva,          -- <== o que o motoboy vê no extrato
  ne.distancia_km,
  ne.retorno,

  -- multi-destino?
  COALESCE(jsonb_array_length(
    CASE WHEN jsonb_typeof(ne.pontos_adicionais) = 'array'
         THEN ne.pontos_adicionais ELSE '[]'::jsonb END), 0)          AS qtd_pontos_adicionais,
  CASE WHEN COALESCE(jsonb_array_length(
         CASE WHEN jsonb_typeof(ne.pontos_adicionais) = 'array'
              THEN ne.pontos_adicionais ELSE '[]'::jsonb END), 0) > 0
       THEN 'MULTI-DESTINO' ELSE '1 destino' END                      AS tipo_rota,

  -- caminho de criação (heurística pelas marcas que cada tela deixa em opcionais/campos)
  CASE
    WHEN p.observacoes LIKE 'Pedido Rápido%'                THEN 'PedidosPanel (Lançamento Rápido)'
    WHEN ne.opcionais ? 'comissao_destinos'                 THEN 'NovaEntregaPanel (multi-destino)'
    WHEN ne.opcionais ? 'driver_bonuses'                    THEN 'NovaEntregaPanel (1 destino)'
    WHEN ne.tipo_servico_id IS NOT NULL                     THEN 'NovaEntregaPanel (provável)'
    ELSE 'indeterminado / integração (iFood, CardápioWeb, Zé)'
  END                                                                  AS caminho_criacao,

  -- a criação registrou algum bônus dinâmico?
  ne.opcionais -> 'driver_bonuses'                          AS driver_bonuses_gravados,
  ne.opcionais -> 'comissao_destinos'                       AS comissao_destinos_gravados,
  ne.opcionais ->> 'comissao_total'                         AS comissao_total_gravada,

  -- a loja tem tabela de comissão?
  tc.id                                                     AS tabela_comissao_id,
  tc.nome                                                   AS tabela_comissao_nome,
  tc.valor_por_ponto,
  CASE WHEN tc.id IS NULL THEN 'SEM TABELA' ELSE 'COM TABELA' END      AS tem_tabela_comissao,

  -- comissão base esperada pela faixa de km
  (SELECT f.valor
     FROM public.tabelas_comissoes_faixas f
    WHERE f.tabela_id = tc.id AND f.km_ate >= COALESCE(ne.distancia_km, 0)
    ORDER BY f.km_ate ASC LIMIT 1)                          AS faixa_valor_esperado,

  -- soma das TAXA_FIXA ativas (a "Taxa de chuva")
  (SELECT COALESCE(SUM(r.multiplicador), 0)
     FROM public.preco_dinamico_entregador r
    WHERE r.ativa = true AND r.criterio = 'TAXA_FIXA'
      AND (r.entregador_id IS NULL OR r.entregador_id = ne.entregador_id))
                                                            AS taxa_fixa_ativa_esperada

FROM public.nova_entrega ne
LEFT JOIN public.pedidos  p ON p.id = ne.pedido_id
LEFT JOIN public.clientes c ON c.id = ne.cliente_id
LEFT JOIN LATERAL (
  SELECT t.*
  FROM public.tabelas_comissoes t
  WHERE t.ativo = true
    AND (t.cliente_ids IS NULL
         OR (jsonb_typeof(t.cliente_ids) = 'array'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.cliente_ids) e
                          WHERE e = ne.cliente_id::text)))
  ORDER BY t.created_at DESC
  LIMIT 1
) tc ON true
WHERE ne.created_at >= now() - interval '24 hours'
  AND (ne.valor_entregador BETWEEN 8 AND 14 OR ne.valor_entrega BETWEEN 8 AND 14)
ORDER BY ne.created_at DESC;


-- ---------------------------------------------------------------------------
-- 2) O QUE O RPC CALCULOU NA HORA (logs do get_entrega_comissao_debug)
--    Mostra se caiu no fallback e se a TAXA_FIXA entrou.
--    Troque o filtro de tempo por  delivery_id = '<entrega_id da query 1>'
--    depois de identificar o pedido do Bruno.
-- ---------------------------------------------------------------------------
SELECT
  dl.created_at,
  dl.delivery_id,
  dl.description,
  dl.new_data ->> 'valor_entregador_salvo'  AS valor_salvo,
  dl.new_data ->> 'base_comissao'           AS base,
  dl.new_data ->> 'total_antes_dinamico'    AS total_antes_taxa,
  dl.new_data ->> 'total_final'             AS total_final,
  dl.new_data -> 'applied_rules'            AS regras_aplicadas,
  dl.new_data ->> 'sqlerrm'                 AS erro_sql,
  dl.rpc_response ->> 'fallback'            AS caiu_no_fallback
FROM public.delivery_logs dl
WHERE dl.action = 'get_entrega_comissao_debug'
  AND dl.created_at >= now() - interval '24 hours'
ORDER BY dl.created_at DESC
LIMIT 200;


-- ---------------------------------------------------------------------------
-- 3) CONFRONTO DIRETO: para a entrega suspeita, o que o RPC devolve AGORA
--    vs. o que está gravado. Substitua o UUID.
-- ---------------------------------------------------------------------------
-- SELECT
--   ne.valor_entregador                                        AS gravado,
--   public.get_entrega_comissao_debug('COLE-O-UUID-AQUI'::uuid) AS rpc_agora
-- FROM public.nova_entrega ne
-- WHERE ne.id = 'COLE-O-UUID-AQUI'::uuid;


-- ---------------------------------------------------------------------------
-- 4) CORRELAÇÃO: horário do teste do Bruno x quando cada regra foi
--    ligada/desligada pela última vez. Não existe tabela de auditoria
--    (só updated_at na própria linha), então isso só confirma a ÚLTIMA
--    mudança de cada regra, não o histórico completo.
--    Preencha o horário aproximado do teste do Bruno abaixo.
-- ---------------------------------------------------------------------------
SELECT
  id,
  criterio,
  observacao,
  multiplicador,
  ativa,
  updated_at,
  -- '2026-09-04 15:30:00'::timestamptz  <- ajuste pro horário real do teste
  updated_at > '2026-09-04 15:30:00'::timestamptz AS mudou_apos_horario_do_teste
FROM public.preco_dinamico_entregador
WHERE observacao ILIKE '%chuva%' OR observacao ILIKE '%promo%'
ORDER BY updated_at DESC;


-- ============================================================================
-- REALTIME: checagem/ativação da publicação pra preco_dinamico_entregador
-- (necessário pro refetch automático no Lançamento Rápido, item 2 do fix)
-- ============================================================================

-- 5) Checar se a tabela já está na publicação supabase_realtime
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'preco_dinamico_entregador';

-- Se a query acima NÃO retornar nenhuma linha, rode o ALTER abaixo
-- (mesmo procedimento já aplicado em produção pra tabela 'promocoes'):
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.preco_dinamico_entregador;
