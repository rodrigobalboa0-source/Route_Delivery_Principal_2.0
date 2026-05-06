create extension if not exists pgcrypto;

create or replace function admin_update_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
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

create table if not exists public.users (
  id uuid references auth.users on delete cascade,
  email text,
  full_name text,
  role text,
  created_at timestamptz default now(),
  primary key (id)
);

alter table public.users enable row level security;

drop policy if exists "Enable insert for authenticated users only" on public.users;
drop policy if exists "Enable read access for all users" on public.users;
drop policy if exists "Enable update for users based on email" on public.users;

create policy "Enable insert for authenticated users"
  on public.users
  for insert
  to authenticated
  with check (true);

create policy "Enable update for authenticated users"
  on public.users
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Enable read access for all users"
  on public.users
  for select
  to authenticated
  using (true);

create policy "Enable delete for authenticated users"
  on public.users
  for delete
  to authenticated
  using (true);