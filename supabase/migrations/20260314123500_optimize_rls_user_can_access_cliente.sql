create or replace function public.user_can_access_cliente(target_cliente_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_admin()
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'cliente'
      and (
        u.cliente_id = target_cliente_id
        or (
          u.email is not null
          and exists (
            select 1
            from public.clientes c
            where c.id = target_cliente_id
              and (
                (c.email is not null and lower(c.email) = lower(u.email))
                or exists (
                  select 1
                  from unnest(coalesce(c.faturamento_emails, '{}'::text[])) em
                  where lower(em) = lower(u.email)
                )
              )
          )
        )
      )
  );
$$;
