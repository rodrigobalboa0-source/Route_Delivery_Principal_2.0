create or replace function public.resolve_my_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      lower(trim(coalesce(
        (select u.email from public.users u where u.id = auth.uid()),
        auth.jwt() ->> 'email',
        ''
      ))) as email
  )
  select c.id
  from public.clientes c
  join me on me.email <> ''
  where
    lower(trim(coalesce(c.email, ''))) = me.email
    or exists (
      select 1
      from unnest(coalesce(c.faturamento_emails, '{}'::text[])) em
      where lower(trim(em)) = me.email
    )
  order by c.created_at desc nulls last
  limit 1;
$$;

grant execute on function public.resolve_my_cliente_id() to authenticated;