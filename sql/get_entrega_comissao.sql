CREATE OR REPLACE FUNCTION public.get_entrega_comissao(entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v_cliente_id uuid;
  v_distancia_km numeric;
  v_retorno boolean;
  v_pontos_adicionais jsonb;
  v_opcionais jsonb;
  v_valor_entregador numeric;
  km numeric;
  points_count int;
  per_point numeric;
  base_val numeric;
  return_val numeric;
  total_val numeric;
  faixas jsonb;
  destinos jsonb := '[]'::jsonb;
  seg jsonb;
  seg_km numeric;
  seg_base numeric;
  seg_extra numeric;
  seg_val numeric;
  idx int := 0;
BEGIN
  SELECT
    cliente_id,
    distancia_km,
    retorno,
    pontos_adicionais,
    opcionais,
    valor_entregador
  INTO
    v_cliente_id,
    v_distancia_km,
    v_retorno,
    v_pontos_adicionais,
    v_opcionais,
    v_valor_entregador
  FROM public.nova_entrega
  WHERE id = entrega_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'entrega_not_found');
  END IF;

  km := COALESCE(v_distancia_km, 0);
  points_count := (
    SELECT COUNT(*)
    FROM jsonb_array_elements(COALESCE(v_pontos_adicionais, '[]'::jsonb)) p
    WHERE COALESCE(btrim(p->>'endereco_texto'), '') <> ''
  );

  SELECT *
  INTO t
  FROM public.tabelas_comissoes tc
  WHERE tc.cliente_ids @> jsonb_build_array(v_cliente_id::text)
  ORDER BY tc.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
    VALUES (
      entrega_id,
      'commission_calc',
      'commission_table_not_found',
      jsonb_build_object('cliente_id', v_cliente_id, 'km', km, 'points_count', points_count),
      auth.uid()
    );
    RETURN jsonb_build_object('success', false, 'error', 'commission_table_not_found', 'cliente_id', v_cliente_id);
  END IF;

  SELECT jsonb_agg(jsonb_build_object('km_ate', f.km_ate, 'valor', f.valor) ORDER BY f.km_ate)
  INTO faixas
  FROM public.tabelas_comissoes_faixas f
  WHERE f.tabela_id = t.id;

  IF faixas IS NULL THEN
    faixas := '[]'::jsonb;
  END IF;

  base_val := 0;
  IF jsonb_array_length(faixas) > 0 THEN
    SELECT (elem->>'valor')::numeric
    INTO base_val
    FROM jsonb_array_elements(faixas) elem
    WHERE (elem->>'km_ate')::numeric >= km
    ORDER BY (elem->>'km_ate')::numeric
    LIMIT 1;

    IF base_val IS NULL THEN
      SELECT (elem->>'valor')::numeric
      INTO base_val
      FROM jsonb_array_elements(faixas) elem
      ORDER BY (elem->>'km_ate')::numeric DESC
      LIMIT 1;
    END IF;
  END IF;

  per_point := COALESCE(t.valor_por_ponto, 0);
  base_val := COALESCE(base_val, 0) + (per_point * points_count);

  return_val := 0;
  IF COALESCE(v_retorno, false) THEN
    IF COALESCE(t.valor_retorno, 0) > 0 THEN
      IF lower(COALESCE(t.tipo_retorno, '')) IN ('percentual', 'porcentagem') THEN
        return_val := base_val * (COALESCE(t.valor_retorno, 0) / 100);
      ELSE
        return_val := COALESCE(t.valor_retorno, 0);
      END IF;
    ELSE
      return_val := base_val * 0.2;
    END IF;
  END IF;

  total_val := base_val + return_val;

  IF COALESCE(v_opcionais, '{}'::jsonb) ? 'pricing_destinos' THEN
    FOR seg IN SELECT jsonb_array_elements(COALESCE(v_opcionais->'pricing_destinos', '[]'::jsonb))
    LOOP
      idx := idx + 1;
      seg_km := COALESCE((seg->>'km')::numeric, 0);
      seg_base := 0;

      IF jsonb_array_length(faixas) > 0 THEN
        SELECT (elem->>'valor')::numeric
        INTO seg_base
        FROM jsonb_array_elements(faixas) elem
        WHERE (elem->>'km_ate')::numeric >= seg_km
        ORDER BY (elem->>'km_ate')::numeric
        LIMIT 1;

        IF seg_base IS NULL THEN
          SELECT (elem->>'valor')::numeric
          INTO seg_base
          FROM jsonb_array_elements(faixas) elem
          ORDER BY (elem->>'km_ate')::numeric DESC
          LIMIT 1;
        END IF;
      END IF;

      seg_extra := CASE WHEN idx >= 2 THEN per_point ELSE 0 END;
      seg_val := COALESCE(seg_base, 0) + seg_extra;
      destinos := destinos || jsonb_build_array(jsonb_build_object('destino', idx, 'km', seg_km, 'valor', seg_val));
    END LOOP;
  END IF;

  UPDATE public.nova_entrega
  SET
    valor_entregador = CASE WHEN COALESCE(valor_entregador, 0) = 0 THEN total_val ELSE valor_entregador END,
    opcionais = COALESCE(opcionais, '{}'::jsonb) || jsonb_build_object(
      'comissao_total', total_val,
      'comissao_retorno', CASE WHEN return_val > 0 THEN return_val ELSE NULL END,
      'comissao_destinos', destinos
    ),
    updated_at = now()
  WHERE id = entrega_id;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    entrega_id,
    'commission_calc',
    'commission_computed',
    jsonb_build_object(
      'cliente_id', v_cliente_id,
      'tabela_id', t.id,
      'km', km,
      'points_count', points_count,
      'total', total_val,
      'destinos', destinos
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'total', total_val,
    'retorno', CASE WHEN return_val > 0 THEN return_val ELSE NULL END,
    'destinos', destinos,
    'tabela_id', t.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_entrega_comissao(uuid) TO authenticated;
