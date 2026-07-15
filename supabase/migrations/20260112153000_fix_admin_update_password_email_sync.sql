DROP FUNCTION IF EXISTS public.admin_update_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_update_password(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_password(target_user_id uuid, new_password text, new_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_name text;
  v_rows int;
BEGIN
  -- Log the attempt for debugging
  RAISE LOG 'admin_update_password called for user % with email %', target_user_id, new_email;

  -- Update existing user in auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      email = COALESCE(new_email, email),
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider": "email", "providers": ["email"]}'::jsonb,
      aud = 'authenticated',
      role = 'authenticated'
  WHERE id = target_user_id;
  
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE LOG 'Updated % rows in auth.users', v_rows;

  -- If user not found, try to recreate it
  if v_rows = 0 then
    RAISE LOG 'User not found in auth.users, attempting recreation';
    
    -- Use provided email or fetch from public tables
    if new_email is not null then
      v_email := new_email;
      -- Try to get name from public tables for metadata
      select full_name into v_name from public.users where id = target_user_id;
      if v_name is null then
         select nome_completo into v_name from public.entregadores where id = target_user_id;
      end if;
      if v_name is null then
         select nome_completo into v_name from public.clientes where id = target_user_id;
      end if;
    else
      -- Fallback to fetching email from public tables
      select email, full_name into v_email, v_name from public.users where id = target_user_id;
      if v_email is null then
         select email, nome_completo into v_email, v_name from public.entregadores where id = target_user_id;
      end if;
      if v_email is null then
         select email, nome_completo into v_email, v_name from public.clientes where id = target_user_id;
      end if;
    end if;

    if v_email is not null then
      RAISE LOG 'Recreating user with email %', v_email;
      insert into auth.users (
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
      ) values (
        target_user_id,
        v_email,
        extensions.crypt(new_password, extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', coalesce(v_name, '')),
        'authenticated',
        'authenticated',
        now(),
        now()
      );
    else
      RAISE LOG 'Failed to find email for recreation';
      raise exception 'User not found in auth.users and no email found in public tables to recreate account.';
    end if;
  end if;
END;
$$;
