create table public.tabelas_comissoes (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  tipo_calculo text null,
  valor_por_ponto numeric null default 0,
  tipo_retorno text null,
  valor_retorno numeric null default 0,
  cliente_ids jsonb null default '[]'::jsonb,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint tabelas_comissoes_pkey primary key (id)
);

create table public.tabelas_comissoes_faixas (
  id uuid not null default gen_random_uuid(),
  tabela_id uuid not null,
  km_ate numeric not null,
  valor numeric not null,
  created_at timestamptz null default now(),
  constraint tabelas_comissoes_faixas_pkey primary key (id),
  constraint tabelas_comissoes_faixas_tabela_id_fkey foreign key (tabela_id) references public.tabelas_comissoes (id) on delete cascade
);

alter table public.tabelas_comissoes enable row level security;
alter table public.tabelas_comissoes_faixas enable row level security;

create policy "Enable read access for all users" on public.tabelas_comissoes for select using (true);
create policy "Enable insert for authenticated users only" on public.tabelas_comissoes for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.tabelas_comissoes for update using (auth.role() = 'authenticated');
create policy "Enable delete for authenticated users only" on public.tabelas_comissoes for delete using (auth.role() = 'authenticated');

create policy "Enable read access for all users" on public.tabelas_comissoes_faixas for select using (true);
create policy "Enable insert for authenticated users only" on public.tabelas_comissoes_faixas for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.tabelas_comissoes_faixas for update using (auth.role() = 'authenticated');
create policy "Enable delete for authenticated users only" on public.tabelas_comissoes_faixas for delete using (auth.role() = 'authenticated');
