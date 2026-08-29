-- Contas Gerenciais nao logavam: a aba "Contas Gerenciais" (ContasPanel)
-- so inseria uma linha em public.contas_gerenciais com um hash SHA-256 da senha
-- -- que nada le no login. Nao criava auth.users (credencial do GoTrue) nem
-- public.users(role='operador') (papel que o App resolve). Resultado: a conta
-- nunca conseguia entrar.
--
-- Esta RPC provisiona a conta de verdade, no mesmo padrao "GoTrue self-hosted
-- seguro" de admin_update_password / cadastrar_entregador_v2:
--   * auth.users com instance_id zeros, tokens '' (nao NULL), email_confirmed_at
--     preenchido, senha via bcrypt cost 10 (crypt/gen_salt), aud/role
--     'authenticated', raw_app_meta_data provider=email
--   * public.users com role='operador' (reforca o que o trigger handle_new_user
--     ja faz a partir do raw_user_meta_data.role)
--   * contas_gerenciais criada OU atualizada (mantendo nivel_permissao para
--     granularidade futura); senha_hash SHA-256 deixa de ser gravado (fica NULL)
--
-- Idempotente para o e-mail: se ja existe linha em contas_gerenciais para o
-- e-mail mas nao existe auth.users, ela e reaproveitada (util para migrar
-- contas antigas). Se ja existe auth.users para o e-mail, aborta com erro claro.

CREATE OR REPLACE FUNCTION public.cadastrar_conta_gerencial(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text := NULLIF(lower(trim(payload->>'email_acesso')), '');
  v_senha    text := payload->>'senha';
  v_nome     text := NULLIF(trim(payload->>'nome_completo'), '');
  v_login    text := NULLIF(lower(trim(payload->>'usuario_login')), '');
  v_new_id   uuid := gen_random_uuid();
  v_conta_id uuid;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'E-mail de acesso e obrigatorio.';
  END IF;
  IF v_senha IS NULL OR length(v_senha) < 6 THEN
    RAISE EXCEPTION 'Senha e obrigatoria (minimo 6 caracteres).';
  END IF;

  -- E-mail ja usado por qualquer conta do sistema (cliente, entregador, outro operador)?
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'Este e-mail ja esta em uso por outra conta do sistema.';
  END IF;

  -- usuario_login duplicado em OUTRA conta gerencial?
  IF v_login IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.contas_gerenciais
       WHERE lower(usuario_login) = v_login
         AND lower(coalesce(email_acesso, '')) <> v_email
     ) THEN
    RAISE EXCEPTION 'Ja existe uma conta gerencial com este usuario de login.';
  END IF;

  -- Nome: usa o do payload; se ausente, tenta o da linha existente; senao o e-mail.
  IF v_nome IS NULL THEN
    SELECT nome_completo INTO v_nome FROM public.contas_gerenciais WHERE lower(email_acesso) = v_email;
  END IF;
  v_nome := coalesce(v_nome, v_email);

  -- 1) auth.users (GoTrue)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_senha, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', v_nome, 'role', 'operador'),
    now(), now(),
    '', '', '', ''
  );

  -- 2) public.users com role='operador' (o trigger on_auth_user_created ja cria
  --    a linha a partir de raw_user_meta_data.role; aqui garantimos o valor).
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (v_new_id, v_email, v_nome, 'operador')
  ON CONFLICT (id) DO UPDATE
    SET role = 'operador', email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  -- 3) contas_gerenciais: atualiza a linha existente do e-mail, ou cria uma nova.
  UPDATE public.contas_gerenciais SET
    nome_completo   = v_nome,
    cargo           = coalesce(NULLIF(trim(payload->>'cargo'), ''), cargo),
    telefone        = coalesce(NULLIF(trim(payload->>'telefone'), ''), telefone),
    usuario_login   = coalesce(v_login, usuario_login),
    nivel_permissao = coalesce(NULLIF(payload->>'nivel_permissao', ''), nivel_permissao),
    status          = coalesce(NULLIF(payload->>'status', ''), status),
    senha_hash      = NULL,
    updated_at      = now()
  WHERE lower(email_acesso) = v_email
  RETURNING id INTO v_conta_id;

  IF v_conta_id IS NULL THEN
    INSERT INTO public.contas_gerenciais (
      nome_completo, cargo, email_acesso, telefone, usuario_login, nivel_permissao, status
    ) VALUES (
      v_nome,
      NULLIF(trim(payload->>'cargo'), ''),
      v_email,
      NULLIF(trim(payload->>'telefone'), ''),
      v_login,
      coalesce(NULLIF(payload->>'nivel_permissao', ''), 'operacional'),
      coalesce(NULLIF(payload->>'status', ''), 'ativa')
    )
    RETURNING id INTO v_conta_id;
  END IF;

  RETURN jsonb_build_object('id', v_conta_id, 'auth_user_id', v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cadastrar_conta_gerencial(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.cadastrar_conta_gerencial(jsonb) TO authenticated, service_role;
