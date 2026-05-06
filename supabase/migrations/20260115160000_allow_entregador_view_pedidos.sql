do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'pedidos' 
    and policyname = 'Entregadores podem ver pedidos'
  ) then
    create policy "Entregadores podem ver pedidos"
    on public.pedidos
    for select
    to authenticated
    using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()
        and u.role = 'entregador'
      )
    );
  end if;
end
$$;