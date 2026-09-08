-- ============================================================================
-- SEGURANÇA C3 — cadastrar_conta_gerencial: exigir admin (com bootstrap)
--
-- Antes: GRANT ... TO authenticated e sem checagem. Qualquer autenticado criava
-- uma conta role='operador' (backdoor persistente).
--
-- Depois: só executa se
--   * public.is_admin(), OU
--   * ainda não existe NENHUMA conta admin/operador no sistema (bootstrap da
--     primeira conta), OU
--   * chamado pelo service_role.
-- Revoga de anon.
-- ============================================================================

create or replace function public.cadastrar_conta_gerencial(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := nullif(lower(trim(payload->>'email_acesso')), '');
  v_senha    text := payload->>'senha';
  v_nome     text := nullif(trim(payload->>'nome_completo'), '');
  v_login    text := nullif(lower(trim(payload->>'usuario_login')), '');
  v_new_id   uuid := gen_random_uuid();
  v_conta_id uuid;
  v_has_admin boolean;
begin
  -- ---- AUTORIZAÇÃO -------------------------------------------------------
  -- Libera: (a) chamada de infra (não via PostgREST), (b) service key,
  -- (c) admin logado, (d) bootstrap — ainda não existe conta admin/operador.
  select exists (select 1 from public.users where role in ('admin', 'operador'))
    into v_has_admin;

  if session_user = 'authenticator'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.is_admin()
     and v_has_admin then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- ---------------------------------------------------------------------

  if v_email is null then
    raise exception 'E-mail de acesso e obrigatorio.';
  end if;
  if v_senha is null or length(v_senha) < 8 then
    raise exception 'Senha e obrigatoria (minimo 8 caracteres).';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Este e-mail ja esta em uso por outra conta do sistema.';
  end if;

  if v_login is not null and exists (
       select 1 from public.contas_gerenciais
       where lower(usuario_login) = v_login
         and lower(coalesce(email_acesso, '')) <> v_email
     ) then
    raise exception 'Ja existe uma conta gerencial com este usuario de login.';
  end if;

  if v_nome is null then
    select nome_completo into v_nome from public.contas_gerenciais where lower(email_acesso) = v_email;
  end if;
  v_nome := coalesce(v_nome, v_email);

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_senha, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', v_nome, 'role', 'operador'),
    now(), now(),
    '', '', '', ''
  );

  insert into public.users (id, email, full_name, role)
  values (v_new_id, v_email, v_nome, 'operador')
  on conflict (id) do update
    set role = 'operador', email = excluded.email, full_name = excluded.full_name;

  update public.contas_gerenciais set
    nome_completo   = v_nome,
    cargo           = coalesce(nullif(trim(payload->>'cargo'), ''), cargo),
    telefone        = coalesce(nullif(trim(payload->>'telefone'), ''), telefone),
    usuario_login   = coalesce(v_login, usuario_login),
    nivel_permissao = coalesce(nullif(payload->>'nivel_permissao', ''), nivel_permissao),
    status          = coalesce(nullif(payload->>'status', ''), status),
    senha_hash      = null,
    updated_at      = now()
  where lower(email_acesso) = v_email
  returning id into v_conta_id;

  if v_conta_id is null then
    insert into public.contas_gerenciais (
      nome_completo, cargo, email_acesso, telefone, usuario_login, nivel_permissao, status
    ) values (
      v_nome,
      nullif(trim(payload->>'cargo'), ''),
      v_email,
      nullif(trim(payload->>'telefone'), ''),
      v_login,
      coalesce(nullif(payload->>'nivel_permissao', ''), 'operacional'),
      coalesce(nullif(payload->>'status', ''), 'ativa')
    )
    returning id into v_conta_id;
  end if;

  return jsonb_build_object('id', v_conta_id, 'auth_user_id', v_new_id);
end;
$$;

revoke all on function public.cadastrar_conta_gerencial(jsonb) from public, anon;
grant execute on function public.cadastrar_conta_gerencial(jsonb) to authenticated, service_role;
