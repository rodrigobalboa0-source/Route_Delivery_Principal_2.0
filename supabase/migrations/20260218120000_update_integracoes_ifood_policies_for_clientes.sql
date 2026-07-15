alter table public.integracoes_ifood enable row level security;

create policy "Clientes podem ver propria integracao iFood"
    on public.integracoes_ifood for select
    using (
        exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and u.role = 'cliente'
              and u.cliente_id = integracoes_ifood.cliente_id
        )
    );