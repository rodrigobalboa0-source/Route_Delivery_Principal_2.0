CREATE OR REPLACE FUNCTION public.remove_destino_adicional(
  p_entrega_id uuid,
  p_destino_index int,
  p_motivo text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrega RECORD;
  v_pontos_adicionais jsonb;
  v_pricing_destinos jsonb;
  v_comissao_destinos jsonb;
  v_timeline jsonb;
  v_destino_atual_indice int;
  v_novos_pontos jsonb;
  v_novos_pricing jsonb;
  v_novas_comissoes jsonb;
  v_nova_timeline jsonb;
  v_destino_removido jsonb;
  v_historico_remocao jsonb;
  v_novo_destino_atual_indice int;
  v_comissao_result jsonb;
  v_usuario_id uuid;
BEGIN
  
  v_usuario_id := auth.uid();
  
  
  SELECT * INTO v_entrega
  FROM public.nova_entrega
  WHERE id = p_entrega_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'entrega_not_found');
  END IF;
  
  
  IF v_entrega.status != 'criada' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'message', 'Apenas é possível remover destinos quando a entrega está com status "criada"',
      'current_status', v_entrega.status
    );
  END IF;
  
  
  v_pontos_adicionais := COALESCE(v_entrega.pontos_adicionais, '[]'::jsonb);
  IF jsonb_typeof(v_pontos_adicionais) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_pontos_adicionais');
  END IF;
  
  
  IF p_destino_index < 0 OR p_destino_index >= jsonb_array_length(v_pontos_adicionais) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_index',
      'message', 'Índice de destino inválido',
      'index', p_destino_index,
      'total_destinos', jsonb_array_length(v_pontos_adicionais)
    );
  END IF;
  
  
  v_destino_removido := v_pontos_adicionais->p_destino_index;
  
  
  v_novos_pontos := (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(v_pontos_adicionais) WITH ORDINALITY AS t(elem, ord)
    WHERE ord != p_destino_index + 1
  );
  IF v_novos_pontos IS NULL THEN
    v_novos_pontos := '[]'::jsonb;
  END IF;
  
  
  v_pricing_destinos := COALESCE(v_entrega.opcionais->'pricing_destinos', '[]'::jsonb);
  IF jsonb_typeof(v_pricing_destinos) = 'array' THEN
    v_novos_pricing := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_pricing_destinos) WITH ORDINALITY AS t(elem, ord)
      WHERE ord != p_destino_index + 2  
    );
    IF v_novos_pricing IS NULL THEN
      v_novos_pricing := '[]'::jsonb;
    END IF;
  ELSE
    v_novos_pricing := '[]'::jsonb;
  END IF;
  
  
  v_comissao_destinos := COALESCE(v_entrega.opcionais->'comissao_destinos', '[]'::jsonb);
  IF jsonb_typeof(v_comissao_destinos) = 'array' THEN
    v_novas_comissoes := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_comissao_destinos) AS elem
      WHERE (elem->>'destino')::int != p_destino_index + 2
    );
    IF v_novas_comissoes IS NULL THEN
      v_novas_comissoes := '[]'::jsonb;
    END IF;
  ELSE
    v_novas_comissoes := '[]'::jsonb;
  END IF;
  
  
  v_timeline := COALESCE(v_entrega.opcionais->'timeline', '{}'::jsonb);
  v_nova_timeline := v_timeline;
  v_nova_timeline := v_nova_timeline - ('destino_' || (p_destino_index + 2) || '_concluido_em');
  v_nova_timeline := v_nova_timeline - ('destino_' || (p_destino_index + 2) || '_iniciado_em');
  v_nova_timeline := v_nova_timeline - ('destino_' || (p_destino_index + 2) || '_chegou_em');
  
  
  v_destino_atual_indice := COALESCE((v_entrega.opcionais->>'destino_atual_indice')::int, 0);
  IF v_destino_atual_indice > p_destino_index THEN
    v_novo_destino_atual_indice := v_destino_atual_indice - 1;
  ELSE
    v_novo_destino_atual_indice := v_destino_atual_indice;
  END IF;
  
  
  v_historico_remocao := COALESCE(v_entrega.opcionais->'destinos_removidos', '[]'::jsonb);
  v_historico_remocao := v_historico_remocao || jsonb_build_object(
    'destino_index', p_destino_index,
    'destino_label', 'Destino ' || (p_destino_index + 2),
    'destino_dados', v_destino_removido,
    'removido_em', now(),
    'removido_por', v_usuario_id,
    'motivo', p_motivo
  );
  
  
  UPDATE public.nova_entrega
  SET
    pontos_adicionais = CASE WHEN jsonb_array_length(v_novos_pontos) > 0 THEN v_novos_pontos ELSE NULL END,
    opcionais = jsonb_build_object(
      'pricing_destinos', CASE WHEN jsonb_array_length(v_novos_pricing) > 0 THEN v_novos_pricing ELSE NULL END,
      'comissao_destinos', CASE WHEN jsonb_array_length(v_novas_comissoes) > 0 THEN v_novas_comissoes ELSE NULL END,
      'timeline', v_nova_timeline,
      'destino_atual_indice', v_novo_destino_atual_indice,
      'destinos_removidos', v_historico_remocao
    ) || COALESCE(
      (
        SELECT v_entrega.opcionais - 'pricing_destinos' - 'comissao_destinos' - 'timeline' - 'destino_atual_indice' - 'destinos_removidos'
      ),
      '{}'::jsonb
    ),
    updated_at = now()
  WHERE id = p_entrega_id;
  
  
  SELECT * INTO v_comissao_result
  FROM public.get_entrega_comissao(p_entrega_id);
  
  
  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino_adicional',
    'destino_removido',
    jsonb_build_object(
      'destino_index', p_destino_index,
      'destino_label', 'Destino ' || (p_destino_index + 2),
      'destino_dados', v_destino_removido,
      'motivo', p_motivo,
      'usuario_id', v_usuario_id,
      'comissao_recalculada', v_comissao_result
    ),
    v_usuario_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Destino removido com sucesso',
    'destino_removido', v_destino_removido,
    'destino_index', p_destino_index,
    'comissao_recalculada', v_comissao_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_destino_adicional(uuid, int, text) TO authenticated;