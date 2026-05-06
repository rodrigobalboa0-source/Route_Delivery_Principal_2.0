create table public.configuracoes_comercio (
  id uuid not null default gen_random_uuid(),
  permitir_cadastro_entregador boolean default true,
  exigir_aprovacao_entregador boolean default true,
  limite_entregas_simultaneas integer default 1,
  raio_busca_entregador integer default 10,
  tempo_aceite_pedido integer default 30,
  permissoes_padrao_cliente jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint configuracoes_comercio_pkey primary key (id)
);

create table public.customizacao_app (
  id uuid not null default gen_random_uuid(),
  nome_app text default 'RouteDelivery',
  cor_primaria text default '#0284c7',
  cor_secundaria text default '#0f172a',
  logotipo_url text,
  texto_boas_vindas text default 'Bem-vindo ao RouteDelivery',
  texto_rodape text default '© 2025 RouteDelivery. Todos os direitos reservados.',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint customizacao_app_pkey primary key (id)
);

create table public.usuarios_permissoes (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  permissoes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint usuarios_permissoes_pkey primary key (id),
  constraint usuarios_permissoes_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade,
  constraint usuarios_permissoes_user_id_key unique (user_id)
);

alter table public.configuracoes_comercio enable row level security;
alter table public.customizacao_app enable row level security;
alter table public.usuarios_permissoes enable row level security;

create policy "Leitura pública configuracoes_comercio" on public.configuracoes_comercio for select using (true);
create policy "Escrita admin configuracoes_comercio" on public.configuracoes_comercio for all using (auth.role() = 'authenticated' and public.is_admin());

create policy "Leitura pública customizacao_app" on public.customizacao_app for select using (true);
create policy "Escrita admin customizacao_app" on public.customizacao_app for all using (auth.role() = 'authenticated' and public.is_admin());

create policy "Leitura pública usuarios_permissoes" on public.usuarios_permissoes for select using (true);
create policy "Escrita admin usuarios_permissoes" on public.usuarios_permissoes for all using (auth.role() = 'authenticated' and public.is_admin());