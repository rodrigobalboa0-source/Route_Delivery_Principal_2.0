-- ============================================================================
-- SEGURANÇA A6 — tirar 'grant all ... to anon' das tabelas de configuração
--
-- 20251210150000_fix_missing_tables.sql fez:
--   grant all on public.configuracoes_comercio to anon, authenticated, service_role;
--   grant all on public.customizacao_app     to anon, ...;
--   grant all on public.usuarios_permissoes  to anon, ...;
--
-- Hoje a RLS ("Escrita admin ...") já bloqueia escrita de anon, mas 'grant all'
-- deixa o sistema a um erro de policy de distância do desastre. Removemos os
-- privilégios de escrita de anon (mantendo SELECT onde o app precisa) e
-- restringimos a leitura de usuarios_permissoes a usuários autenticados.
-- ============================================================================

-- configuracoes_comercio / customizacao_app: leitura pública continua (a tela
-- de login/cadastro usa para branding). Só escrita sai de anon.
revoke insert, update, delete, truncate, references, trigger
  on public.configuracoes_comercio from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.customizacao_app from anon;

-- usuarios_permissoes: anon não tem nada que fazer aqui.
revoke all on public.usuarios_permissoes from anon;

drop policy if exists "Leitura pública usuarios_permissoes" on public.usuarios_permissoes;
create policy "Leitura usuarios_permissoes autenticado"
  on public.usuarios_permissoes
  for select
  to authenticated
  using (true);
