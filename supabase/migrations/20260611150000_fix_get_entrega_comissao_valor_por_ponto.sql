CREATE OR REPLACE FUNCTION public.get_entrega_comissao(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entrega RECORD;
  v_tabela RECORD;
  v_tabela_precos RECORD;
  v_faixas RECORD;
  v_km numeric;
  v_base_comissao numeric;
  v_total_comissao numeric;
  v_retorno_comissao numeric;
  v_pontos_adicionais jsonb;
  v_comissao_destinos jsonb;
  v_comissao_retorno numeric;
  v_num_destinos int;
  v_valor_multiplo numeric;
  v_driver_dynamic RECORD;
BEGIN
  SELECT * INTO v_entrega FROM public.nova_entrega WHERE id = p_entrega_id;

  IF NOT FOUND THEN
    INSERT INTO public.delivery_logs (delivery_id, action, description, created_by)
    VALUES (p_entrega_id, 'get_entrega_comissao', 'entrega_not_found', auth.uid());
    RETURN jsonb_build_object('success', false, 'error', 'entrega_not_found');
  END IF;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao', 'entrega_found',
          jsonb_build_object('cliente_id', v_entrega.cliente_id,
                             'valor_entregador', v_entrega.valor_entregador,
                             'distancia_km', v_entrega.distancia_km), auth.uid());

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
    INSERT INTO public.delivery_logs (delivery_id, action, description, created_by)
    VALUES (p_entrega_id, 'get_entrega_comissao', 'tabela_comissao_not_found', auth.uid());
    RETURN jsonb_build_object('success', true, 'total', COALESCE(v_entrega.valor_entregador, 0),
                              'destinos', '[]'::jsonb, 'retorno', 0);
  END IF;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao', 'tabela_comissao_found',
          jsonb_build_object('tabela_id', v_tabela.id), auth.uid());

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
  END IF;

  v_km := COALESCE(v_entrega.distancia_km, 0);

  FOR v_faixas IN
    SELECT * FROM public.tabelas_comissoes_faixas
    WHERE tabela_id = v_tabela.id
    ORDER BY km_ate
  LOOP
    IF v_km <= v_faixas.km_ate THEN
      v_base_comissao := v_faixas.valor;
      EXIT;
    END IF;
  END LOOP;

  IF v_base_comissao IS NULL THEN
    SELECT valor INTO v_base_comissao
    FROM public.tabelas_comissoes_faixas
    WHERE tabela_id = v_tabela.id
    ORDER BY km_ate DESC
    LIMIT 1;
  END IF;

  v_base_comissao := COALESCE(v_base_comissao, 0);

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao', 'base_comissao',
          jsonb_build_object('km', v_km, 'base_comissao', v_base_comissao), auth.uid());

  v_pontos_adicionais := COALESCE(v_entrega.pontos_adicionais, '[]'::jsonb);
  IF jsonb_typeof(v_pontos_adicionais) != 'array' THEN
    v_pontos_adicionais := '[]'::jsonb;
  END IF;

  v_num_destinos := 1 + jsonb_array_length(v_pontos_adicionais);

  
  IF v_num_destinos > 1 AND v_tabela.valor_por_ponto IS NOT NULL AND v_tabela.valor_por_ponto > 0 THEN
    v_base_comissao := v_base_comissao + v_tabela.valor_por_ponto;
  END IF;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao', 'num_destinos',
          jsonb_build_object('num_destinos', v_num_destinos, 'valor_multiplo', v_valor_multiplo), auth.uid());

  IF v_num_destinos <= 1 THEN
    v_total_comissao := v_base_comissao;
    IF v_valor_multiplo > 0 THEN
      v_total_comissao := v_total_comissao + v_valor_multiplo;
    END IF;
  ELSE
    v_comissao_destinos := COALESCE(v_entrega.opcionais->'comissao_destinos', '[]'::jsonb);
    v_comissao_retorno := COALESCE((v_entrega.opcionais->'comissao_retorno')::numeric, 0);

    IF jsonb_typeof(v_comissao_destinos) = 'array' AND jsonb_array_length(v_comissao_destinos) > 0 THEN
      v_total_comissao := (SELECT SUM((elem->>'valor')::numeric)
                           FROM jsonb_array_elements(v_comissao_destinos) elem);
      v_total_comissao := COALESCE(v_total_comissao, 0) + v_comissao_retorno;
    ELSE
      IF v_valor_multiplo > 0 THEN
        v_total_comissao := v_base_comissao + (v_valor_multiplo * v_num_destinos);
      ELSE
        v_total_comissao := v_base_comissao;
      END IF;

      IF v_entrega.retorno = true AND v_tabela.valor_retorno IS NOT NULL AND v_tabela.valor_retorno > 0 THEN
        IF (v_tabela.tipo_retorno || '') = 'percentual' OR (v_tabela.tipo_retorno || '') = 'porcentagem' THEN
          v_total_comissao := v_total_comissao + (v_total_comissao * (v_tabela.valor_retorno / 100));
        ELSE
          v_total_comissao := v_total_comissao + v_tabela.valor_retorno;
        END IF;
      END IF;
    END IF;
  END IF;

  v_comissao_destinos := '[]'::jsonb;
  IF v_num_destinos > 1 AND v_valor_multiplo > 0 THEN
    FOR i IN 1..v_num_destinos LOOP
      DECLARE v_destino_comissao numeric;
      BEGIN
        v_destino_comissao := v_base_comissao + v_valor_multiplo;
        v_comissao_destinos := v_comissao_destinos ||
          jsonb_build_object('destino', i, 'valor', v_destino_comissao);
      END;
    END LOOP;
  END IF;

  FOR v_driver_dynamic IN
    SELECT criterio, multiplicador, observacao
    FROM public.preco_dinamico_entregador
    WHERE ativa = true
      AND (entregador_id IS NULL OR entregador_id = v_entrega.entregador_id)
    ORDER BY created_at
  LOOP
    IF v_driver_dynamic.criterio = 'MULTIPLICADOR' AND v_driver_dynamic.multiplicador IS NOT NULL THEN
      v_total_comissao := v_total_comissao * v_driver_dynamic.multiplicador;
    ELSIF v_driver_dynamic.criterio = 'TAXA_FIXA' AND v_driver_dynamic.multiplicador IS NOT NULL THEN
      v_total_comissao := v_total_comissao + v_driver_dynamic.multiplicador;
    END IF;
  END LOOP;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (p_entrega_id, 'get_entrega_comissao', 'final_result',
          jsonb_build_object('total_comissao', v_total_comissao), auth.uid());

  RETURN jsonb_build_object('success', true, 'total', v_total_comissao,
                            'destinos', v_comissao_destinos, 'retorno', v_comissao_retorno,
                            'valor_total', v_total_comissao);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_entrega_comissao(uuid) TO authenticated;
