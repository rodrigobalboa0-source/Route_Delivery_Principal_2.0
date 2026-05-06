alter table public.entregadores enable row level security;
alter table public.nova_entrega enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'entregadores' 
    and policyname = 'Enable read access for all authenticated users'
  ) then
    create policy "Enable read access for all authenticated users"
    on "public"."entregadores"
    as permissive
    for select
    to authenticated
    using (true);
  end if;
end
$$;


do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'nova_entrega' 
    and policyname = 'Enable read access for all authenticated users'
  ) then
    create policy "Enable read access for all authenticated users"
    on "public"."nova_entrega"
    as permissive
    for select
    to authenticated
    using (true);
  end if;
end
$$;

create or replace function get_active_delivery_persons()
returns setof public.entregadores
language sql
security definer
as $$
  select * from public.entregadores
  where status = 'ativo'
  order by nome_completo;
$$;

grant execute on function get_active_delivery_persons() to authenticated;
grant execute on function get_active_delivery_persons() to service_role;