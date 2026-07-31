-- Corrige o fallback de recriação em admin_update_password: o INSERT em
-- auth.users não incluía instance_id nem os campos de token (confirmation_token,
-- recovery_token, email_change_token_new, email_change), que o GoTrue exige como
-- string vazia (não NULL) para conseguir carregar o usuário.
--
-- Sem instance_id correto, o GoTrue não encontra o usuário durante o login
-- (fica invisível para autenticação, mesmo com senha certa no banco). Sem os
-- campos de token como '', o GoTrue erra "Database error loading user" ao
-- tentar ler o registro. Isso deixou pelo menos 3 contas reais permanentemente
-- sem conseguir logar (frutofitcampinas@gmail.com entre elas), silenciosamente,
-- por até 6 meses.

CREATE OR REPLACE FUNCTION public.admin_update_password(target_user_id uuid, new_password text, new_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email text;
  v_clean_email text;
  v_auth_id uuid;
  v_rows int;
BEGIN
  -- 1. Limpa e normaliza o email
  v_clean_email := NULLIF(LOWER(TRIM(new_email)), '');

  -- 2. Tenta descobrir o ID real do usuário na tabela auth
  -- Primeiro tenta pelo ID passado
  SELECT id INTO v_auth_id FROM auth.users WHERE id = target_user_id;

  -- Se não achou pelo ID, mas tem email, tenta achar pelo email
  IF v_auth_id IS NULL AND v_clean_email IS NOT NULL THEN
     SELECT id INTO v_auth_id FROM auth.users WHERE email = v_clean_email;
     IF v_auth_id IS NOT NULL THEN
       RAISE LOG 'User ID mismatch corrected: Target % -> Found % via email %', target_user_id, v_auth_id, v_clean_email;
     END IF;
  END IF;

  -- Se ainda não achou ID, mantém o original para tentar criação (fallback)
  IF v_auth_id IS NULL THEN
     v_auth_id := target_user_id;
  END IF;

  RAISE LOG 'admin_update_password executing for ID % (Email: %)', v_auth_id, v_clean_email;

  -- 3. Atualiza a senha
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
      email = COALESCE(v_clean_email, email),
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
  WHERE id = v_auth_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 4. Se não atualizou ninguém, tenta recriar (Lógica de Fallback)
  if v_rows = 0 then
    -- Só executa se realmente não achou ninguém nem por ID nem por Email
    if v_clean_email is not null then
       -- Tenta inserir
       BEGIN
        insert into auth.users (
            instance_id, id, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) values (
            '00000000-0000-0000-0000-000000000000', target_user_id, v_clean_email, extensions.crypt(new_password, extensions.gen_salt('bf', 10)), now(),
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', 'Recuperado'), -- Simplificado
            'authenticated', 'authenticated', now(), now(),
            '', '', '', ''
        );
       EXCEPTION WHEN unique_violation THEN
          -- Se cair aqui, é porque o email já existe mas o ID era diferente e não pegamos no SELECT inicial (raro)
          RAISE EXCEPTION 'Erro: Email já existe em outro usuário. Verifique a duplicidade.';
       END;
    end if;
  end if;
END;
$function$;
