create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      lower(coalesce(nullif(auth.jwt() ->> 'role', ''), '')) in ('admin', 'operador')
      or exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and lower(coalesce(u.role, '')) in ('admin', 'operador')
      )
    );
$$;

create or replace function public.user_can_access_cliente(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      auth.uid() as uid,
      lower(trim(coalesce(
        (select u.email from public.users u where u.id = auth.uid()),
        auth.jwt() ->> 'email',
        ''
      ))) as email,
      (select u.cliente_id from public.users u where u.id = auth.uid()) as cliente_id
  )
  select
    (select uid is not null from me)
    and (
      public.is_admin()
      or (select cliente_id from me) = target_cliente_id
      or (
        (select email from me) <> ''
        and exists (
          select 1
          from public.clientes c
          where c.id = target_cliente_id
            and (
              lower(trim(coalesce(c.email, ''))) = (select email from me)
              or exists (
                select 1
                from unnest(coalesce(c.faturamento_emails, '{}'::text[])) em
                where lower(trim(em)) = (select email from me)
              )
            )
        )
      )
    );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.user_can_access_cliente(uuid) to authenticated;
