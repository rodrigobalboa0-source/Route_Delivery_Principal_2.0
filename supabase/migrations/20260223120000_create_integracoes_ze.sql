create table if not exists public.integracoes_ze (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  merchant_id text not null,
  api_key text,
  status text not null default 'ativo' check (status in ('ativo','inativo','erro')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integracoes_ze enable row level security;

create policy "Admins can view ze integrations"
  on public.integracoes_ze for select
  to authenticated
  using (
    auth.uid() in (select id from public.users where role in ('admin','operador'))
  );

create policy "Admins can insert ze integrations"
  on public.integracoes_ze for insert
  with check (
    auth.uid() in (select id from public.users where role in ('admin','operador'))
  );

create policy "Admins can update ze integrations"
  on public.integracoes_ze for update
  using (
    auth.uid() in (select id from public.users where role in ('admin','operador'))
  );

create policy "Admins can delete ze integrations"
  on public.integracoes_ze for delete
  using (
    auth.uid() in (select id from public.users where role in ('admin','operador'))
  );

create trigger update_integracoes_ze_modtime
  before update on public.integracoes_ze
  for each row execute procedure update_updated_at_column();
