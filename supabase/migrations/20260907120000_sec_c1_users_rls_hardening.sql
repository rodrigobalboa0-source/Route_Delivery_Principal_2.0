-- ============================================================================
-- SEGURANÇA C1 — Endurecimento da RLS de public.users
--
-- Antes: policy "Enable all for authenticated users" ... FOR ALL USING(true)
-- WITH CHECK(true) permitia que QUALQUER usuário autenticado:
--   * lesse todas as linhas de public.users (enumerar admins + pegar UUIDs);
--   * desse UPDATE em qualquer linha;
--   * promovesse a si mesmo a 'operador'/'admin' (is_admin() passa a ser true);
--   * se vinculasse (cliente_id / entregador_id) a um tenant que não é dele.
--
-- Depois:
--   * SELECT: só a própria linha, ou tudo se is_admin();
--   * INSERT/UPDATE/DELETE: própria linha (não-admin) ou qualquer coisa (admin);
--   * um trigger BEFORE INSERT/UPDATE (users_enforce_privileges) impede
--     auto-atribuição de papel privilegiado e vínculo a tenant alheio.
--     Chamadas internas (SECURITY DEFINER / migrations, current_user = postgres/
--     supabase_admin) passam direto — quem provisiona papel de verdade são as
--     RPCs/trigger handle_new_user, não o cliente.
-- ============================================================================

alter table public.users enable row level security;

-- ---------------------------------------------------------------------------
-- 1) Limpa TODAS as policies antigas conhecidas da tabela
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'users'
  loop
    execute format('drop policy if exists %I on public.users', r.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Privilégios de tabela: anon não toca em users; authenticated é escopado
--    pela RLS abaixo (mantemos os 4 verbos porque admin precisa deles).
-- ---------------------------------------------------------------------------
revoke all on table public.users from anon;
grant select, insert, update, delete on table public.users to authenticated;
grant all on table public.users to service_role;

-- ---------------------------------------------------------------------------
-- 3) Policies
-- ---------------------------------------------------------------------------
create policy users_select_self_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy users_insert_self_or_admin on public.users
  for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy users_delete_self_or_admin on public.users
  for delete to authenticated
  using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Trigger de enforcement de privilégio (a parte que a RLS não expressa bem)
-- ---------------------------------------------------------------------------
create or replace function public.users_enforce_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_email text;
begin
  -- session_user identifica a CONEXÃO. O PostgREST conecta sempre como
  -- 'authenticator' (e depois SET ROLE authenticated/anon/service_role). Toda
  -- outra conexão (postgres nas migrations, supabase_auth_admin no trigger do
  -- GoTrue, supabase_admin) é infraestrutura confiável -> não enforce.
  if session_user <> 'authenticator' then
    return new;
  end if;

  -- Requisição com a service key (JWT role=service_role): confiável.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  -- Daqui pra baixo: requisição de usuário final (authenticated/anon).
  -- Admin de verdade pode tudo (painel "Dados de Acesso").
  if public.is_admin() then
    return new;
  end if;

  v_caller_email := lower(trim(coalesce(
    new.email,
    (select u.email from auth.users u where u.id = auth.uid()),
    ''
  )));

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid() then
      raise exception 'users: só é permitido criar a sua própria linha';
    end if;
    if coalesce(new.role, '') in ('admin', 'operador') then
      raise exception 'users: não é permitido se auto-atribuir papel privilegiado';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.id is distinct from auth.uid() then
      raise exception 'users: só é permitido alterar a sua própria linha';
    end if;
    if new.role is distinct from old.role then
      if coalesce(new.role, '') in ('admin', 'operador')
         or coalesce(old.role, '') in ('admin', 'operador') then
        raise exception 'users: mudança de papel privilegiado só por admin';
      end if;
    end if;
  end if;

  -- Vínculo a comércio: só se o e-mail do usuário casa com o cadastro do cliente
  if new.cliente_id is not null
     and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id) then
    if v_caller_email = '' or not exists (
      select 1 from public.clientes c
      where c.id = new.cliente_id
        and (
          lower(trim(coalesce(c.email, ''))) = v_caller_email
          or exists (
            select 1 from unnest(coalesce(c.faturamento_emails, '{}'::text[])) em
            where lower(trim(em)) = v_caller_email
          )
        )
    ) then
      raise exception 'users: não é permitido se vincular a um comércio que não é seu';
    end if;
  end if;

  -- Vínculo a entregador: idem, por e-mail
  if new.entregador_id is not null
     and (tg_op = 'INSERT' or new.entregador_id is distinct from old.entregador_id) then
    if v_caller_email = '' or not exists (
      select 1 from public.entregadores e
      where e.id = new.entregador_id
        and lower(trim(coalesce(e.email, ''))) = v_caller_email
    ) then
      raise exception 'users: não é permitido se vincular a um entregador que não é seu';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.users_enforce_privileges() from public;

drop trigger if exists trg_users_enforce_privileges on public.users;
create trigger trg_users_enforce_privileges
  before insert or update on public.users
  for each row execute function public.users_enforce_privileges();

-- ---------------------------------------------------------------------------
-- 5) Auditoria de dados (NÃO muta nada): lista contas com papel privilegiado
--    que NÃO têm linha correspondente em public.contas_gerenciais. Revise
--    manualmente e rebaixe as que não reconhecer:
--      update public.users set role = 'cliente' where id = '<uuid suspeito>';
-- ---------------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in
    select u.id, u.email, u.role
    from public.users u
    where u.role in ('admin', 'operador')
      and not exists (
        select 1 from public.contas_gerenciais cg
        where lower(trim(coalesce(cg.email_acesso, ''))) = lower(trim(coalesce(u.email, '')))
      )
  loop
    n := n + 1;
    raise warning 'AUDITORIA C1: conta % (%) tem role=% sem contas_gerenciais correspondente', r.email, r.id, r.role;
  end loop;
  if n = 0 then
    raise notice 'AUDITORIA C1: nenhuma conta privilegiada órfã encontrada.';
  else
    raise warning 'AUDITORIA C1: % conta(s) privilegiada(s) para revisar manualmente.', n;
  end if;
end $$;
