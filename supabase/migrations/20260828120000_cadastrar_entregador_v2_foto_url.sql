-- Auto-cadastro de entregador: passar a aceitar e gravar as URLs do Storage
-- (foto_url, cnh_foto_url, comprovante_residencia_url, documento_veiculo_url)
-- alem dos *_base64. O cliente agora sobe as imagens pro bucket `images` antes
-- de chamar a RPC e manda a URL no payload; o base64 fica so como fallback
-- quando o upload falha. Sem isso, toda foto de auto-cadastro ficava presa
-- como base64 gigante na tabela e nunca aparecia na lista do admin.
--
-- Correcao adicional (bug pre-existente desde 20260108183000): a versao
-- anterior montava _clientes_permitidos como text[] e inseria direto na coluna
-- entregadores.clientes_permitidos, que e jsonb -> "column is of type jsonb but
-- expression is of type text[]". Agora converte com to_jsonb() antes do INSERT.
-- Formato esperado: array de strings (UUIDs de clientes).

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
    foto_url,
    foto_base64,
    cnh_foto_url,
    cnh_foto_base64,
    comprovante_residencia_url,
    comprovante_residencia_base64,
    documento_veiculo_url,
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
    to_jsonb(_clientes_permitidos),
    payload->>'foto_url',
    payload->>'foto_base64',
    payload->>'cnh_foto_url',
    payload->>'cnh_foto_base64',
    payload->>'comprovante_residencia_url',
    payload->>'comprovante_residencia_base64',
    payload->>'documento_veiculo_url',
    payload->>'documento_veiculo_base64'
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_entregador_v2(jsonb) TO anon, authenticated, service_role;
