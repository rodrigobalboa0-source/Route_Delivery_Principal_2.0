-- ============================================================================
-- SEGURANÇA A3 — trancar RPCs SECURITY DEFINER perigosas
--
-- No Postgres toda função nasce com EXECUTE para PUBLIC. O PostgREST expõe
-- funções do schema public como RPC, então qualquer função SECURITY DEFINER
-- sem "revoke ... from public" é chamável por anon.
--
-- 1) delete_user_by_email_case_insensitive: apagava linhas de public.users sem
--    checar nada e sem revoke -> anon podia apagar contas via /rest/v1/rpc.
-- 2) get_cliente_public_info: sem revoke from public -> vazava nome/foto do
--    cliente por uuid para anon.
-- 3) default privileges: novas funções não nascem mais expostas a PUBLIC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) delete_user_by_email_case_insensitive — só admin
-- ---------------------------------------------------------------------------
create or replace function public.delete_user_by_email_case_insensitive(email_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.users where lower(email) = lower(email_input);
end;
$$;

revoke all on function public.delete_user_by_email_case_insensitive(text) from public, anon;
grant execute on function public.delete_user_by_email_case_insensitive(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) get_cliente_public_info — mantém só authenticated
-- ---------------------------------------------------------------------------
create or replace function public.get_cliente_public_info(cid uuid)
returns table (nome_completo text, foto_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select c.nome_completo, c.foto_url
  from public.clientes c
  where c.id = cid;
end;
$$;

revoke all on function public.get_cliente_public_info(uuid) from public, anon;
grant execute on function public.get_cliente_public_info(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Higiene: novas funções do schema public não nascem executáveis por PUBLIC.
--    NÃO afeta funções já existentes — essas precisam ser auditadas uma a uma
--    (com acesso ao banco), ver SEGURANCA-RUNBOOK.md secção "A3 - auditoria".
--    Query para listar as candidatas:
--      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--             p.prosecdef as security_definer,
--             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_pode
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.prosecdef
--      order by anon_pode desc, p.proname;
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
