-- ============================================================================
-- SEGURANÇA C2 — admin_update_password: exigir autorização de admin
--
-- Antes: existiam DUAS overloads, ambas GRANT ... TO authenticated e SEM
-- checar quem chama:
--   * admin_update_password(uuid, text)
--   * admin_update_password(uuid, text, text DEFAULT NULL)   <- a que o app usa
-- Qualquer autenticado trocava a senha de qualquer conta (incl. admin) e ainda
-- recriava contas deletadas em auth.users (persistência).
--
-- Depois:
--   * a overload de 2 args é REMOVIDA (superfície a menos);
--   * a de 3 args só executa se public.is_admin();
--   * exige senha >= 10 chars;
--   * revoga de public/anon.
--   * mantém o "reparo de login quebrado" (fallback de recriação) porque agora
--     só admin chega aqui — era o motivo da migration 20260722160000.
-- ============================================================================

drop function if exists public.admin_update_password(uuid, text);

create or replace function public.admin_update_password(
  target_user_id uuid,
  new_password   text,
  new_email      text default null::text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_clean_email text;
  v_auth_id     uuid;
  v_rows        int;
begin
  -- ---- AUTORIZAÇÃO ---------------------------------------------------------
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_password is null or length(new_password) < 10 then
    raise exception 'senha deve ter ao menos 10 caracteres';
  end if;
  -- ------------------------------------------------------------------------

  v_clean_email := nullif(lower(trim(new_email)), '');

  select id into v_auth_id from auth.users where id = target_user_id;

  if v_auth_id is null and v_clean_email is not null then
    select id into v_auth_id from auth.users where email = v_clean_email;
  end if;

  if v_auth_id is null then
    v_auth_id := target_user_id;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
      email = coalesce(v_clean_email, email),
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider": "email", "providers": ["email"]}'::jsonb,
      aud = 'authenticated',
      role = 'authenticated',
      instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, '')
  where id = v_auth_id;

  get diagnostics v_rows = row_count;

  if v_rows = 0 and v_clean_email is not null then
    begin
      insert into auth.users (
        instance_id, id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', target_user_id, v_clean_email,
        extensions.crypt(new_password, extensions.gen_salt('bf', 10)), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', 'Recuperado'),
        'authenticated', 'authenticated', now(), now(),
        '', '', '', ''
      );
    exception when unique_violation then
      raise exception 'Erro: e-mail já existe em outro usuário. Verifique a duplicidade.';
    end;
  end if;
end;
$function$;

revoke all on function public.admin_update_password(uuid, text, text) from public, anon;
grant execute on function public.admin_update_password(uuid, text, text) to authenticated, service_role;
