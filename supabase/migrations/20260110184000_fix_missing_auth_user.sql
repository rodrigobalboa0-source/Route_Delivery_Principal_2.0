create or replace function admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text;
begin
  -- Tenta atualizar o usuário existente no Auth
  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now(),
      confirmed_at = coalesce(confirmed_at, now()),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider": "email", "providers": ["email"]}'::jsonb
  where id = target_user_id;

  -- Se não encontrou no Auth (update retornou 0 linhas), tenta recriar o usuário
  if not found then
    -- Busca email e nome na tabela users publica
    select email, full_name into v_email, v_name from public.users where id = target_user_id;
    
    -- Se não achou em users, busca em entregadores
    if v_email is null then
       select email, nome_completo into v_email, v_name from public.entregadores where id = target_user_id;
    end if;
    
    -- Se não achou em entregadores, busca em clientes
    if v_email is null then
       select email, nome_completo into v_email, v_name from public.clientes where id = target_user_id;
    end if;

    -- Se encontrou um email válido, insere manualmente no auth.users
    if v_email is not null then
      insert into auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at,
        is_super_admin
      ) values (
        target_user_id,
        '00000000-0000-0000-0000-000000000000',
        v_email,
        extensions.crypt(new_password, extensions.gen_salt('bf')),
        now(),
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', coalesce(v_name, '')),
        'authenticated',
        'authenticated',
        now(),
        now(),
        false
      );
    else
      -- Se não tem email em lugar nenhum, não tem como recuperar
      raise exception 'User not found in auth.users and no email found in public tables to recreate account.';
    end if;
  end if;
end;
$$;

revoke all on function admin_update_password(uuid, text) from public;
grant execute on function admin_update_password(uuid, text) to authenticated;
grant execute on function admin_update_password(uuid, text) to service_role;
