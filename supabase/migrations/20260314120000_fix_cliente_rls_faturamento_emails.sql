create or replace function public.user_can_access_cliente(target_cliente_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_admin()
  or exists (
    select 1
    from public.users u
    join public.clientes c on c.id = target_cliente_id
    where u.id = auth.uid()
      and u.role = 'cliente'
      and (
        u.cliente_id = c.id
        or (u.email is not null and c.email is not null and lower(u.email) = lower(c.email))
        or exists (
          select 1
          from unnest(coalesce(c.faturamento_emails, '{}'::text[])) em
          where u.email is not null and lower(em) = lower(u.email)
        )
      )
  );
$$;

drop policy if exists clientes_tenant_select on public.clientes;
create policy clientes_tenant_select
  on public.clientes
  for select
  to authenticated
  using (public.user_can_access_cliente(public.clientes.id));

drop policy if exists clientes_tenant_insert on public.clientes;
create policy clientes_tenant_insert
  on public.clientes
  for insert
  to authenticated
  with check (public.user_can_access_cliente(public.clientes.id));

drop policy if exists clientes_tenant_update on public.clientes;
create policy clientes_tenant_update
  on public.clientes
  for update
  to authenticated
  using (public.user_can_access_cliente(public.clientes.id))
  with check (public.user_can_access_cliente(public.clientes.id));

drop policy if exists clientes_tenant_delete on public.clientes;
create policy clientes_tenant_delete
  on public.clientes
  for delete
  to authenticated
  using (public.user_can_access_cliente(public.clientes.id));

drop policy if exists cliente_enderecos_tenant_select on public.cliente_enderecos;
create policy cliente_enderecos_tenant_select
  on public.cliente_enderecos
  for select
  to authenticated
  using (public.user_can_access_cliente(public.cliente_enderecos.cliente_id));

drop policy if exists cliente_enderecos_tenant_insert on public.cliente_enderecos;
create policy cliente_enderecos_tenant_insert
  on public.cliente_enderecos
  for insert
  to authenticated
  with check (public.user_can_access_cliente(public.cliente_enderecos.cliente_id));

drop policy if exists cliente_enderecos_tenant_update on public.cliente_enderecos;
create policy cliente_enderecos_tenant_update
  on public.cliente_enderecos
  for update
  to authenticated
  using (public.user_can_access_cliente(public.cliente_enderecos.cliente_id))
  with check (public.user_can_access_cliente(public.cliente_enderecos.cliente_id));

drop policy if exists cliente_enderecos_tenant_delete on public.cliente_enderecos;
create policy cliente_enderecos_tenant_delete
  on public.cliente_enderecos
  for delete
  to authenticated
  using (public.user_can_access_cliente(public.cliente_enderecos.cliente_id));

drop policy if exists pedidos_tenant_select on public.pedidos;
create policy pedidos_tenant_select
  on public.pedidos
  for select
  to authenticated
  using (public.user_can_access_cliente(public.pedidos.cliente_id));

drop policy if exists pedidos_tenant_insert on public.pedidos;
create policy pedidos_tenant_insert
  on public.pedidos
  for insert
  to authenticated
  with check (public.user_can_access_cliente(public.pedidos.cliente_id));

drop policy if exists pedidos_tenant_update on public.pedidos;
create policy pedidos_tenant_update
  on public.pedidos
  for update
  to authenticated
  using (public.user_can_access_cliente(public.pedidos.cliente_id))
  with check (public.user_can_access_cliente(public.pedidos.cliente_id));

drop policy if exists pedidos_tenant_delete on public.pedidos;
create policy pedidos_tenant_delete
  on public.pedidos
  for delete
  to authenticated
  using (public.user_can_access_cliente(public.pedidos.cliente_id));

drop policy if exists nova_entrega_tenant_select on public.nova_entrega;
create policy nova_entrega_tenant_select
  on public.nova_entrega
  for select
  to authenticated
  using (
    public.is_admin()
    or public.user_can_access_cliente(public.nova_entrega.cliente_id)
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'entregador'
        and (
          exists (
            select 1
            from public.entregadores e
            where lower(e.email) = lower(u.email)
              and e.id = public.nova_entrega.entregador_id
          )
          or (public.nova_entrega.entregador_id is null and public.nova_entrega.status = 'criada')
        )
    )
  );

drop policy if exists nova_entrega_tenant_insert on public.nova_entrega;
create policy nova_entrega_tenant_insert
  on public.nova_entrega
  for insert
  to authenticated
  with check (
    public.is_admin()
    or public.user_can_access_cliente(public.nova_entrega.cliente_id)
  );

drop policy if exists nova_entrega_tenant_update on public.nova_entrega;
create policy nova_entrega_tenant_update
  on public.nova_entrega
  for update
  to authenticated
  using (
    public.is_admin()
    or public.user_can_access_cliente(public.nova_entrega.cliente_id)
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'entregador'
        and exists (
          select 1
          from public.entregadores e
          where lower(e.email) = lower(u.email)
            and e.id = public.nova_entrega.entregador_id
        )
    )
  )
  with check (
    public.is_admin()
    or public.user_can_access_cliente(public.nova_entrega.cliente_id)
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'entregador'
        and (
          exists (
            select 1
            from public.entregadores e
            where lower(e.email) = lower(u.email)
              and e.id = public.nova_entrega.entregador_id
          )
          or (public.nova_entrega.entregador_id is null and public.nova_entrega.status = 'criada')
        )
    )
  );

drop policy if exists nova_entrega_tenant_delete on public.nova_entrega;
create policy nova_entrega_tenant_delete
  on public.nova_entrega
  for delete
  to authenticated
  using (
    public.is_admin()
    or public.user_can_access_cliente(public.nova_entrega.cliente_id)
  );
