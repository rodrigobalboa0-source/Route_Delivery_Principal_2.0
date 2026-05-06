create table if not exists public.promocoes (
  id uuid not null default gen_random_uuid(),
  descricao text not null,
  imagem_url text,
  ativa boolean default true,
  created_at timestamptz default now(),
  constraint promocoes_pkey primary key (id)
);

alter table public.promocoes enable row level security;

create policy "Allow read active promotions for authenticated users"
  on public.promocoes for select
  to authenticated
  using (ativa = true);

create policy "Allow all for admins"
  on public.promocoes for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'operador')
    )
  );

-- Create storage bucket if not exists
insert into storage.buckets (id, name, public)
values ('promocoes', 'promocoes', true)
on conflict (id) do nothing;

create policy "Give public access to promocoes bucket"
  on storage.objects for select
  using ( bucket_id = 'promocoes' );

create policy "Allow uploads to promocoes bucket for admins"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'promocoes' and
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'operador')
    )
  );

create policy "Allow updates to promocoes bucket for admins"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'promocoes' and
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'operador')
    )
  );

create policy "Allow delete from promocoes bucket for admins"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'promocoes' and
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and users.role in ('admin', 'operador')
    )
  );
