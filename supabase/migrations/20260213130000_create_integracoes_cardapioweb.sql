CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create table if not exists public.clientes (
    id uuid primary key default gen_random_uuid(),
    nome_completo text not null,
    cpf text,
    data_nascimento date,
    telefone text,
    email text unique,
    metodo_pagamento_preferido text,
    observacoes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

alter table public.clientes enable row level security;

create table if not exists public.integracoes_cardapioweb (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid references public.clientes(id) on delete cascade not null,
    merchant_id text not null,
    merchant_secret text,
    status text default 'ativo' check (status in ('ativo', 'inativo', 'erro')),
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(cliente_id)
);

alter table public.integracoes_cardapioweb enable row level security;

create policy "Admins can view all cardapioweb integrations"
    on public.integracoes_cardapioweb for select
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can insert cardapioweb integrations"
    on public.integracoes_cardapioweb for insert
    with check (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can update cardapioweb integrations"
    on public.integracoes_cardapioweb for update
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can delete cardapioweb integrations"
    on public.integracoes_cardapioweb for delete
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create trigger update_integracoes_cardapioweb_modtime
    before update on public.integracoes_cardapioweb
    for each row execute procedure update_updated_at_column();