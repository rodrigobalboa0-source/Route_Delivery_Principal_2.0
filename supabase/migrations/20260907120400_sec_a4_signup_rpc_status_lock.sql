-- ============================================================================
-- SEGURANÇA A4 — cadastrar_entregador_v2: não deixar o payload definir 'status'
--
-- Antes: status := COALESCE(payload->>'status', 'em_analise'). Um atacante
-- chamava a RPC (é TO anon) com {"status":"ativo"} e criava um entregador já
-- APROVADO, pulando a análise.
--
-- Depois: quando o chamador NÃO é admin nem service_role, status é forçado a
-- 'em_analise'. Admin continua podendo criar já 'ativo' pelo painel.
-- (O 'id' do payload continua aceito — é um UUID aleatório que o cliente gera
--  para nomear os arquivos no Storage antes da RPC; colisão de PK só dá erro.)
-- ============================================================================

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
  _status text;
  _privileged boolean;
BEGIN
  -- "privilegiado" = chamada de infra (não via PostgREST), OU service key,
  -- OU admin logado. Qualquer outro (anon no /cadastro, entregador comum) não.
  _privileged := session_user <> 'authenticator'
                 or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
                 or public.is_admin();

  -- status: só admin/serviço escolhe; qualquer outro entra em análise
  IF _privileged THEN
    _status := COALESCE(NULLIF(payload->>'status', ''), 'em_analise');
  ELSE
    _status := 'em_analise';
  END IF;

  BEGIN
    _id := (payload->>'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    _id := NULL;
  END;
  IF _id IS NULL THEN
    _id := gen_random_uuid();
  END IF;

  SELECT COALESCE(array_agg(x), ARRAY[]::text[])
  INTO _clientes_permitidos
  FROM jsonb_array_elements_text(payload->'clientes_permitidos') t(x);

  INSERT INTO public.entregadores (
    id, nome_completo, cpf, rg, data_nascimento, telefone, email,
    cep, rua, numero, complemento, bairro, cidade,
    veiculo_tipo, veiculo_modelo, veiculo_placa, veiculo_ano, cnh_valida, tipo_entrega,
    status, restricao_clientes_modo, clientes_permitidos,
    foto_url, foto_base64, cnh_foto_url, cnh_foto_base64,
    comprovante_residencia_url, comprovante_residencia_base64,
    documento_veiculo_url, documento_veiculo_base64
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
    _status,
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

revoke all on function public.cadastrar_entregador_v2(jsonb) from public;
GRANT EXECUTE ON FUNCTION public.cadastrar_entregador_v2(jsonb) TO anon, authenticated, service_role;
