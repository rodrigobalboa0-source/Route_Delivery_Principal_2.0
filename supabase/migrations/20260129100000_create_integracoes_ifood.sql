create table if not exists public.integracoes_ifood (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid references public.clientes(id) on delete cascade not null,
    merchant_id text,
    client_id text,
    client_secret text,
    status text default 'inativo' check (status in ('ativo', 'inativo', 'erro')),
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);


alter table public.integracoes_ifood enable row level security;


create policy "Admins can view all integrations"
    on public.integracoes_ifood for select
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can insert integrations"
    on public.integracoes_ifood for insert
    with check (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can update integrations"
    on public.integracoes_ifood for update
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );

create policy "Admins can delete integrations"
    on public.integracoes_ifood for delete
    using (
        auth.uid() in (
            select id from public.users where role in ('admin', 'operador')
        )
    );


create trigger update_integracoes_ifood_modtime
    before update on public.integracoes_ifood
    for each row execute procedure update_updated_at_column();