create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_role text;
begin

  
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.users (id, email, full_name, role)
select 
  au.id, 
  au.email, 
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
  case 
    when coalesce(au.raw_user_meta_data->>'role', '') in ('admin','operador','cliente','entregador') then au.raw_user_meta_data->>'role'
    when exists (select 1 from public.entregadores e where lower(e.email) = lower(au.email)) then 'entregador'
    when exists (select 1 from public.clientes c where lower(c.email) = lower(au.email)) then 'cliente'
    else 'cliente'
  end
from auth.users au
on conflict (id) do nothing;