grant all on table public.users to authenticated;
grant all on table public.users to service_role;

alter table public.users enable row level security;

drop policy if exists "Enable all for authenticated users" on public.users;
drop policy if exists "Enable insert for authenticated users" on public.users;
drop policy if exists "Enable update for authenticated users" on public.users;
drop policy if exists "Enable read access for all users" on public.users;
drop policy if exists "Enable delete for authenticated users" on public.users;

create policy "Enable all for authenticated users"
  on public.users
  for all
  to authenticated
  using (true)
  with check (true);