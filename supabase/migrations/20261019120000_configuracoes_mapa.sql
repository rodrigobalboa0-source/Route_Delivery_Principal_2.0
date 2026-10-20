-- Configuração global de Mapa / Geolocalização (aba Configurações):
-- escolher o provedor da geolocalização (Google ou OpenStreetMap) e a chave.
-- O mapa (tiles) é sempre OpenStreetMap. Tabela de linha única.

create table if not exists public.configuracoes_mapa (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openstreetmap', -- 'google' | 'openstreetmap'
  google_maps_api_key text,
  google_maps_map_id text,
  updated_at timestamptz not null default now()
);

alter table public.configuracoes_mapa enable row level security;

drop policy if exists configuracoes_mapa_select on public.configuracoes_mapa;
create policy configuracoes_mapa_select
  on public.configuracoes_mapa for select
  to authenticated
  using (true);

drop policy if exists configuracoes_mapa_write on public.configuracoes_mapa;
create policy configuracoes_mapa_write
  on public.configuracoes_mapa for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.configuracoes_mapa (provider)
select 'openstreetmap'
where not exists (select 1 from public.configuracoes_mapa);
