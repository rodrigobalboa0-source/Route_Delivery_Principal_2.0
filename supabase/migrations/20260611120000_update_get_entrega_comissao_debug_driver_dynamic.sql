DROP FUNCTION IF EXISTS public.get_entrega_comissao_debug(uuid);

CREATE OR REPLACE FUNCTION public.get_entrega_comissao_debug(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrega RECORD;
  v_tabela RECORD;
  v_tabela_precos RECORD;
  v_faixas RECORD;
  v_km numeric;
  v_base_comissao numeric;
  v_pontos_adicionais jsonb;
  v_num_destinos integer;
  v_comissao_destinos jsonb;
  v_comissao_retorno numeric;
  v_total_comissao numeric;
  v_valor_multiplo numeric;
  v_debug_info jsonb;
  v_driver_dynamic RECORD;
  v_applied_driver_rules jsonb := '[]'::jsonb;
BEGIN
  v_debug_info := jsonb_build_object('step', 'start', 'entrega_id', p_entrega_id);

  SELECT * INTO v_entrega FROM public.nova_entrega WHERE id = p_entrega_id;

  IF NOT FOUND THEN
    INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
    VALUES (p_entrega_id, 'get_entrega_comissao_debug', 'entrega_not_found',
            jsonb_build_object('debug', v_debug_info), auth.uid());
    RETURN jsonb_build_object('success', false, 'error', 'entrega_not_found');
  END IF;

  v_debug_info := v_debug_info || jsonb_build_object(
    'entrega_found', true,
    'cliente_id', v_entrega.cliente_id,
    'valor_entregador_original', v_entrega.valor_entregador,
    'distancia_km', v_entrega.distancia_km,
    'pontos_adicionais', v_entrega.pontos_adicionais,
    'opcionais', v_entrega.opcionais
  );

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao_debug', 'entrega_data', v_debug_info, auth.uid());

  SELECT * INTO v_tabela
  FROM public.tabelas_comissoes tc
  WHERE tc.ativo = true
    AND (tc.cliente_ids IS NULL
         OR jsonb_typeof(tc.cliente_ids) = 'array'
         AND v_entrega.cliente_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(tc.cliente_ids) elem
           WHERE elem::text = v_entrega.cliente_id::text
         ))
  ORDER BY tc.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_debug_info := v_debug_info || jsonb_build_object('tabela_found', false, 'fallback_to_valor_entregador', v_entrega.valor_entregador);
    INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
    VALUES (p_entrega_id, 'get_entrega_comissao_debug', 'tabela_not_found', v_debug_info, auth.uid());
    RETURN jsonb_build_object('success', true, 'total', COALESCE(v_entrega.valor_entregador, 0), 'destinos', '[]'::jsonb, 'retorno', 0, 'applied_driver_rules', '[]'::jsonb);
  END IF;

  v_debug_info := v_debug_info || jsonb_build_object(
    'tabela_found', true,
    'tabela_id', v_tabela.id,
    'valor_por_ponto', v_tabela.valor_por_ponto,
    'tipo_retorno', v_tabela.tipo_retorno,
    'valor_retorno', v_tabela.valor_retorno
  );

  SELECT * INTO v_tabela_precos
  FROM public.tabelas_precos tp
  WHERE tp.ativo = true
    AND (tp.cliente_ids IS NULL
         OR jsonb_typeof(tp.cliente_ids) = 'array'
         AND v_entrega.cliente_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(tp.cliente_ids) elem
           WHERE elem::text = v_entrega.cliente_id::text
         ))
  ORDER BY tp.created_at DESC
  LIMIT 1;

  v_valor_multiplo := 0;
  IF FOUND THEN
    v_valor_multiplo := COALESCE(v_tabela_precos.valor_multiplo_comercio, 0);
    v_debug_info := v_debug_info || jsonb_build_object('tabela_precos_found', true, 'valor_multiplo', v_valor_multiplo);
  ELSE
    v_debug_info := v_debug_info || jsonb_build_object('tabela_precos_found', false);
  END IF;

  v_km := COALESCE(v_entrega.distancia_km, 0);
  v_debug_info := v_debug_info || jsonb_build_object('km_calculado', v_km);

  v_base_comissao := 0;
  FOR v_faixas IN
    SELECT * FROM public.tabelas_comissoes_faixas
    WHERE tabela_id = v_tabela.id
    ORDER BY km_ate
  LOOP
    IF v_km <= v_faixas.km_ate THEN
      v_base_comissao := v_faixas.valor;
      v_debug_info := v_debug_info || jsonb_build_object(
        'faixa_encontrada', true,
        'km_ate', v_faixas.km_ate,
        'valor_faixa', v_faixas.valor
      );
      EXIT;
    END IF;
  END LOOP;

  IF v_base_comissao = 0 THEN
    v_debug_info := v_debug_info || jsonb_build_object('faixa_encontrada', false, 'usando_ultima_faixa', true);
    SELECT valor INTO v_base_comissao
    FROM public.tabelas_comissoes_faixas
    WHERE tabela_id = v_tabela.id
    ORDER BY km_ate DESC
    LIMIT 1;
  END IF;

  v_base_comissao := COALESCE(v_base_comissao, 0);

  IF v_tabela.valor_por_ponto IS NOT NULL AND v_tabela.valor_por_ponto > 0 THEN
    v_base_comissao := v_base_comissao + v_tabela.valor_por_ponto;
    v_debug_info := v_debug_info || jsonb_build_object('valor_por_ponto_adicionado', v_tabela.valor_por_ponto);
  END IF;

  v_debug_info := v_debug_info || jsonb_build_object('base_comissao_final', v_base_comissao);

  v_pontos_adicionais := COALESCE(v_entrega.pontos_adicionais, '[]'::jsonb);
  IF jsonb_typeof(v_pontos_adicionais) != 'array' THEN
    v_pontos_adicionais := '[]'::jsonb;
  END IF;

  v_num_destinos := 1 + jsonb_array_length(v_pontos_adicionais);
  v_debug_info := v_debug_info || jsonb_build_object('num_destinos', v_num_destinos, 'pontos_adicionais', v_pontos_adicionais);

  IF v_num_destinos <= 1 THEN
    v_total_comissao := v_base_comissao;
    IF v_valor_multiplo > 0 THEN
      v_total_comissao := v_total_comissao + v_valor_multiplo;
    END IF;
    v_debug_info := v_debug_info || jsonb_build_object('calculo_simples', true, 'total_comissao', v_total_comissao);
  ELSE
    v_comissao_destinos := COALESCE(v_entrega.opcionais->'comissao_destinos', '[]'::jsonb);
    v_comissao_retorno := COALESCE((v_entrega.opcionais->'comissao_retorno')::numeric, 0);

    v_total_comissao := v_base_comissao;

    IF jsonb_typeof(v_comissao_destinos) = 'array' THEN
      FOR i IN 0..jsonb_array_length(v_comissao_destinos) - 1 LOOP
        v_total_comissao := v_total_comissao + COALESCE((v_comissao_destinos->i->>'valor')::numeric, 0);
      END LOOP;
    END IF;

    v_total_comissao := v_total_comissao + v_comissao_retorno;

    v_debug_info := v_debug_info || jsonb_build_object(
      'calculo_multiplo', true,
      'comissao_destinos', v_comissao_destinos,
      'comissao_retorno', v_comissao_retorno,
      'total_comissao', v_total_comissao
    );
  END IF;

  -- Aplica regras de preço dinâmico do entregador (ativas)
  FOR v_driver_dynamic IN
    SELECT criterio, multiplicador, observacao
    FROM public.preco_dinamico_entregador
    WHERE ativa = true
      AND (entregador_id IS NULL OR entregador_id = v_entrega.entregador_id)
    ORDER BY created_at
  LOOP
    IF v_driver_dynamic.criterio = 'MULTIPLICADOR' AND v_driver_dynamic.multiplicador IS NOT NULL THEN
      v_applied_driver_rules := v_applied_driver_rules || jsonb_build_array(
        jsonb_build_object(
          'criterio', v_driver_dynamic.criterio,
          'valor', v_total_comissao * (v_driver_dynamic.multiplicador - 1),
          'observacao', COALESCE(v_driver_dynamic.observacao, '')
        )
      );
      v_total_comissao := v_total_comissao * v_driver_dynamic.multiplicador;
    ELSIF v_driver_dynamic.criterio = 'TAXA_FIXA' AND v_driver_dynamic.multiplicador IS NOT NULL THEN
      v_applied_driver_rules := v_applied_driver_rules || jsonb_build_array(
        jsonb_build_object(
          'criterio', v_driver_dynamic.criterio,
          'valor', v_driver_dynamic.multiplicador,
          'observacao', COALESCE(v_driver_dynamic.observacao, '')
        )
      );
      v_total_comissao := v_total_comissao + v_driver_dynamic.multiplicador;
    END IF;
  END LOOP;

  v_debug_info := v_debug_info || jsonb_build_object('resultado_final', v_total_comissao, 'applied_driver_rules', v_applied_driver_rules);

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, rpc_response, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao_debug', 'resultado_final',
          v_debug_info,
          jsonb_build_object('success', true, 'total', v_total_comissao, 'destinos', v_comissao_destinos, 'retorno', v_comissao_retorno, 'valor_total', v_total_comissao, 'applied_driver_rules', v_applied_driver_rules),
          auth.uid());

  RETURN jsonb_build_object(
    'success', true,
    'total', v_total_comissao,
    'destinos', v_comissao_destinos,
    'retorno', v_comissao_retorno,
    'valor_total', v_total_comissao,
    'applied_driver_rules', v_applied_driver_rules
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_entrega_comissao_debug(uuid) TO authenticated;
