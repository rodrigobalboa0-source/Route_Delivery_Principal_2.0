alter table public.configuracoes_comercio
add column if not exists permitir_alocar_entregador boolean default false;
