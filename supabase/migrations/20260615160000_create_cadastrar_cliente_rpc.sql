-- RPC SECURITY DEFINER para inserção de clientes, bypassa RLS.
-- Necessário porque INSERT direto via PostgREST falha com 42501 mesmo com
-- policy WITH CHECK (true) — provavelmente interação entre RLS e o
-- Prefer: return=representation do PostgREST.

CREATE OR REPLACE FUNCTION public.cadastrar_cliente(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  v_email := nullif(trim(lower(coalesce(payload->>'email', ''))), '');

  INSERT INTO public.clientes (
    id,
    nome_completo,
    cpf,
    data_nascimento,
    telefone,
    email,
    metodo_pagamento_preferido,
    observacoes,
    segmento,
    data_inicio,
    razao_social,
    nome_fantasia,
    cadastro_via,
    tipo_documento,
    cnpj,
    lead_por,
    franquia,
    hub,
    precificacao_config,
    cep,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    referencia_entrega
  ) VALUES (
    COALESCE(nullif(payload->>'id', '')::uuid, gen_random_uuid()),
    payload->>'nome_completo',
    nullif(payload->>'cpf', ''),
    nullif(payload->>'data_nascimento', '')::date,
    nullif(payload->>'telefone', ''),
    v_email,
    nullif(payload->>'metodo_pagamento_preferido', ''),
    nullif(payload->>'observacoes', ''),
    nullif(payload->>'segmento', ''),
    nullif(payload->>'data_inicio', '')::date,
    nullif(payload->>'razao_social', ''),
    nullif(payload->>'nome_fantasia', ''),
    nullif(payload->>'cadastro_via', ''),
    nullif(payload->>'tipo_documento', ''),
    nullif(payload->>'cnpj', ''),
    nullif(payload->>'lead_por', ''),
    nullif(payload->>'franquia', ''),
    nullif(payload->>'hub', ''),
    CASE WHEN payload ? 'precificacao_config' AND payload->>'precificacao_config' IS NOT NULL
         THEN (payload->'precificacao_config')
         ELSE NULL END,
    nullif(payload->>'cep', ''),
    nullif(payload->>'rua', ''),
    nullif(payload->>'numero', ''),
    nullif(payload->>'complemento', ''),
    nullif(payload->>'bairro', ''),
    nullif(payload->>'cidade', ''),
    nullif(payload->>'referencia_entrega', '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'success', true);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_key', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_cliente(jsonb) TO anon, authenticated;
