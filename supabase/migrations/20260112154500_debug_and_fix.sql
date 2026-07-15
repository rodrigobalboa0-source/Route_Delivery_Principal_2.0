-- Atualiza a função admin_update_password para usar custo 10 na criptografia (padrão do Supabase Auth)
CREATE OR REPLACE FUNCTION public.admin_update_password(target_user_id uuid, new_password text, new_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_clean_email text;
  v_name text;
  v_rows int;
BEGIN
  v_clean_email := NULLIF(TRIM(new_email), '');
  
  RAISE LOG 'admin_update_password called for user % with email %', target_user_id, new_email;

  -- IMPORTANTE: Usando gen_salt('bf', 10) para garantir compatibilidade total com o Auth do Supabase
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
      email = COALESCE(v_clean_email, email),
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider": "email", "providers": ["email"]}'::jsonb,
      aud = 'authenticated',
      role = 'authenticated'
  WHERE id = target_user_id;
  
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  if v_rows = 0 then
    -- Lógica de recriação (fallback)
    if v_clean_email is not null then
      v_email := v_clean_email;
      select full_name into v_name from public.users where id = target_user_id;
      if v_name is null then select nome_completo into v_name from public.entregadores where id = target_user_id; end if;
      if v_name is null then select nome_completo into v_name from public.clientes where id = target_user_id; end if;
    else
      select email, full_name into v_email, v_name from public.users where id = target_user_id;
      if v_email is null then select email, nome_completo into v_email, v_name from public.entregadores where id = target_user_id; end if;
      if v_email is null then select email, nome_completo into v_email, v_name from public.clientes where id = target_user_id; end if;
    end if;

    if v_email is not null then
      insert into auth.users (
        id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
      ) values (
        target_user_id, v_email, extensions.crypt(new_password, extensions.gen_salt('bf', 10)), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', coalesce(v_name, '')),
        'authenticated', 'authenticated', now(), now()
      );
    else
      raise exception 'User not found and no email for recreation.';
    end if;
  end if;
END;
$$;

-- Função para testar login diretamente do Frontend (simula o Auth)
CREATE OR REPLACE FUNCTION public.test_login_rpc(check_email text, check_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass text;
  v_match boolean;
BEGIN
  SELECT encrypted_password INTO v_pass FROM auth.users WHERE email = LOWER(TRIM(check_email));
  
  IF v_pass IS NULL THEN 
    RETURN 'ERRO: Email não encontrado no banco auth.users'; 
  END IF;
  
  v_match := (v_pass = extensions.crypt(check_password, v_pass));
  
  IF v_match THEN
    RETURN 'SUCESSO: Senha confere no banco! Se o login falha, é algo no GoTrue/Supabase Cloud.';
  ELSE
    RETURN 'FALHA: A senha enviada não confere com o hash no banco. Verifique espaços ou caracteres especiais.';
  END IF;
END;
$$;
