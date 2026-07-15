DROP FUNCTION IF EXISTS public.debug_check_user(text, text);

CREATE OR REPLACE FUNCTION public.debug_check_user(check_email text, check_password text DEFAULT NULL)
RETURNS TABLE (
  source_table text,
  user_uuid uuid,
  user_email text,
  password_hash_prefix text,
  password_match boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass text;
BEGIN
  -- Verifica auth.users
  SELECT au.encrypted_password INTO v_pass 
  FROM auth.users au 
  WHERE au.email = check_email;
  
  RETURN QUERY 
  SELECT 
    'auth.users'::text, 
    au.id, 
    au.email, 
    substring(au.encrypted_password from 1 for 10), 
    (v_pass = extensions.crypt(check_password, v_pass)) 
  FROM auth.users au 
  WHERE au.email = check_email;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'auth.users'::text, NULL::uuid, 'NOT FOUND'::text, NULL::text, NULL::boolean;
  END IF;

  -- Verifica public.users
  RETURN QUERY 
  SELECT 'public.users'::text, pu.id, pu.email, NULL::text, NULL::boolean 
  FROM public.users pu 
  WHERE pu.email = check_email;

  -- Verifica public.clientes
  RETURN QUERY 
  SELECT 'public.clientes'::text, pc.id, pc.email, NULL::text, NULL::boolean 
  FROM public.clientes pc 
  WHERE pc.email = check_email;
  
  -- Verifica public.entregadores
  RETURN QUERY 
  SELECT 'public.entregadores'::text, pe.id, pe.email, NULL::text, NULL::boolean 
  FROM public.entregadores pe 
  WHERE pe.email = check_email;
END;
$$;
