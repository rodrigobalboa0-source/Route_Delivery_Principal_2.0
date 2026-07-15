create table if not exists public.entregador_bloqueios_clientes (
    id uuid primary key default gen_random_uuid(),
    entregador_id uuid not null references public.entregadores(id) on delete cascade,
    cliente_id uuid not null references public.clientes(id) on delete cascade,
    motivo text,
    created_at timestamptz default now(),
    created_by uuid references auth.users(id),
    unique(entregador_id, cliente_id)
);

alter table public.entregador_bloqueios_clientes enable row level security;

create policy "Admins and Operators can manage blacklists"
    on public.entregador_bloqueios_clientes
    for all
    to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.role in ('admin', 'operador')
        )
    );

create policy "Users can view blacklists"
    on public.entregador_bloqueios_clientes
    for select
    to authenticated
    using (true);