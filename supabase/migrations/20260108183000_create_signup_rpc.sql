CREATE OR REPLACE FUNCTION public.cadastrar_entregador_v2(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  _id uuid;
  _clientes_permitidos text[];
BEGIN
  -- Extract ID safely
  BEGIN
    _id := (payload->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    _id := NULL;
  END;
  
  -- If ID is not provided, generate one
  IF _id IS NULL THEN
    _id := gen_random_uuid();
  END IF;

  -- Handle array conversion safely
  SELECT COALESCE(array_agg(x), ARRAY[]::text[])
  INTO _clientes_permitidos
  FROM jsonb_array_elements_text(payload->'clientes_permitidos') t(x);

  INSERT INTO public.entregadores (
    id,
    nome_completo,
    cpf,
    rg,
    data_nascimento,
    telefone,
    email,
    cep,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    veiculo_tipo,
    veiculo_modelo,
    veiculo_placa,
    veiculo_ano,
    cnh_valida,
    tipo_entrega,
    status,
    restricao_clientes_modo,
    clientes_permitidos,
    foto_base64,
    cnh_foto_base64,
    comprovante_residencia_base64,
    documento_veiculo_base64
  ) VALUES (
    _id,
    payload->>'nome_completo',
    payload->>'cpf',
    payload->>'rg',
    NULLIF(payload->>'data_nascimento', '')::date,
    payload->>'telefone',
    payload->>'email',
    payload->>'cep',
    payload->>'rua',
    payload->>'numero',
    payload->>'complemento',
    payload->>'bairro',
    payload->>'cidade',
    payload->>'veiculo_tipo',
    payload->>'veiculo_modelo',
    payload->>'veiculo_placa',
    NULLIF(payload->>'veiculo_ano', '')::int,
    COALESCE((payload->>'cnh_valida')::boolean, false),
    payload->>'tipo_entrega',
    COALESCE(payload->>'status', 'em_analise'),
    COALESCE(payload->>'restricao_clientes_modo', 'todos'),
    _clientes_permitidos,
    payload->>'foto_base64',
    payload->>'cnh_foto_base64',
    payload->>'comprovante_residencia_base64',
    payload->>'documento_veiculo_base64'
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_entregador_v2(jsonb) TO anon, authenticated, service_role;