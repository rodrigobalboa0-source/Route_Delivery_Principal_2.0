CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role text;
  existing_user_id uuid;
BEGIN
  -- Verificar se já existe um usuário com este e-mail na tabela public.users (registro órfão)
  SELECT id INTO existing_user_id FROM public.users WHERE lower(email) = lower(NEW.email);

  -- Se existe e o ID é diferente do novo usuário (o que acontece quando recriamos um usuário deletado do Auth mas não do public)
  IF existing_user_id IS NOT NULL AND existing_user_id != NEW.id THEN
      -- Tenta remover o registro órfão para permitir o novo cadastro
      BEGIN
        DELETE FROM public.users WHERE id = existing_user_id;
      EXCEPTION WHEN OTHERS THEN
        -- Se falhar a remoção (por FKs), tenta "arquivar" o registro alterando o e-mail para liberar o unique constraint
        RAISE WARNING 'Não foi possível remover usuário órfão %: %. Tentando arquivar.', existing_user_id, SQLERRM;
        BEGIN
          UPDATE public.users 
          SET email = email || '_archived_' || gen_random_uuid()::text
          WHERE id = existing_user_id;
        EXCEPTION WHEN OTHERS THEN
          -- Se falhar o arquivamento, aí sim falha o processo, mas isso é muito improvável
          RAISE EXCEPTION 'Não foi possível resolver conflito de usuário órfão %: %', existing_user_id, SQLERRM;
        END;
      END;
  END IF;

  user_role := coalesce(new.raw_user_meta_data->>'role', '');
  
  if user_role = '' or user_role = 'user' then
    if exists (select 1 from public.entregadores e where lower(e.email) = lower(new.email)) then
      user_role := 'entregador';
    elsif exists (select 1 from public.clientes c where lower(c.email) = lower(new.email)) then
      user_role := 'cliente';
    else
      user_role := 'cliente';
    end if;
  end if;

  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    user_role
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;
  return new;
end;
$$;
