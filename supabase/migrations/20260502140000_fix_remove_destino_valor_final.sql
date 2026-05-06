CREATE OR REPLACE FUNCTION public.remove_destino(
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
  v_usuario_id uuid;
  v_total_destinos int;
  v_novo_endereco_texto text;
  v_novo_contato text;
  v_novo_telefone text;
  v_novo_cep text;
  v_novo_complemento text;
  v_novo_observacoes text;
  v_primeiro_ponto jsonb;
  v_novo_valor_entrega numeric;
  v_valor_salvo numeric;
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
      'message', 'Apenas e possivel remover destinos quando a entrega esta com status criada',
      'current_status', v_entrega.status
    );
  END IF;
  
  v_pontos_adicionais := COALESCE(v_entrega.pontos_adicionais, '[]'::jsonb);
  IF jsonb_typeof(v_pontos_adicionais) != 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_pontos_adicionais');
  END IF;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino_debug',
    'estado_inicial',
    jsonb_build_object(
      'etapa', 'estado_inicial',
      'valor_entrega_original', v_entrega.valor_entrega,
      'pricing_destinos_original', COALESCE(v_entrega.opcionais->'pricing_destinos', '[]'::jsonb),
      'pontos_adicionais_original', v_pontos_adicionais,
      'p_destino_index', p_destino_index
    ),
    v_usuario_id
  );
  
  v_total_destinos := 1 + jsonb_array_length(v_pontos_adicionais);
  
  IF v_total_destinos <= 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_remove_last_destination',
      'message', 'Nao e possivel remover o unico destino da entrega'
    );
  END IF;
  
  IF p_destino_index = -1 THEN
    
    IF jsonb_array_length(v_pontos_adicionais) = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'no_additional_destinations',
        'message', 'Nao e possivel remover o destino principal quando nao ha destinos adicionais'
      );
    END IF;
    
    v_primeiro_ponto := v_pontos_adicionais->0;
    
    v_destino_removido := jsonb_build_object(
      'tipo', 'principal',
      'endereco_texto', v_entrega.entrega_endereco_texto,
      'contato', v_entrega.entrega_contato,
      'telefone', v_entrega.entrega_telefone,
      'cep', v_entrega.entrega_cep,
      'complemento', v_entrega.entrega_complemento,
      'observacoes', v_entrega.entrega_observacoes
    );
    
    v_novo_endereco_texto := v_primeiro_ponto->>'endereco_texto';
    IF v_primeiro_ponto->>'numero' IS NOT NULL AND v_primeiro_ponto->>'numero' != '' THEN
      v_novo_endereco_texto := v_novo_endereco_texto || ', ' || (v_primeiro_ponto->>'numero');
    END IF;
    v_novo_contato := v_primeiro_ponto->>'contato';
    v_novo_telefone := v_primeiro_ponto->>'telefone';
    v_novo_cep := v_primeiro_ponto->>'cep';
    v_novo_complemento := v_primeiro_ponto->>'complemento';
    v_novo_observacoes := v_primeiro_ponto->>'observacoes';
    
    v_novos_pontos := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_pontos_adicionais) WITH ORDINALITY AS t(elem, ord)
      WHERE ord > 1
    );
    IF v_novos_pontos IS NULL THEN
      v_novos_pontos := '[]'::jsonb;
    END IF;
    
    v_pricing_destinos := COALESCE(v_entrega.opcionais->'pricing_destinos', '[]'::jsonb);
    IF jsonb_typeof(v_pricing_destinos) = 'array' AND jsonb_array_length(v_pricing_destinos) > 0 THEN
      v_novos_pricing := (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(v_pricing_destinos) WITH ORDINALITY AS t(elem, ord)
        WHERE ord > 1
      );
      IF v_novos_pricing IS NULL THEN
        v_novos_pricing := '[]'::jsonb;
      END IF;
    ELSE
      v_novos_pricing := '[]'::jsonb;
    END IF;

    INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
    VALUES (
      p_entrega_id,
      'remove_destino_debug',
      'apos_remocao_principal',
      jsonb_build_object(
        'etapa', 'apos_remocao',
        'v_novos_pricing', v_novos_pricing,
        'v_novos_pontos', v_novos_pontos,
        'p_destino_index', p_destino_index
      ),
      v_usuario_id
    );
    
    v_comissao_destinos := COALESCE(v_entrega.opcionais->'comissao_destinos', '[]'::jsonb);
    IF jsonb_typeof(v_comissao_destinos) = 'array' THEN
      v_novas_comissoes := (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(v_comissao_destinos) AS elem
        WHERE (elem->>'destino')::int > 2
      );
      IF v_novas_comissoes IS NULL THEN
        v_novas_comissoes := '[]'::jsonb;
      END IF;
    ELSE
      v_novas_comissoes := '[]'::jsonb;
    END IF;
    
    v_timeline := COALESCE(v_entrega.opcionais->'timeline', '{}'::jsonb);
    v_nova_timeline := '{}'::jsonb;
    
    FOR i IN 2..v_total_destinos LOOP
      IF v_timeline ? ('destino_' || i || '_concluido_em') THEN
        v_nova_timeline := v_nova_timeline || jsonb_build_object(
          ('destino_' || (i - 1) || '_concluido_em'),
          v_timeline->>('destino_' || i || '_concluido_em')
        );
      END IF;
      IF v_timeline ? ('destino_' || i || '_iniciado_em') THEN
        v_nova_timeline := v_nova_timeline || jsonb_build_object(
          ('destino_' || (i - 1) || '_iniciado_em'),
          v_timeline->>('destino_' || i || '_iniciado_em')
        );
      END IF;
      IF v_timeline ? ('destino_' || i || '_chegou_em') THEN
        v_nova_timeline := v_nova_timeline || jsonb_build_object(
          ('destino_' || (i - 1) || '_chegou_em'),
          v_timeline->>('destino_' || i || '_chegou_em')
        );
      END IF;
    END LOOP;
    
    v_destino_atual_indice := COALESCE((v_entrega.opcionais->>'destino_atual_indice')::int, 0);
    v_novo_destino_atual_indice := GREATEST(0, v_destino_atual_indice - 1);
    
    v_historico_remocao := COALESCE(v_entrega.opcionais->'destinos_removidos', '[]'::jsonb);
    v_historico_remocao := v_historico_remocao || jsonb_build_object(
      'destino_index', -1,
      'destino_label', 'Destino Principal',
      'destino_dados', v_destino_removido,
      'removido_em', now(),
      'removido_por', v_usuario_id,
      'motivo', p_motivo
    );
    
    UPDATE public.nova_entrega
    SET
      pontos_adicionais = CASE WHEN jsonb_array_length(v_novos_pontos) > 0 THEN v_novos_pontos ELSE NULL END,
      entrega_endereco_texto = v_novo_endereco_texto,
      entrega_contato = v_novo_contato,
      entrega_telefone = v_novo_telefone,
      entrega_cep = v_novo_cep,
      entrega_complemento = v_novo_complemento,
      entrega_observacoes = v_novo_observacoes,
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
    
  ELSIF p_destino_index >= 0 AND p_destino_index < jsonb_array_length(v_pontos_adicionais) THEN
    
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

    INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
    VALUES (
      p_entrega_id,
      'remove_destino_debug',
      'apos_remocao_adicional',
      jsonb_build_object(
        'etapa', 'apos_remocao',
        'v_novos_pricing', v_novos_pricing,
        'v_novos_pontos', v_novos_pontos,
        'p_destino_index', p_destino_index
      ),
      v_usuario_id
    );
    
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
    v_nova_timeline := '{}'::jsonb;
    
    FOR i IN 1..v_total_destinos LOOP
      IF i = p_destino_index + 2 THEN
        CONTINUE;
      END IF;
      
      DECLARE
        v_new_index int;
      BEGIN
        IF i < p_destino_index + 2 THEN
          v_new_index := i;
        ELSE
          v_new_index := i - 1;
        END IF;
        
        IF v_timeline ? ('destino_' || i || '_concluido_em') THEN
          v_nova_timeline := v_nova_timeline || jsonb_build_object(
            ('destino_' || v_new_index || '_concluido_em'),
            v_timeline->>('destino_' || i || '_concluido_em')
          );
        END IF;
        IF v_timeline ? ('destino_' || i || '_iniciado_em') THEN
          v_nova_timeline := v_nova_timeline || jsonb_build_object(
            ('destino_' || v_new_index || '_iniciado_em'),
            v_timeline->>('destino_' || i || '_iniciado_em')
          );
        END IF;
        IF v_timeline ? ('destino_' || i || '_chegou_em') THEN
          v_nova_timeline := v_nova_timeline || jsonb_build_object(
            ('destino_' || v_new_index || '_chegou_em'),
            v_timeline->>('destino_' || i || '_chegou_em')
          );
        END IF;
      END;
    END LOOP;
    
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
    
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_index',
      'message', 'Indice de destino invalido',
      'index', p_destino_index,
      'total_destinos', v_total_destinos
    );
  END IF;
  
  v_novo_valor_entrega := 0;

  IF jsonb_typeof(v_novos_pricing) = 'array' AND jsonb_array_length(v_novos_pricing) > 0 THEN
    FOR i IN 0..jsonb_array_length(v_novos_pricing) - 1 LOOP
      v_novo_valor_entrega := v_novo_valor_entrega + COALESCE((v_novos_pricing->i->>'valor')::numeric, 0);
    END LOOP;
  ELSE
    v_novo_valor_entrega := COALESCE(v_entrega.valor_entrega, 0);
  END IF;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino_debug',
    'apos_calculo',
    jsonb_build_object(
      'etapa', 'apos_calculo',
      'v_novo_valor_entrega', v_novo_valor_entrega,
      'v_novos_pricing_usado', v_novos_pricing
    ),
    v_usuario_id
  );

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino_debug',
    'antes_update',
    jsonb_build_object(
      'etapa', 'antes_update',
      'valor_a_ser_salvo', v_novo_valor_entrega
    ),
    v_usuario_id
  );

  UPDATE public.nova_entrega
  SET valor_entrega = v_novo_valor_entrega,
      updated_at = now()
  WHERE id = p_entrega_id;

  SELECT valor_entrega INTO v_valor_salvo
  FROM public.nova_entrega
  WHERE id = p_entrega_id;

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino_debug',
    'apos_update',
    jsonb_build_object(
      'etapa', 'apos_update',
      'valor_calculado', v_novo_valor_entrega,
      'valor_salvo_no_banco', v_valor_salvo,
      'valor_correspondente', (v_novo_valor_entrega = v_valor_salvo)
    ),
    v_usuario_id
  );

  INSERT INTO public.delivery_logs (delivery_id, action, description, new_data, created_by)
  VALUES (
    p_entrega_id,
    'remove_destino',
    'destino_removido',
    jsonb_build_object(
      'destino_index', p_destino_index,
      'destino_label', CASE WHEN p_destino_index = -1 THEN 'Destino Principal' ELSE 'Destino ' || (p_destino_index + 2) END,
      'destino_dados', v_destino_removido,
      'motivo', p_motivo,
      'usuario_id', v_usuario_id,
      'valor_entrega_anterior', v_entrega.valor_entrega,
      'valor_entrega_atualizado', v_novo_valor_entrega,
      'pricing_destinos_anterior', v_pricing_destinos,
      'pricing_destinos_novo', v_novos_pricing
    ),
    v_usuario_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Destino removido com sucesso',
    'destino_removido', v_destino_removido,
    'destino_index', p_destino_index,
    'valor_entrega_anterior', v_entrega.valor_entrega,
    'valor_entrega_atualizado', v_novo_valor_entrega
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_destino(uuid, int, text) TO authenticated;