create extension if not exists pgcrypto schema extensions;

create or replace function admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
  where id = target_user_id;
end;
$$;

revoke all on function admin_update_password(uuid, text) from public;
grant execute on function admin_update_password(uuid, text) to authenticated;
grant execute on function admin_update_password(uuid, text) to service_role;