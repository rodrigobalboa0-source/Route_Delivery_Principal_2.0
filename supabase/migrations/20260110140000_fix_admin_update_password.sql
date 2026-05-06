create extension if not exists pgcrypto schema extensions;

create or replace function admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = extensions, public
as $$
begin
  
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
  
  
  update auth.users
  set confirmed_at = now(), email_confirmed_at = now()
  where id = target_user_id and confirmed_at is null;
end;
$$;

grant execute on function admin_update_password(uuid, text) to authenticated;
grant execute on function admin_update_password(uuid, text) to service_role;
